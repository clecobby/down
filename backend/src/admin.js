import express from 'express';
import {
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { ageFrom, db, getSetting, now, photosOf, setSetting } from './db.js';
import { requireAdmin } from './auth.js';
import { deletePhoto } from './storage.js';

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

const log = (req, action, target, detail = '') =>
  db.prepare('INSERT INTO admin_log (admin, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(
    req.identity.email,
    action,
    target == null ? null : String(target),
    detail,
    now(),
  );

const count = (sql, ...args) => db.prepare(sql).get(...args).n;

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

admin.get('/stats', (req, res) => {
  const t = now();
  const real = 'cognito_sub IS NOT NULL';
  // 14 daily buckets (UTC days), oldest first.
  const start = Math.floor(t / DAY) * DAY - 13 * DAY;
  const days = [...Array(14)].map((_, i) => ({ day: new Date(start + i * DAY).toISOString().slice(0, 10), signups: 0, swipes: 0 }));
  const bucket = (ts) => days[Math.floor((ts - start) / DAY)];
  for (const r of db.prepare(`SELECT created_at FROM users WHERE ${real} AND created_at >= ?`).all(start)) bucket(r.created_at).signups++;
  for (const r of db.prepare('SELECT created_at FROM swipes WHERE created_at >= ?').all(start)) bucket(r.created_at).swipes++;

  res.json({
    realUsers: count(`SELECT count(*) n FROM users WHERE ${real}`),
    demoProfiles: count('SELECT count(*) n FROM users WHERE cognito_sub IS NULL'),
    suspended: count('SELECT count(*) n FROM users WHERE banned = 1'),
    signups24h: count(`SELECT count(*) n FROM users WHERE ${real} AND created_at >= ?`, t - DAY),
    signups7d: count(`SELECT count(*) n FROM users WHERE ${real} AND created_at >= ?`, t - 7 * DAY),
    signupsPrev7d: count(`SELECT count(*) n FROM users WHERE ${real} AND created_at >= ? AND created_at < ?`, t - 14 * DAY, t - 7 * DAY),
    active24h: count(`SELECT count(*) n FROM users WHERE ${real} AND last_active >= ?`, t - DAY),
    swipes24h: count('SELECT count(*) n FROM swipes WHERE created_at >= ?', t - DAY),
    likes24h: count("SELECT count(*) n FROM swipes WHERE dir = 'like' AND created_at >= ?", t - DAY),
    matchesTotal: count('SELECT count(*) n FROM matches'),
    matches24h: count('SELECT count(*) n FROM matches WHERE created_at >= ?', t - DAY),
    messages24h: count('SELECT count(*) n FROM messages WHERE created_at >= ?', t - DAY),
    meetupsAccepted: count("SELECT count(*) n FROM meetups WHERE status = 'accepted'"),
    openReports: count("SELECT count(*) n FROM reports WHERE COALESCE(status, 'open') = 'open'"),
    noPhoto: count(`SELECT count(*) n FROM users WHERE ${real} AND COALESCE(photo, '') = ''`),
    noLocation: count(`SELECT count(*) n FROM users WHERE ${real} AND lat IS NULL`),
    daily: days,
  });
});

admin.get('/users', (req, res) => {
  const q = `%${String(req.query.q || '').trim().toLowerCase()}%`;
  const kind = { real: 'u.cognito_sub IS NOT NULL', demo: 'u.cognito_sub IS NULL', suspended: 'u.banned = 1' }[req.query.kind] || '1=1';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const where = `WHERE ${kind} AND (lower(u.username) LIKE ? OR lower(u.name) LIKE ? OR lower(u.email) LIKE ?)`;
  const total = count(`SELECT count(*) n FROM users u ${where}`, q, q, q);
  const rows = db
    .prepare(
      `SELECT u.*, (SELECT count(*) FROM reports r WHERE r.reported_id = u.id AND COALESCE(r.status, 'open') = 'open') AS open_reports
       FROM users u ${where} ORDER BY u.cognito_sub IS NULL, u.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(q, q, q, limit, offset);
  res.json({ total, users: rows.map((u) => ({ ...adminUser(u), openReports: u.open_reports })) });
});

admin.get('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...adminUser(u),
    activity: {
      swipes: count('SELECT count(*) n FROM swipes WHERE from_id = ?', u.id),
      likesGiven: count("SELECT count(*) n FROM swipes WHERE from_id = ? AND dir = 'like'", u.id),
      likesReceived: count("SELECT count(*) n FROM swipes WHERE to_id = ? AND dir = 'like'", u.id),
      matches: count('SELECT count(*) n FROM matches WHERE a = ? OR b = ?', u.id, u.id),
      messagesSent: count('SELECT count(*) n FROM messages WHERE sender_id = ?', u.id),
      reportsMade: count('SELECT count(*) n FROM reports WHERE reporter_id = ?', u.id),
    },
    reports: db
      .prepare(
        `SELECT r.id, r.reason, r.created_at, COALESCE(r.status, 'open') status, p.username reporter
         FROM reports r JOIN users p ON p.id = r.reporter_id WHERE r.reported_id = ? ORDER BY r.id DESC`,
      )
      .all(u.id),
  });
});

async function suspend(req, u, reason) {
  db.prepare('UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?').run(reason, u.id);
  const login = await cognitoCall(AdminDisableUserCommand, u.cognito_sub);
  if (login === 'ok') await cognitoCall(AdminUserGlobalSignOutCommand, u.cognito_sub);
  log(req, 'suspend', u.id, `${u.username}: ${reason} (login: ${login})`);
  return login;
}

admin.post('/users/:id/suspend', async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const reason = String(req.body?.reason || '').trim().slice(0, 300) || 'Suspended by admin';
  res.json({ ok: true, login: await suspend(req, u, reason) });
});

admin.post('/users/:id/restore', async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  db.prepare("UPDATE users SET banned = 0, banned_reason = '' WHERE id = ?").run(u.id);
  const login = await cognitoCall(AdminEnableUserCommand, u.cognito_sub);
  log(req, 'restore', u.id, `${u.username} (login: ${login})`);
  res.json({ ok: true, login });
});

admin.delete('/users/:id', async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.cognito_sub && u.cognito_sub === req.identity.sub) return res.status(400).json({ error: "You can't delete your own account here" });
  for (const p of photosOf(u)) deletePhoto(p);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  const login = await cognitoCall(AdminDeleteUserCommand, u.cognito_sub);
  log(req, 'delete', u.id, `${u.username} (login: ${login})`);
  res.json({ ok: true, login });
});

admin.get('/reports', (req, res) => {
  const status = ['open', 'dismissed', 'actioned'].includes(req.query.status) ? req.query.status : 'open';
  const rows = db
    .prepare(
      `SELECT r.id, r.reason, r.created_at, r.resolved_at, COALESCE(r.status, 'open') status,
              p.id reporter_id, p.username reporter, t.id reported_id, t.username reported, t.name reported_name,
              t.banned reported_banned,
              (SELECT count(*) FROM reports x WHERE x.reported_id = t.id) reported_total
       FROM reports r JOIN users p ON p.id = r.reporter_id JOIN users t ON t.id = r.reported_id
       WHERE COALESCE(r.status, 'open') = ? ORDER BY r.id DESC LIMIT 200`,
    )
    .all(status);
  res.json(rows);
});

admin.post('/reports/:id', async (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  const action = req.body?.action;
  if (!['dismiss', 'suspend'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  let login;
  if (action === 'suspend') {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.reported_id);
    login = await suspend(req, u, `Report #${r.id}: ${r.reason}`.slice(0, 300));
  }
  db.prepare('UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?').run(action === 'dismiss' ? 'dismissed' : 'actioned', now(), r.id);
  log(req, `report-${action}`, r.reported_id, `report #${r.id}`);
  res.json({ ok: true, login });
});

admin.get('/settings', (req, res) => {
  res.json({ demoMode: getSetting('demo_mode', process.env.DEMO_MODE === '1' ? '1' : '0') === '1' });
});

admin.patch('/settings', (req, res) => {
  if (typeof req.body?.demoMode === 'boolean') {
    setSetting('demo_mode', req.body.demoMode ? '1' : '0');
    log(req, 'settings', null, `demo mode ${req.body.demoMode ? 'on' : 'off'}`);
  }
  res.json({ demoMode: getSetting('demo_mode', '0') === '1' });
});

admin.get('/log', (req, res) => {
  res.json(db.prepare('SELECT * FROM admin_log ORDER BY id DESC LIMIT 100').all());
});
