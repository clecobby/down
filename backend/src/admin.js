import express from 'express';
import {
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { ageFrom, getSetting, now, photosOf, setSetting, sql } from './db.js';
import { requireAdmin } from './auth.js';
import { deletePhoto } from './storage.js';
import { forgetUser, heldTrail, releaseHold, resolveSos, safetyCases } from './safety.js';

// Admin dashboard API. Every route requires membership in the Cognito "admins" group,
// and every change is written to admin_log.
export const admin = express.Router();
admin.use(requireAdmin);

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
const POOL = process.env.COGNITO_USER_POOL_ID;
const DAY = 86_400_000;

// Best effort: suspending also locks the Cognito login. Needs the server's IAM role to allow it;
// if it doesn't, the app-level suspension still applies and we say so.
async function cognitoCall(Command, sub) {
  if (!sub) return 'no login (demo profile)';
  try {
    await cognito.send(new Command({ UserPoolId: POOL, Username: sub }));
    return 'ok';
  } catch (e) {
    return `login not changed (${e.name})`;
  }
}

const log = async (req, action, target, detail = '') =>
  await sql.run('INSERT INTO admin_log (admin, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)', req.identity.email,
    action,
    target == null ? null : String(target),
    detail,
    now(),);

const count = async (text, ...args) => Number((await sql.one(text, ...args)).n);

const adminUser = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  email: u.cognito_sub ? u.email : null,
  age: ageFrom(u.birthdate),
  gender: u.gender,
  interestedIn: u.interested_in.split(','),
  county: u.county,
  region: u.region,
  country: u.country,
  photo: photosOf(u)[0] || '',
  photos: photosOf(u),
  bio: u.bio,
  tags: u.tags ? u.tags.split(',') : [],
  demo: !u.cognito_sub,
  banned: !!u.banned,
  bannedReason: u.banned_reason || '',
  availableNow: !!u.available_now,
  createdAt: u.created_at,
  lastActive: u.last_active,
});

admin.get('/stats', async (req, res) => {
  const t = now();
  const real = 'cognito_sub IS NOT NULL';
  // 14 daily buckets (UTC days), oldest first.
  const start = Math.floor(t / DAY) * DAY - 13 * DAY;
  const days = [...Array(14)].map((_, i) => ({ day: new Date(start + i * DAY).toISOString().slice(0, 10), signups: 0, swipes: 0 }));
  const bucket = (ts) => days[Math.floor((ts - start) / DAY)];
  for (const r of await sql.all(`SELECT created_at FROM users WHERE ${real} AND created_at >= ?`, start)) bucket(r.created_at).signups++;
  for (const r of await sql.all('SELECT created_at FROM swipes WHERE created_at >= ?', start)) bucket(r.created_at).swipes++;

  res.json({
    realUsers: await count(`SELECT count(*) n FROM users WHERE ${real}`),
    demoProfiles: await count('SELECT count(*) n FROM users WHERE cognito_sub IS NULL'),
    suspended: await count('SELECT count(*) n FROM users WHERE banned = 1'),
    signups24h: await count(`SELECT count(*) n FROM users WHERE ${real} AND created_at >= ?`, t - DAY),
    signups7d: await count(`SELECT count(*) n FROM users WHERE ${real} AND created_at >= ?`, t - 7 * DAY),
    signupsPrev7d: await count(`SELECT count(*) n FROM users WHERE ${real} AND created_at >= ? AND created_at < ?`, t - 14 * DAY, t - 7 * DAY),
    active24h: await count(`SELECT count(*) n FROM users WHERE ${real} AND last_active >= ?`, t - DAY),
    swipes24h: await count('SELECT count(*) n FROM swipes WHERE created_at >= ?', t - DAY),
    likes24h: await count("SELECT count(*) n FROM swipes WHERE dir = 'like' AND created_at >= ?", t - DAY),
    matchesTotal: await count('SELECT count(*) n FROM matches'),
    matches24h: await count('SELECT count(*) n FROM matches WHERE created_at >= ?', t - DAY),
    messages24h: await count('SELECT count(*) n FROM messages WHERE created_at >= ?', t - DAY),
    meetupsAccepted: await count("SELECT count(*) n FROM meetups WHERE status = 'accepted'"),
    openReports: await count("SELECT count(*) n FROM reports WHERE COALESCE(status, 'open') = 'open'"),
    noPhoto: await count(`SELECT count(*) n FROM users WHERE ${real} AND COALESCE(photo, '') = ''`),
    noLocation: await count(`SELECT count(*) n FROM users WHERE ${real} AND lat IS NULL`),
    daily: days,
  });
});

