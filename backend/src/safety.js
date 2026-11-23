import express from 'express';
import { getSetting, now, sql } from './db.js';
import { requireAuth } from './auth.js';
import { distanceKm } from './geo.js';
import { hashToken, randomToken, seal, unseal } from './seal.js';

// Safety features for meeting up:
//  - Live location between two matched people on their way to meet. Either can start it; the other
//    has to accept. It ends when either taps "We met" or "Stop", or after 3 hours.
//  - A link a user can send a friend so they can follow along in a browser.
//  - SOS: records where you are and flags it for the admins.
// Location points are encrypted (seal.js) and deleted 24 hours after they're recorded. Each person
// can delete their own points sooner, never the other person's. While a report or SOS involving
// them is open, the points are held, even from their owner, until an admin resolves the case.
export const safety = express.Router();

const MIN = 60_000;
const HOUR = 60 * MIN;
export const POINT_TTL = 24 * HOUR;
export const SHARE_MAX = 3 * HOUR;
const PENDING_MAX = 30 * MIN;
const FRIEND_LINK_TTL = 6 * HOUR;
const TRAIL = 40; // points of the other person's path shown on the map

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const userById = (id) => sql.one('SELECT * FROM users WHERE id = ?', id);
const demoMode = async () => (await getSetting('demo_mode', process.env.DEMO_MODE === '1' ? '1' : '0')) === '1';
const isDemo = (u) => u && u.cognito_sub == null;

// ---------- housekeeping ----------

// Ends shares that ran out, drops stale invites, and deletes expired points that aren't held.
// Runs at most every 30 s per server instance, from the safety routes.
let lastTidy = 0;
export async function tidy(force = false) {
  const t = now();
  if (!force && t - lastTidy < 30_000) return;
  lastTidy = t;
  await sql.run("UPDATE live_shares SET status = 'ended', end_reason = 'timeout', ended_at = ends_at WHERE status = 'active' AND ends_at < ?", t);
  await sql.run("UPDATE live_shares SET status = 'ended', end_reason = 'cancelled', ended_at = ? WHERE status = 'pending' AND created_at < ?", t, t - PENDING_MAX);
  await sql.run('DELETE FROM location_points WHERE expires_at < ? AND hold IS NULL', t);
  await sql.run('DELETE FROM friend_links WHERE expires_at < ?', t - POINT_TTL);
}

// ---------- points ----------

async function addPoint(userId, { lat, lng, acc }, { shareId = null, kind = 'live', hold = null } = {}) {
  const t = now();
  const sealed = seal({ lat, lng, acc: acc ?? null }, userId);
  await sql.run(
    'INSERT INTO location_points (user_id, share_id, kind, sealed, hold, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    userId, shareId, kind, sealed, hold, t, t + POINT_TTL,
  );
}

const openPoint = (row) => {
  try {
    return { ...unseal(row.sealed, row.user_id), at: row.created_at, kind: row.kind };
  } catch {
    return null; // key changed since it was recorded
  }
};

async function latestPoints(userId, { shareId, since = 0, limit = 1 } = {}) {
  const rows = await sql.all(
    `SELECT * FROM location_points WHERE user_id = ? AND created_at >= ? ${shareId ? 'AND share_id = ?' : ''} ORDER BY created_at DESC LIMIT ?`,
    ...[userId, since, ...(shareId ? [shareId] : []), limit],
  );
  return rows.map(openPoint).filter(Boolean);
}

function parsePoint(body) {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const acc = Number(body?.acc);
  return { lat, lng, acc: Number.isFinite(acc) ? Math.round(acc) : null };
}

// ---------- holds (reports and SOS) ----------

// Keeps both people's unexpired points from shares between them (and SOS points) until the case closes.
export async function holdForPair(ref, userA, userB) {
  const [a, b] = [userA, userB].sort((x, y) => x - y);
  await sql.run(
    `UPDATE location_points SET hold = ?
     WHERE hold IS NULL AND expires_at > ? AND user_id IN (?, ?)
       AND (kind = 'sos' OR share_id IN (SELECT id FROM live_shares WHERE a_id = ? AND b_id = ?))`,
    ref, now(), a, b, a, b,
  );
}

async function holdForUser(ref, userId) {
  await sql.run('UPDATE location_points SET hold = ? WHERE hold IS NULL AND expires_at > ? AND user_id = ?', ref, now(), userId);
}

