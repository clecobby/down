// Safety: live location between matches, friend links, SOS, deletion and holds. Runs on SQLite by
// default, or against Aurora DSQL with DSQL_HOST set (only touches rows it creates, and removes them). Run: npm test
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.DSQL_HOST) process.env.DB_PATH = path.join(os.tmpdir(), `down-safety-test-${process.pid}.db`);
process.env.DEMO_MODE = '0';

const { sql } = await import('../src/db.js');
mock.module('../src/auth.js', {
  namedExports: {
    requireIdentity: (req, res, next) => {
      const sub = req.headers['x-test-sub'];
      req.identity = { sub, email: `${sub}@safety.test`, isAdmin: false };
      next();
    },
    requireAuth: async (req, res, next) => {
      req.identity = { sub: req.headers['x-test-sub'], isAdmin: false, email: 'admin@test' };
      req.user = await sql.one('SELECT * FROM users WHERE cognito_sub = ?', req.identity.sub);
      if (!req.user) return res.status(404).json({ needsProfile: true });
      next();
    },
    requireAdmin: (req, res, next) => {
      req.identity = { email: 'admin@test', sub: 'admin', isAdmin: true };
      next();
    },
  },
});
const { app } = await import('../src/server.js');
const { tidy } = await import('../src/safety.js');

let base, server;
before(async () => {
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  server.close();
  const ids = [aId, bId, cId].filter(Boolean);
  if (ids.length) {
    const inIds = `(${ids.join(',')})`;
    await sql.run(`DELETE FROM location_points WHERE user_id IN ${inIds}`);
    await sql.run(`DELETE FROM live_shares WHERE a_id IN ${inIds} OR b_id IN ${inIds}`);
    await sql.run(`DELETE FROM sos_alerts WHERE user_id IN ${inIds}`);
    await sql.run(`DELETE FROM admin_log WHERE admin = 'admin@test' AND (target LIKE 'report:%' OR target LIKE 'sos:%' OR target IN (${ids.map((i) => `'${i}'`).join(',')}))`);
    await sql.run(`DELETE FROM users WHERE id IN ${inIds}`);
  }
  await sql.end();
  if (process.env.DB_PATH) for (const f of ['', '-shm', '-wal']) fs.rmSync(process.env.DB_PATH + f, { force: true });
});