admin.get('/users', async (req, res) => {
  const q = `%${String(req.query.q || '').trim().toLowerCase()}%`;
  const kind = { real: 'u.cognito_sub IS NOT NULL', demo: 'u.cognito_sub IS NULL', suspended: 'u.banned = 1' }[req.query.kind] || '1=1';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const where = `WHERE ${kind} AND (lower(u.username) LIKE ? OR lower(u.name) LIKE ? OR lower(u.email) LIKE ?)`;
  const total = await count(`SELECT count(*) n FROM users u ${where}`, q, q, q);
  const rows = await sql.all(
      `SELECT u.*, (SELECT count(*) FROM reports r WHERE r.reported_id = u.id AND COALESCE(r.status, 'open') = 'open') AS open_reports
       FROM users u ${where} ORDER BY u.cognito_sub IS NULL, u.created_at DESC LIMIT ? OFFSET ?`,
    q, q, q, limit, offset,
  );
  res.json({ total, users: rows.map((u) => ({ ...adminUser(u), openReports: u.open_reports })) });
});

admin.get('/users/:id', async (req, res) => {
  const u = await sql.one('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...adminUser(u),
    activity: {
      swipes: await count('SELECT count(*) n FROM swipes WHERE from_id = ?', u.id),
      likesGiven: await count("SELECT count(*) n FROM swipes WHERE from_id = ? AND dir = 'like'", u.id),
      likesReceived: await count("SELECT count(*) n FROM swipes WHERE to_id = ? AND dir = 'like'", u.id),
      matches: await count('SELECT count(*) n FROM matches WHERE a = ? OR b = ?', u.id, u.id),
      messagesSent: await count('SELECT count(*) n FROM messages WHERE sender_id = ?', u.id),
      reportsMade: await count('SELECT count(*) n FROM reports WHERE reporter_id = ?', u.id),
    },
    reports: await sql.all(
      `SELECT r.id, r.reason, r.created_at, COALESCE(r.status, 'open') status, p.username reporter
       FROM reports r JOIN users p ON p.id = r.reporter_id WHERE r.reported_id = ? ORDER BY r.id DESC`,
      u.id,
    ),
  });
});

async function suspend(req, u, reason) {
  await sql.run('UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?', reason, u.id);
  const login = await cognitoCall(AdminDisableUserCommand, u.cognito_sub);
  if (login === 'ok') await cognitoCall(AdminUserGlobalSignOutCommand, u.cognito_sub);
  await log(req, 'suspend', u.id, `${u.username}: ${reason} (login: ${login})`);
  return login;
}