// When the case is resolved the points go back to normal: deleted at their 24 h mark (or right away if past it).
export const releaseHold = (ref) => sql.run('UPDATE location_points SET hold = NULL WHERE hold = ?', ref);

// Called when someone deletes their account: their points go, unless a case holds them.
export async function forgetUser(userId) {
  const t = now();
  await sql.run("UPDATE live_shares SET status = 'ended', end_reason = 'deleted', ended_at = ? WHERE status IN ('pending', 'active') AND (a_id = ? OR b_id = ?)", t, userId, userId);
  await sql.run('DELETE FROM location_points WHERE user_id = ? AND hold IS NULL', userId);
}

// ---------- live shares ----------

async function loadMatch(req, res) {
  const m = await sql.one('SELECT * FROM matches WHERE id = ? AND (a = ? OR b = ?)', req.params.id, req.user.id, req.user.id);
  if (!m) bad(res, 'Match not found', 404);
  return m;
}

const currentShare = (matchId) =>
  sql.one("SELECT * FROM live_shares WHERE match_id = ? AND status IN ('pending', 'active') ORDER BY id DESC LIMIT 1", matchId);

const otherOf = (share, meId) => (share.a_id === meId ? share.b_id : share.a_id);

// Testing only: a demo profile "walks" toward you, from ~1.5 km away, over 15 minutes.
function demoPath(share, me) {
  const target = me ?? { lat: 40.7128, lng: -74.006 };
  const angle = (share.id * 137) % 360 * (Math.PI / 180);
  const start = { lat: target.lat + 0.0135 * Math.cos(angle), lng: target.lng + 0.0175 * Math.sin(angle) };
  const at = (p) => ({ lat: start.lat + (target.lat - start.lat) * p, lng: start.lng + (target.lng - start.lng) * p });
  const begun = share.accepted_at ?? now();
  const p = Math.min(1, (now() - begun) / (15 * MIN));
  const steps = 12;
  return [...Array(steps + 1)].map((_, i) => ({ ...at((p * (steps - i)) / steps), acc: 10, at: begun + ((now() - begun) * (steps - i)) / steps }));
}

// What one person sees of a match's live share. The other person's location is only shown while it's active.
export async function liveSummary(matchId, me) {
  const share = await currentShare(matchId);
  if (!share) return null;
  const active = share.status === 'active' && share.ends_at > now();
  if (share.status === 'active' && !active) return null; // ran out; tidy() marks it ended
  const otherId = otherOf(share, me.id);
  const out = {
    id: share.id,
    status: share.status,
    startedByMe: share.started_by === me.id,
    endsAt: share.ends_at,
    me: null,
    them: null,
    trail: [],
    distanceKm: null,
  };
  if (!active) return out;
  [out.me] = await latestPoints(me.id, { shareId: share.id });
  const other = await userById(otherId);
  if (isDemo(other) && (await demoMode())) {
    out.trail = demoPath(share, out.me ?? (me.lat != null ? { lat: me.lat, lng: me.lng } : null));
  } else {
    out.trail = await latestPoints(otherId, { shareId: share.id, limit: TRAIL });
  }
  out.them = out.trail[0] ?? null;
  if (out.me && out.them) out.distanceKm = Math.round(distanceKm(out.me, out.them) * 100) / 100;
  return out;
}

safety.get('/matches/:id/live', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  await tidy();
  res.json({ live: await liveSummary(m.id, req.user) });
});

safety.post('/matches/:id/live', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  await tidy(true);
  const existing = await currentShare(m.id);
  if (existing) return res.json({ live: await liveSummary(m.id, req.user) });
  const elsewhere = await sql.one(
    "SELECT 1 FROM live_shares WHERE status IN ('pending', 'active') AND (a_id = ? OR b_id = ?) AND match_id != ?",
    req.user.id, req.user.id, m.id,
  );
  if (elsewhere) return bad(res, "You're already sharing your location with someone else. Stop that first.", 409);
  const t = now();
  const other = await userById(m.a === req.user.id ? m.b : m.a);
  // Testing only: demo profiles accept right away.
  const auto = isDemo(other) && (await demoMode());
  await sql.run(
    'INSERT INTO live_shares (match_id, a_id, b_id, started_by, status, created_at, accepted_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    m.id, m.a, m.b, req.user.id, auto ? 'active' : 'pending', t, auto ? t : null, auto ? t + SHARE_MAX : null,
  );
  res.json({ live: await liveSummary(m.id, req.user) });
});

