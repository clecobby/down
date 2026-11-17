// Admin API logic, with the Cognito admin check stubbed out. Run: npm test
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const dbPath = path.join(os.tmpdir(), `down-admin-test-${process.pid}.db`);
process.env.DB_PATH = dbPath;
process.env.DEMO_MODE = '1';
execFileSync(process.execPath, ['src/seed.js'], { env: process.env, stdio: 'ignore' });

// Stand in for Cognito: every request is an admin, and Cognito admin calls "succeed".
mock.module('../src/auth.js', {
  namedExports: {
    requireAdmin: (req, res, next) => {
      req.identity = { email: 'admin@test', sub: 'admin-sub', isAdmin: true };
      next();
    },
  },
});
mock.module('@aws-sdk/client-cognito-identity-provider', {
  namedExports: Object.fromEntries(
    ['AdminDeleteUserCommand', 'AdminDisableUserCommand', 'AdminEnableUserCommand', 'AdminUserGlobalSignOutCommand']
      .map((n) => [n, class {}])
      .concat([['CognitoIdentityProviderClient', class { send = async () => ({}); }]]),
  ),
});

const { admin } = await import('../src/admin.js');
const { db, now } = await import('../src/db.js');

let base, server;
before(async () => {
  const app = express().use(express.json()).use('/api/admin', admin);
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}/api/admin`;
});
after(() => {
  server.close();
  for (const f of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) fs.rmSync(f, { force: true });
});

const call = async (p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test('stats count real users separately from demo profiles, with 14 daily buckets', async () => {
  const { body } = await call('/stats');
  assert.equal(body.realUsers, 0);
  assert.equal(body.demoProfiles, 88);
  assert.equal(body.daily.length, 14);
});

test('users list filters and searches', async () => {
  const all = (await call('/users?kind=demo&limit=500')).body;
  assert.equal(all.total, 88);
  const lena = (await call('/users?q=lena.b')).body;
  assert.equal(lena.users[0].username, 'lena.b');
  assert.equal(lena.users[0].email, null, 'demo profiles have no email to show');
});

test('report → suspend hides the person and logs the action; restore brings them back', async () => {
  const reporter = db.prepare("SELECT id FROM users WHERE username = 'leo91'").get().id;
  const target = db.prepare("SELECT id FROM users WHERE username = 'maya_m'").get().id;
  db.prepare('INSERT INTO reports (reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?)').run(reporter, target, 'Fake profile', now());

  const open = (await call('/reports')).body;
  assert.equal(open.length, 1);
  assert.equal((await call('/stats')).body.openReports, 1);

  const r = await call(`/reports/${open[0].id}`, 'POST', { action: 'suspend' });
  assert.equal(r.status, 200);
  assert.equal(r.body.login, 'no login (demo profile)');
  const detail = (await call(`/users/${target}`)).body;
  assert.equal(detail.banned, true);
  assert.match(detail.bannedReason, /Fake profile/);
  assert.equal((await call('/reports')).body.length, 0, 'report left the open queue');
  assert.equal((await call('/reports?status=actioned')).body.length, 1);
  assert.equal((await call('/users?kind=suspended')).body.total, 1);

  await call(`/users/${target}/restore`, 'POST');
  assert.equal((await call(`/users/${target}`)).body.banned, false);
  const actions = (await call('/log')).body.map((l) => l.action);
  assert.deepEqual(actions.slice(0, 3), ['restore', 'report-suspend', 'suspend']);
});

test('demo mode toggles at runtime', async () => {
  assert.equal((await call('/settings')).body.demoMode, true);
  assert.equal((await call('/settings', 'PATCH', { demoMode: false })).body.demoMode, false);
  assert.equal((await call('/settings')).body.demoMode, false);
});

test('delete removes the profile', async () => {
  const id = db.prepare("SELECT id FROM users WHERE username = 'jade_h'").get().id;
  assert.equal((await call(`/users/${id}`, 'DELETE')).status, 200);
  assert.equal((await call(`/users/${id}`)).status, 404);
});