admin.post('/users/:id/suspend', async (req, res) => {
  const u = await sql.one('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const reason = String(req.body?.reason || '').trim().slice(0, 300) || 'Suspended by admin';
  res.json({ ok: true, login: await suspend(req, u, reason) });
});

admin.post('/users/:id/restore', async (req, res) => {
  const u = await sql.one('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  await sql.run("UPDATE users SET banned = 0, banned_reason = '' WHERE id = ?", u.id);
  const login = await cognitoCall(AdminEnableUserCommand, u.cognito_sub);
  await log(req, 'restore', u.id, `${u.username} (login: ${login})`);
  res.json({ ok: true, login });
});

admin.delete('/users/:id', async (req, res) => {
  const u = await sql.one('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.cognito_sub && u.cognito_sub === req.identity.sub) return res.status(400).json({ error: "You can't delete your own account here" });
  await Promise.all(photosOf(u).map(deletePhoto));
  await forgetUser(u.id);
  await sql.run('DELETE FROM users WHERE id = ?', u.id);
  const login = await cognitoCall(AdminDeleteUserCommand, u.cognito_sub);
  await log(req, 'delete', u.id, `${u.username} (login: ${login})`);
  res.json({ ok: true, login });
});

admin.get('/reports', async (req, res) => {
  const status = ['open', 'dismissed', 'actioned'].includes(req.query.status) ? req.query.status : 'open';
  const rows = await sql.all(
      `SELECT r.id, r.reason, r.created_at, r.resolved_at, COALESCE(r.status, 'open') status,
              p.id reporter_id, p.username reporter, t.id reported_id, t.username reported, t.name reported_name,
              t.banned reported_banned,
              (SELECT count(*) FROM location_points lp WHERE lp.hold = 'report:' || CAST(r.id AS TEXT)) held_points,
              (SELECT count(*) FROM reports x WHERE x.reported_id = t.id) reported_total
       FROM reports r JOIN users p ON p.id = r.reporter_id JOIN users t ON t.id = r.reported_id
       WHERE COALESCE(r.status, 'open') = ? ORDER BY r.id DESC LIMIT 200`,
    status,
  );
  res.json(rows);
});

admin.post('/reports/:id', async (req, res) => {
  const r = await sql.one('SELECT * FROM reports WHERE id = ?', req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  const action = req.body?.action;
  if (!['dismiss', 'suspend'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  let login;
  if (action === 'suspend') {
    const u = await sql.one('SELECT * FROM users WHERE id = ?', r.reported_id);
    login = await suspend(req, u, `Report #${r.id}: ${r.reason}`.slice(0, 300));
  }
  await sql.run('UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?', action === 'dismiss' ? 'dismissed' : 'actioned', now(), r.id);
  // Case closed: held location trails go back to normal 24-hour deletion.
  await releaseHold(`report:${r.id}`);
  await log(req, `report-${action}`, r.reported_id, `report #${r.id}`);
  res.json({ ok: true, login });
});

admin.get('/settings', async (req, res) => {
  res.json({ demoMode: (await getSetting('demo_mode', process.env.DEMO_MODE === '1' ? '1' : '0')) === '1' });
});

admin.patch('/settings', async (req, res) => {
  if (typeof req.body?.demoMode === 'boolean') {
    await setSetting('demo_mode', req.body.demoMode ? '1' : '0');
    await log(req, 'settings', null, `demo mode ${req.body.demoMode ? 'on' : 'off'}`);
  }
  res.json({ demoMode: (await getSetting('demo_mode', '0')) === '1' });
});

admin.get('/log', async (req, res) => {
  res.json(await sql.all('SELECT * FROM admin_log ORDER BY id DESC LIMIT 100'));
});

// ---------- safety ----------

admin.get('/safety', async (req, res) => {
  res.json({ sos: await safetyCases() });
});

// Decrypt a held location trail. Only for an open case, and every look is logged.
admin.get('/safety/trail', async (req, res) => {
  const ref = String(req.query.ref || '');
  const m = ref.match(/^(report|sos):(\d+)$/);
  if (!m) return res.status(400).json({ error: 'Invalid case' });
  const open =
    m[1] === 'report'
      ? await sql.one("SELECT 1 FROM reports WHERE id = ? AND COALESCE(status, 'open') = 'open'", m[2])
      : await sql.one("SELECT 1 FROM sos_alerts WHERE id = ? AND status IN ('open', 'cancelled')", m[2]);
  if (!open) return res.status(404).json({ error: 'That case is closed' });
  await log(req, 'view-location', ref, 'opened held location trail');
  res.json(await heldTrail(ref));
});

admin.post('/sos/:id/resolve', async (req, res) => {
  const a = await sql.one('SELECT * FROM sos_alerts WHERE id = ?', req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  await resolveSos(a.id);
  await log(req, 'sos-resolve', a.user_id, `sos #${a.id}`);
  res.json({ ok: true });
});