safety.post('/matches/:id/live/:action', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  const share = await currentShare(m.id);
  if (!share) return bad(res, 'Nothing is being shared', 404);
  const t = now();
  const { action } = req.params;
  if (action === 'accept') {
    if (share.status !== 'pending') return bad(res, 'Already started');
    if (share.started_by === req.user.id) return bad(res, "Waiting for the other person to accept");
    await sql.run("UPDATE live_shares SET status = 'active', accepted_at = ?, ends_at = ? WHERE id = ?", t, t + SHARE_MAX, share.id);
  } else if (action === 'decline') {
    await sql.run("UPDATE live_shares SET status = 'declined', ended_at = ? WHERE id = ?", t, share.id);
  } else if (action === 'end') {
    const reason = req.body?.reason === 'met' ? 'met' : 'stopped';
    await sql.run("UPDATE live_shares SET status = 'ended', end_reason = ?, ended_at = ? WHERE id = ?", share.status === 'pending' ? 'cancelled' : reason, t, share.id);
  } else return bad(res, 'Unknown action', 404);
  res.json({ live: await liveSummary(m.id, req.user) });
});

// ---------- sending location ----------

async function activeShareOf(userId) {
  return sql.one(
    "SELECT * FROM live_shares WHERE status = 'active' AND ends_at > ? AND (a_id = ? OR b_id = ?) ORDER BY id DESC LIMIT 1",
    now(), userId, userId,
  );
}
const activeFriendLink = (userId) =>
  sql.one('SELECT * FROM friend_links WHERE user_id = ? AND revoked = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1', userId, now());
const openSos = (userId) =>
  sql.one("SELECT * FROM sos_alerts WHERE user_id = ? AND status = 'open' AND created_at > ? ORDER BY id DESC LIMIT 1", userId, now() - SHARE_MAX);

// The app sends this every ~10 s while something is being shared. 409 tells it to stop.
safety.post('/safety/location', requireAuth, async (req, res) => {
  const p = parsePoint(req.body);
  if (!p) return bad(res, 'Invalid location');
  await tidy();
  const [share, link, sos] = await Promise.all([activeShareOf(req.user.id), activeFriendLink(req.user.id), openSos(req.user.id)]);
  if (!share && !link && !sos) return bad(res, 'Not sharing', 409);
  await addPoint(req.user.id, p, { shareId: share?.id ?? null, kind: sos ? 'sos' : 'live', hold: sos ? `sos:${sos.id}` : null });
  res.json({ ok: true, sharing: { live: !!share, friend: !!link, sos: !!sos } });
});

// What the app should be doing right now (so it keeps sending location from any screen).
safety.get('/safety/status', requireAuth, async (req, res) => {
  await tidy();
  const [share, link, sos] = await Promise.all([activeShareOf(req.user.id), activeFriendLink(req.user.id), openSos(req.user.id)]);
  res.json({
    live: share ? { id: share.id, matchId: share.match_id, endsAt: share.ends_at } : null,
    friendLink: link ? { id: link.id, expiresAt: link.expires_at } : null,
    sos: sos ? { id: sos.id, createdAt: sos.created_at } : null,
  });
});

// ---------- SOS ----------

safety.post('/safety/sos', requireAuth, async (req, res) => {
  const p = parsePoint(req.body);
  const share = await activeShareOf(req.user.id);
  const otherId = share ? otherOf(share, req.user.id) : null;
  const { rows } = await sql.run(
    'INSERT INTO sos_alerts (user_id, share_id, other_id, created_at) VALUES (?, ?, ?, ?) RETURNING id',
    req.user.id, share?.id ?? null, otherId, now(),
  );
  const ref = `sos:${rows[0].id}`;
  if (p) await addPoint(req.user.id, p, { shareId: share?.id ?? null, kind: 'sos', hold: ref });
  await holdForUser(ref, req.user.id);
  if (otherId) await holdForPair(ref, req.user.id, otherId);
  console.warn('SOS', ref, 'user', req.user.id, otherId ? `meeting user ${otherId}` : '');
  res.json({ ok: true, id: rows[0].id });
});

safety.post('/safety/sos/:id/cancel', requireAuth, async (req, res) => {
  const a = await sql.one("SELECT * FROM sos_alerts WHERE id = ? AND user_id = ? AND status = 'open'", req.params.id, req.user.id);
  if (!a) return bad(res, 'Not found', 404);
  // Marked as cancelled by the user; the points stay held until an admin has looked at it.
  await sql.run("UPDATE sos_alerts SET status = 'cancelled' WHERE id = ?", a.id);
  res.json({ ok: true });
});

