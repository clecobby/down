// The "down" signal is private until both people have sent it. Run: npm test
import { after, before, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `down-signal-test-${process.pid}.db`);
process.env.DEMO_MODE = '0';

// Stand in for Cognito: the x-test-user header says who is calling.
const { db, now } = await import('../src/db.js');
mock.module('../src/auth.js', {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.headers['x-test-user']));
      req.identity = { isAdmin: false };
      next();
    },
    requireIdentity: (req, res, next) => next(),
    requireAdmin: (req, res) => res.status(403).end(),
  },
});
const { app } = await import('../src/server.js');

let base, server, a, b, matchId;
before(async () => {
  const add = db.prepare(
    "INSERT INTO users (email, username, password_hash, name, birthdate, gender, interested_in, last_active, created_at) VALUES (?, ?, '', ?, '1990-01-01', 'man', 'woman', ?, ?)",
  );
  a = Number(add.run('a@x', 'alice_t', 'A', now(), now()).lastInsertRowid);
  b = Number(add.run('b@x', 'bob_t', 'B', now(), now()).lastInsertRowid);
  matchId = Number(db.prepare('INSERT INTO matches (a, b, created_at) VALUES (?, ?, ?)').run(a, b, now()).lastInsertRowid);
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => {
  server.close();
  for (const f of ['', '-shm', '-wal']) fs.rmSync(process.env.DB_PATH + f, { force: true });
});

const as = async (user, p, method = 'GET') => (await fetch(base + p, { method, headers: { 'x-test-user': String(user) } })).json();

test("one person's signal stays hidden from the other", async () => {
  const mine = await as(a, `/matches/${matchId}/down`, 'POST');
  assert.equal(mine.mine, true);
  assert.equal(mine.both, false);
  const theirView = (await as(b, `/matches/${matchId}`)).down;
  assert.deepEqual([theirView.mine, theirView.both], [false, false], 'B learns nothing');
  assert.equal(JSON.stringify(await as(b, `/matches/${matchId}`)).includes(String(mine.mineExpiresAt)), false);
});

test('both signals reveal it to both', async () => {
  const r = await as(b, `/matches/${matchId}/down`, 'POST');
  assert.equal(r.both, true);
  assert.equal((await as(a, `/matches/${matchId}`)).down.both, true);
  assert.equal((await as(a, '/matches')).find((m) => m.id === matchId).bothDown, true);
});

test('withdrawing hides it again; expired signals do not count', async () => {
  await as(a, `/matches/${matchId}/down`, 'DELETE');
  assert.equal((await as(b, `/matches/${matchId}`)).down.both, false);
  await as(a, `/matches/${matchId}/down`, 'POST');
  db.prepare('UPDATE down_signals SET expires_at = ? WHERE user_id = ?').run(now() - 1, b);
  assert.equal((await as(a, `/matches/${matchId}`)).down.both, false);
});

test('only people in the match can signal', async () => {
  const c = Number(
    db.prepare("INSERT INTO users (email, username, password_hash, name, birthdate, gender, interested_in, last_active, created_at) VALUES ('c@x', 'carol_t', '', 'C', '1990-01-01', 'woman', 'man', 0, 0)").run()
      .lastInsertRowid,
  );
  const r = await fetch(`${base}/matches/${matchId}/down`, { method: 'POST', headers: { 'x-test-user': String(c) } });
  assert.equal(r.status, 404);
});