const as = async (sub, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'x-test-sub': sub, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const run = Date.now().toString(36);
const A = `safe-a-${run}`, B = `safe-b-${run}`, C = `safe-c-${run}`;
const HOME = { lat: 40.71, lng: -74.0 };
let aId, bId, cId, matchId;
const mine = () => `user_id IN (${[aId, bId, cId].join(',')})`;

test('setup: two matched people', async () => {
  const mk = async (sub, name, gender, into) =>
    (await as(sub, '/profile', 'POST', { name, username: `${name.toLowerCase()}_${run}`.slice(0, 20), birthdate: '1990-01-01', gender, interestedIn: [into] })).body.id;
  aId = await mk(A, 'Ann', 'woman', 'man');
  bId = await mk(B, 'Ben', 'man', 'woman');
  cId = await mk(C, 'Cal', 'man', 'woman');
  await as(A, '/swipe', 'POST', { userId: bId, dir: 'like' });
  matchId = (await as(B, '/swipe', 'POST', { userId: aId, dir: 'like' })).body.match.id;
  assert.ok(matchId);
});

test('nobody shares until the other person accepts', async () => {
  assert.equal((await as(A, '/safety/location', 'POST', HOME)).status, 409, 'nothing to share yet');
  const started = (await as(A, `/matches/${matchId}/live`, 'POST')).body.live;
  assert.equal(started.status, 'pending');
  assert.equal(started.startedByMe, true);
  assert.equal((await as(A, `/matches/${matchId}/live/accept`, 'POST')).status, 400, "can't accept your own invite");
  assert.equal((await as(A, '/safety/location', 'POST', HOME)).status, 409, 'pending is not sharing');
  assert.equal((await as(C, `/matches/${matchId}/live`)).status, 404, 'outsiders see nothing');
  const chat = (await as(B, `/matches/${matchId}`)).body;
  assert.equal(chat.live.status, 'pending');
  assert.equal(chat.live.startedByMe, false);
});

test('once accepted, each sees the other moving', async () => {
  const live = (await as(B, `/matches/${matchId}/live/accept`, 'POST')).body.live;
  assert.equal(live.status, 'active');
  assert.ok(live.endsAt - Date.now() > 2.9 * 3600_000);
  await as(A, '/safety/location', 'POST', { lat: 40.7, lng: -74.0, acc: 8 });
  await as(A, '/safety/location', 'POST', { lat: 40.705, lng: -74.0, acc: 8 });
  await as(B, '/safety/location', 'POST', { lat: 40.72, lng: -74.0 });
  const seen = (await as(B, `/matches/${matchId}/live`)).body.live;
  assert.equal(seen.them.lat, 40.705, 'latest point first');
  assert.equal(seen.trail.length, 2);
  assert.equal(seen.me.lat, 40.72);
  assert.ok(seen.distanceKm > 1.6 && seen.distanceKm < 1.7);
});

test('points are encrypted at rest', async () => {
  const rows = await sql.all(`SELECT sealed FROM location_points WHERE ${mine()}`);
  assert.ok(rows.length >= 3);
  for (const r of rows) assert.ok(r.sealed.startsWith('v1.') && !r.sealed.includes('40.7'));
});

test('a friend link shows the latest location without logging in, until revoked', async () => {
  const link = (await as(A, '/safety/friend-link', 'POST', { lat: 40.706, lng: -74.0 })).body;
  const view = await fetch(`${base}/safe/${link.token}`).then((r) => r.json());
  assert.equal(view.name, 'Ann');
  assert.equal(view.last.lat, 40.706);
  assert.ok(!('email' in view) && !('username' in view));
  assert.equal((await fetch(`${base}/safe/not-a-token`)).status, 410);
  await as(A, '/safety/friend-link', 'DELETE');
  assert.equal((await fetch(`${base}/safe/${link.token}`)).status, 410);
});

test('"We met" ends it: neither sees the other any more', async () => {
  const ended = (await as(A, `/matches/${matchId}/live/end`, 'POST', { reason: 'met' })).body.live;
  assert.equal(ended, null);
  assert.equal((await as(B, '/safety/location', 'POST', HOME)).status, 409);
  const row = await sql.one('SELECT status, end_reason FROM live_shares WHERE match_id = ?', matchId);
  assert.deepEqual({ ...row }, { status: 'ended', end_reason: 'met' });
});

test('each person can delete only their own trail', async () => {
  const before = Number((await sql.one('SELECT count(*) n FROM location_points WHERE user_id = ?', bId)).n);
  assert.ok(before > 0);
  const r = (await as(A, '/safety/locations', 'DELETE')).body;
  assert.ok(r.deleted >= 3);
  assert.equal(r.held, 0);
  assert.equal(Number((await sql.one('SELECT count(*) n FROM location_points WHERE user_id = ?', aId)).n), 0);
  assert.equal(Number((await sql.one('SELECT count(*) n FROM location_points WHERE user_id = ?', bId)).n), before, "Ben's trail is untouched");
});

test('a report holds both trails, even from their owners, until an admin resolves it', async () => {
  // A fresh share with points from both.
  await as(A, `/matches/${matchId}/live`, 'POST');
  await as(B, `/matches/${matchId}/live/accept`, 'POST');
  await as(A, '/safety/location', 'POST', { lat: 40.701, lng: -74.0 });
  await as(B, '/safety/location', 'POST', { lat: 40.702, lng: -74.0 });

  await as(A, '/report', 'POST', { userId: bId, reason: 'Harassment or threats' });
  const report = await sql.one('SELECT id FROM reports WHERE reporter_id = ? ORDER BY id DESC', aId);
  const ref = `report:${report.id}`;

  const del = (await as(B, '/safety/locations', 'DELETE')).body;
  assert.ok(del.held >= 2, 'Ben cannot wipe his trail while the report is open');
  assert.ok((await as(A, '/safety/locations', 'DELETE')).body.held >= 1);

  // Expired points that are held survive the cleanup.
  await sql.run(`UPDATE location_points SET expires_at = 1 WHERE ${mine()}`);
  await tidy(true);
  assert.ok(Number((await sql.one('SELECT count(*) n FROM location_points WHERE hold = ?', ref)).n) >= 3);

  const list = (await as(A, '/admin/reports')).body;
  assert.ok(list.find((r) => r.id === report.id).held_points >= 3);
  const trail = (await as(A, `/admin/safety/trail?ref=${ref}`)).body;
  assert.deepEqual(trail.people.map((p) => p.userId).sort((x, y) => x - y), [aId, bId].sort((x, y) => x - y));
  assert.ok(await sql.one("SELECT 1 FROM admin_log WHERE action = 'view-location' AND target = ?", ref), 'viewing is logged');

  await as(A, `/admin/reports/${report.id}`, 'POST', { action: 'dismiss' });
  await tidy(true);
  assert.equal(Number((await sql.one(`SELECT count(*) n FROM location_points WHERE ${mine()}`)).n), 0, 'released and past 24h: gone');
  assert.equal((await as(A, `/admin/safety/trail?ref=${ref}`)).status, 404, 'closed cases cannot be opened');
});

test('SOS records where you are and holds it for the admins', async () => {
  const r = (await as(C, '/safety/sos', 'POST', { lat: 40.8, lng: -73.9 })).body;
  assert.ok(r.ok);
  assert.equal((await as(C, '/safety/location', 'POST', { lat: 40.801, lng: -73.9 })).status, 200, 'keeps sending after SOS');
  assert.equal((await as(C, '/safety/locations', 'DELETE')).body.held, 2);
  const mineCase = () => as(A, '/admin/safety').then((x) => x.body.sos.find((c) => c.id === r.id));
  const c = await mineCase();
  assert.equal(c.user.id, cId);
  assert.equal(c.points, 2);
  await as(A, `/admin/sos/${r.id}/resolve`, 'POST');
  assert.equal(await mineCase(), undefined);
});

test('shares end on their own after 3 hours', async () => {
  // The report above unmatched them; match Ann with Cal to try again.
  await as(A, '/swipe', 'POST', { userId: cId, dir: 'like' });
  const m = (await as(C, '/swipe', 'POST', { userId: aId, dir: 'like' })).body.match;
  await as(A, `/matches/${m.id}/live`, 'POST');
  await as(C, `/matches/${m.id}/live/accept`, 'POST');
  await sql.run("UPDATE live_shares SET ends_at = ? WHERE status = 'active' AND match_id = ?", Date.now() - 1, m.id);
  assert.equal((await as(A, `/matches/${m.id}/live`)).body.live, null);
  assert.equal((await as(A, '/safety/location', 'POST', HOME)).status, 409);
});