// ---------- friend links ----------

safety.post('/safety/friend-link', requireAuth, async (req, res) => {
  const token = randomToken();
  const t = now();
  await sql.run('UPDATE friend_links SET revoked = 1 WHERE user_id = ? AND revoked = 0', req.user.id);
  await sql.run('INSERT INTO friend_links (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', hashToken(token), req.user.id, t, t + FRIEND_LINK_TTL);
  const p = parsePoint(req.body);
  if (p) await addPoint(req.user.id, p, { shareId: (await activeShareOf(req.user.id))?.id ?? null });
  res.json({ token, path: `/safe/${token}`, expiresAt: t + FRIEND_LINK_TTL });
});

safety.delete('/safety/friend-link', requireAuth, async (req, res) => {
  await sql.run('UPDATE friend_links SET revoked = 1 WHERE user_id = ? AND revoked = 0', req.user.id);
  res.json({ ok: true });
});

// Public: what a friend's browser sees. First name, last location and when — nothing else.
safety.get('/safe/:token', async (req, res) => {
  const link = await sql.one('SELECT * FROM friend_links WHERE token_hash = ?', hashToken(req.params.token));
  if (!link || link.revoked || link.expires_at < now()) return bad(res, 'This link has ended', 410);
  const u = await userById(link.user_id);
  if (!u) return bad(res, 'This link has ended', 410);
  const trail = await latestPoints(u.id, { since: link.created_at, limit: TRAIL });
  const sos = await sql.one("SELECT created_at FROM sos_alerts WHERE user_id = ? AND status = 'open' AND created_at >= ?", u.id, link.created_at);
  res.set('Cache-Control', 'no-store').json({
    name: u.name,
    expiresAt: link.expires_at,
    last: trail[0] ?? null,
    trail: trail.map(({ lat, lng, at }) => ({ lat, lng, at })),
    sos: sos ? sos.created_at : null,
  });
});

// ---------- deleting your own history ----------

safety.delete('/safety/locations', requireAuth, async (req, res) => {
  const t = now();
  await sql.run("UPDATE live_shares SET status = 'ended', end_reason = 'stopped', ended_at = ? WHERE status IN ('pending', 'active') AND (a_id = ? OR b_id = ?)", t, req.user.id, req.user.id);
  await sql.run('UPDATE friend_links SET revoked = 1 WHERE user_id = ?', req.user.id);
  const { changes } = await sql.run('DELETE FROM location_points WHERE user_id = ? AND hold IS NULL', req.user.id);
  const held = Number((await sql.one('SELECT count(*) n FROM location_points WHERE user_id = ? AND hold IS NOT NULL', req.user.id)).n);
  res.json({ deleted: changes, held });
});

// ---------- admin ----------

// Open safety cases with held location trails, for the admin dashboard.
export async function safetyCases() {
  const sos = await sql.all(
    `SELECT s.*, u.username, u.name, o.username other_username,
            (SELECT count(*) FROM location_points p WHERE p.hold = 'sos:' || CAST(s.id AS TEXT)) points
     FROM sos_alerts s LEFT JOIN users u ON u.id = s.user_id LEFT JOIN users o ON o.id = s.other_id
     WHERE s.status IN ('open', 'cancelled') ORDER BY s.id DESC LIMIT 100`,
  );
  return sos.map((s) => ({
    ref: `sos:${s.id}`, id: s.id, status: s.status, createdAt: s.created_at, points: Number(s.points),
    user: { id: s.user_id, username: s.username, name: s.name }, other: s.other_id ? { id: s.other_id, username: s.other_username } : null,
  }));
}

// Decrypts a held trail. Only for refs of cases (report:<id> / sos:<id>); the caller logs the access.
export async function heldTrail(ref) {
  const rows = await sql.all('SELECT * FROM location_points WHERE hold = ? ORDER BY created_at', ref);
  const byUser = {};
  for (const r of rows) {
    const p = openPoint(r);
    if (p) (byUser[r.user_id] ??= []).push(p);
  }
  const people = await Promise.all(
    Object.keys(byUser).map(async (id) => {
      const u = await userById(id);
      return { userId: Number(id), username: u?.username ?? '(deleted account)', name: u?.name ?? '', points: byUser[id] };
    }),
  );
  return { ref, people };
}

export async function resolveSos(id) {
  await sql.run("UPDATE sos_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?", now(), id);
  await releaseHold(`sos:${id}`);
}
