// One-time copy of a SQLite database (the old EC2 server's) into Aurora DSQL.
//   DSQL_HOST=… node scripts/import-sqlite.js /path/to/down.db
// Rows get new ids in DSQL; every reference is remapped. Skips users that already exist (by email).
import { DatabaseSync } from 'node:sqlite';
import { sql } from '../src/sql.js';

if (sql.kind !== 'dsql') throw new Error('Set DSQL_HOST');
const src = new DatabaseSync(process.argv[2], { readOnly: true });
const rows = (t) => src.prepare(`SELECT * FROM ${t}`).all();
const has = (t) => !!src.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);

const userIds = new Map();
const USER_COLS = ['cognito_sub', 'email', 'username', 'name', 'birthdate', 'gender', 'interested_in', 'bio', 'photo', 'photos', 'tags', 'turn_ons',
  'height_cm', 'city', 'available_now', 'lat', 'lng', 'county', 'region', 'country', 'banned', 'banned_reason', 'last_active', 'created_at'];
let skipped = 0;
for (const u of rows('users')) {
  const existing = await sql.one('SELECT id FROM users WHERE email = ?', u.email);
  if (existing) { userIds.set(u.id, existing.id); skipped++; continue; }
  const { rows: [r] } = await sql.run(
    `INSERT INTO users (${USER_COLS.join(', ')}) VALUES (${USER_COLS.map(() => '?').join(', ')}) RETURNING id`,
    ...USER_COLS.map((c) => u[c] ?? (['banned', 'available_now'].includes(c) ? 0 : ['photos', 'tags', 'turn_ons', 'banned_reason', 'bio', 'photo', 'city', 'county', 'region', 'country'].includes(c) ? '' : null)),
  );
  userIds.set(u.id, r.id);
}
const U = (id) => userIds.get(id);
console.log(`users: ${userIds.size - skipped} copied, ${skipped} already there`);

const count = { swipes: 0, matches: 0, messages: 0, meetups: 0, blocks: 0, reports: 0, down: 0, settings: 0, log: 0 };
for (const s of rows('swipes'))
  count.swipes += (await sql.run('INSERT INTO swipes (from_id, to_id, dir, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', U(s.from_id), U(s.to_id), s.dir, s.created_at)).changes;

const matchIds = new Map();
for (const m of rows('matches')) {
  const [a, b] = [U(m.a), U(m.b)].sort((x, y) => x - y);
  await sql.run('INSERT INTO matches (a, b, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', a, b, m.created_at);
  matchIds.set(m.id, (await sql.one('SELECT id FROM matches WHERE a = ? AND b = ?', a, b)).id);
  count.matches++;
}
const M = (id) => matchIds.get(id);
for (const x of rows('messages')) count.messages += (await sql.run('INSERT INTO messages (match_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)', M(x.match_id), U(x.sender_id), x.body, x.created_at)).changes;
for (const x of rows('meetups'))
  count.meetups += (await sql.run('INSERT INTO meetups (match_id, proposer_id, place, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', M(x.match_id), U(x.proposer_id), x.place, x.time, x.status, x.created_at)).changes;
for (const x of rows('blocks')) count.blocks += (await sql.run('INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING', U(x.blocker_id), U(x.blocked_id))).changes;
for (const x of rows('reports'))
  count.reports += (await sql.run('INSERT INTO reports (reporter_id, reported_id, reason, status, resolved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', U(x.reporter_id), U(x.reported_id), x.reason, x.status ?? 'open', x.resolved_at ?? null, x.created_at)).changes;
if (has('down_signals'))
  for (const x of rows('down_signals'))
    count.down += (await sql.run('INSERT INTO down_signals (match_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', M(x.match_id), U(x.user_id), x.created_at, x.expires_at)).changes;
if (has('settings'))
  for (const x of rows('settings')) count.settings += (await sql.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', x.key, x.value)).changes;
if (has('admin_log'))
  for (const x of rows('admin_log')) count.log += (await sql.run('INSERT INTO admin_log (admin, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)', x.admin, x.action, x.target, x.detail, x.created_at)).changes;
console.log(count);
await sql.end();
