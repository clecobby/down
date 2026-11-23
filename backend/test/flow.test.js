// The whole user journey through the API, with Cognito stubbed. Runs on SQLite by default, or against
// Aurora DSQL with DSQL_HOST set (it only touches rows it creates, and removes them). Run: npm test
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.DSQL_HOST) process.env.DB_PATH = path.join(os.tmpdir(), `down-flow-test-${process.pid}.db`);
process.env.DEMO_MODE = '0';

const { sql } = await import('../src/db.js');
// Stand in for Cognito: x-test-sub is the caller's Cognito id.
mock.module('../src/auth.js', {
  namedExports: {
    requireIdentity: (req, res, next) => {
      const sub = req.headers['x-test-sub'];
      req.identity = { sub, email: `${sub}@flow.test`, isAdmin: false };
      next();
    },
    requireAuth: async (req, res, next) => {
      req.identity = { sub: req.headers['x-test-sub'], isAdmin: false };
      req.user = await sql.one('SELECT * FROM users WHERE cognito_sub = ?', req.identity.sub);
      if (!req.user) return res.status(404).json({ needsProfile: true });
      next();
    },
    requireAdmin: (req, res) => res.status(403).end(),
  },
});
const { app } = await import('../src/server.js');

const run = Date.now().toString(36);
const A = `flow-a-${run}`, B = `flow-b-${run}`, C = `flow-c-${run}`;
let base, server;
before(async () => {
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await sql.run('DELETE FROM users WHERE cognito_sub IN (?, ?, ?)', A, B, C);
  if (process.env.DB_PATH) for (const f of ['', '-shm', '-wal']) fs.rmSync(process.env.DB_PATH + f, { force: true });
  await sql.end();
});

const as = async (sub, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'x-test-sub': sub, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const profile = (name, gender, into) => ({ name, username: `${name.toLowerCase()}_${run}`.slice(0, 20), birthdate: '1992-05-05', gender, interestedIn: [into] });

let aId, bId, matchId;

test('sign up: profiles, age and username rules', async () => {
  assert.equal((await as(A, '/me')).status, 404);
  assert.equal((await as(A, '/profile', 'POST', { ...profile('Ann', 'woman', 'man'), birthdate: '2015-01-01' })).status, 400);
  const a = await as(A, '/profile', 'POST', profile('Ann', 'woman', 'man'));
  assert.equal(a.status, 200);
  aId = a.body.id;
  assert.equal((await as(C, '/profile', 'POST', profile('Ann', 'man', 'woman'))).status, 409, 'username taken');
  const b = await as(B, '/profile', 'POST', profile('Ben', 'man', 'woman'));
  bId = b.body.id;
  assert.equal((await as(A, '/profile', 'POST', profile('Ann', 'woman', 'man'))).status, 409, 'one profile per account');
});

test('edit profile: turn-ons, tags, height', async () => {
  const r = await as(A, '/me', 'PATCH', { turnOns: ['kissing', 'oral', 'nope'], tags: ['Tonight', 'x'], heightCm: 170, bio: 'hi' });
  assert.deepEqual(r.body.turnOns, ['kissing', 'oral']);
  assert.deepEqual(r.body.tags, ['Tonight']);
  assert.equal(r.body.heightCm, 170);
  assert.equal((await as(A, '/me', 'PATCH', { heightCm: 999 })).status, 400);
  await as(B, '/me', 'PATCH', { turnOns: ['oral', 'toys'] });
});

test('people without a photo stay out of discover', async () => {
  assert.ok(!(await as(B, '/discover')).body.some((u) => u.id === aId), 'no photo yet');
  await sql.run("UPDATE users SET photo = '/uploads/test.jpg' WHERE id IN (?, ?)", aId, bId);
});

test('discover shows each other with the overlap only', async () => {
  const d = (await as(B, '/discover')).body;
  const ann = d.find((u) => u.id === aId);
  assert.ok(ann, 'Ann is in Ben’s deck');
  assert.deepEqual(ann.inCommon.map((t) => t.id), ['oral']);
  assert.ok(!('turnOns' in ann) && !('email' in ann));
});

test('a like each way makes one match, first time is new', async () => {
  assert.equal((await as(A, '/swipe', 'POST', { userId: bId, dir: 'like' })).body.match, null);
  const m = (await as(B, '/swipe', 'POST', { userId: aId, dir: 'like' })).body.match;
  assert.equal(m.isNew, true);
  matchId = m.id;
  assert.equal((await as(B, '/swipe', 'POST', { userId: aId, dir: 'like' })).body.match.isNew, false);
  assert.ok(!(await as(A, '/discover')).body.some((u) => u.id === bId), 'swiped people leave the deck');
});

test('chat, meetup, and the private down signal', async () => {
  const msg = await as(A, `/matches/${matchId}/messages`, 'POST', { body: 'hey' });
  assert.equal(msg.body.body, 'hey');
  await as(B, `/matches/${matchId}/meetups`, 'POST', { place: 'Bar', time: new Date(Date.now() + 3600e3).toISOString() });
  const chat = (await as(A, `/matches/${matchId}`)).body;
  assert.equal(chat.messages[0].body, 'hey');
  const mu = chat.meetups[0];
  assert.equal((await as(B, `/matches/${matchId}/meetups/${mu.id}`, 'POST', { status: 'accepted' })).status, 400, "can't accept your own");
  assert.equal((await as(A, `/matches/${matchId}/meetups/${mu.id}`, 'POST', { status: 'accepted' })).status, 200);
  await as(A, `/matches/${matchId}/down`, 'POST');
  assert.equal((await as(B, `/matches/${matchId}`)).body.down.both, false);
  assert.equal((await as(B, `/matches/${matchId}/down`, 'POST')).body.both, true);
  const list = (await as(A, '/matches')).body;
  assert.equal(list[0].lastMessage, 'hey');
  assert.equal(list[0].bothDown, true);
});

test('strangers cannot read the chat', async () => {
  await as(C, '/profile', 'POST', profile('Cat', 'man', 'woman'));
  assert.equal((await as(C, `/matches/${matchId}`)).status, 404);
});

test('report blocks and unmatches; delete removes everything', async () => {
  assert.equal((await as(A, '/report', 'POST', { userId: bId, reason: 'test' })).status, 200);
  assert.equal((await as(A, '/matches')).body.length, 0);
  assert.equal((await as(B, '/matches')).body.length, 0);
  assert.ok(!(await as(B, '/discover')).body.some((u) => u.id === aId), 'blocked people disappear both ways');
  assert.equal((await as(A, '/me', 'DELETE')).status, 200);
  assert.equal((await as(A, '/me')).status, 404);
  assert.equal(await sql.one('SELECT 1 FROM swipes WHERE from_id = ? OR to_id = ?', aId, aId), undefined, 'cascade removed swipes');
});
