import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sql } from './sql.js';
import { now, ageFrom, getSetting, photosOf, publicUser, selfUser } from './db.js';
import { requireAuth, requireIdentity } from './auth.js';
import { deletePhoto, processImage, savePhoto, uploadDir } from './storage.js';
import { admin } from './admin.js';
import { TURN_ONS, inCommon, parseTurnOns } from './turnons.js';
import { normalizeUsername, usernameError } from './username.js';
import { snap, distanceKm, reverseGeocode } from './geo.js';

const PORT = process.env.PORT || 4000;
const GENDERS = ['man', 'woman', 'nonbinary'];
export const TAGS = ['Tonight', 'This week', 'Drinks first', 'Can host', 'Can travel', 'Discreet', 'No strings', 'Regular thing', 'Weekends', 'Spontaneous'];
export const LOOKING = ['Tonight', 'Casual', 'Ongoing', 'Dates', 'Not sure'];
const MAX_PHOTOS = 6;
// Lambda requests are capped at ~6 MB (and uploads arrive base64-encoded), so it sets this to 4.
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);

// Uploads are held in memory, re-encoded (see storage.js), then stored.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)),
});

export const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const userById = (id) => sql.one('SELECT * FROM users WHERE id = ?', id);

// Testing only: demo profiles (no Cognito account) come back around after you swipe them, and liking one
// is always a match — so the deck never runs out and the match moment can be felt. Real users are unaffected.
// The admin dashboard can switch it at runtime; DEMO_MODE in the env is only the starting value.
const demoMode = async () => (await getSetting('demo_mode', process.env.DEMO_MODE === '1' ? '1' : '0')) === '1';

const usernameTaken = async (u, exceptId = 0) => !!(await sql.one('SELECT 1 FROM users WHERE username = ? AND id != ?', u, exceptId));

const parseInterests = (v) => {
  const list = (Array.isArray(v) ? v : String(v || '').split(',')).filter((g) => GENDERS.includes(g));
  return list.length ? [...new Set(list)].join(',') : null;
};

// ---------- auth ----------

// Accounts live in Cognito; this creates the dating profile for a signed-in Cognito user.
app.post('/api/profile', requireIdentity, async (req, res) => {
  const { sub, email } = req.identity;
  if (await sql.one('SELECT 1 FROM users WHERE cognito_sub = ?', sub)) return bad(res, 'Profile already exists', 409);
  const { name, birthdate, gender, interestedIn } = req.body || {};
  if (!name?.trim() || !birthdate) return bad(res, 'Missing fields');
  const username = normalizeUsername(req.body.username);
  const uErr = usernameError(username);
  if (uErr) return bad(res, uErr);
  if (await usernameTaken(username)) return bad(res, 'Username is taken', 409);
  if (Number.isNaN(Date.parse(birthdate)) || ageFrom(birthdate) < 18) return bad(res, 'You must be 18 or older');
  if (!GENDERS.includes(gender)) return bad(res, 'Invalid gender');
  const interests = parseInterests(interestedIn);
  if (!interests) return bad(res, 'Pick who you want to meet');
  const lookingFor = LOOKING.includes(req.body.lookingFor) ? req.body.lookingFor : '';
  const bio = String(req.body.bio ?? '').slice(0, 300);
  const height = req.body.heightCm == null || req.body.heightCm === '' ? null : Math.round(Number(req.body.heightCm));
  if (height != null && !(height >= 120 && height <= 230)) return bad(res, 'Height should be between 120 and 230 cm');

  const t = now();
  const { rows } = await sql.run(
    `INSERT INTO users (cognito_sub, email, username, password_hash, name, birthdate, gender, interested_in, looking_for, bio, height_cm, last_active, created_at)
     VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    sub, email, username, name.trim().slice(0, 40), birthdate, gender, interests, lookingFor, bio, height, t, t,
  );
  res.json(selfUser(await userById(rows[0].id)));
});

app.get('/api/username-available', async (req, res) => {
  const u = normalizeUsername(req.query.u);
  const error = usernameError(u) || ((await usernameTaken(u)) ? 'Username is taken' : null);
  res.json({ username: u, available: !error, error });
});

// ---------- me ----------

app.get('/api/me', requireAuth, (req, res) => res.json({ ...selfUser(req.user), isAdmin: req.identity.isAdmin }));

app.patch('/api/me', requireAuth, async (req, res) => {
  const { name, bio, city, availableNow, interestedIn, tags, heightCm, turnOns, lookingFor } = req.body || {};
  const u = req.user;
  const look = lookingFor === undefined ? u.looking_for : LOOKING.includes(lookingFor) ? lookingFor : '';
  const turnOnList = turnOns === undefined ? u.turn_ons : parseTurnOns(turnOns).join(',');
  const tagList = tags === undefined ? u.tags : [...new Set((Array.isArray(tags) ? tags : []).filter((t) => TAGS.includes(t)))].slice(0, 5).join(',');
  const height = heightCm === undefined ? u.height_cm : heightCm === null || heightCm === '' ? null : Math.round(Number(heightCm));
  if (height != null && !(height >= 120 && height <= 230)) return bad(res, 'Height should be between 120 and 230 cm');
  const interests = interestedIn !== undefined ? parseInterests(interestedIn) : u.interested_in;
  if (!interests) return bad(res, 'Pick who you want to meet');
  const username = req.body.username !== undefined ? normalizeUsername(req.body.username) : u.username;
  if (username !== u.username) {
    const uErr = usernameError(username);
    if (uErr) return bad(res, uErr);
    if (await usernameTaken(username, u.id)) return bad(res, 'Username is taken', 409);
  }
  await sql.run(
    'UPDATE users SET username = ?, name = ?, bio = ?, city = ?, available_now = ?, interested_in = ?, tags = ?, height_cm = ?, turn_ons = ?, looking_for = ? WHERE id = ?',
    username,
    (name ?? u.name).trim() || u.name,
    String(bio ?? u.bio).slice(0, 300),
    String(city ?? u.city).slice(0, 60),
    availableNow === undefined ? u.available_now : availableNow ? 1 : 0,
    interests,
    tagList,
    height,
    turnOnList,
    look,
    u.id,
  );
  res.json(selfUser(await userById(u.id)));
});

app.post('/api/me/location', requireAuth, async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return bad(res, 'Invalid location');
  const u = req.user;
  const moved = u.lat == null || distanceKm(u, { lat, lng }) > 2;
  let place = { county: u.county, region: u.region, country: u.country };
  if (moved || !u.county || !u.region) {
    try {
      place = await reverseGeocode(lat, lng);
    } catch {
      return bad(res, "Couldn't look up your area, try again", 502);
    }
  }
  await sql.run(
    "UPDATE users SET lat = ?, lng = ?, county = ?, region = ?, country = ?, city = COALESCE(NULLIF(city, ''), ?) WHERE id = ?",
    snap(lat), snap(lng), place.county, place.region, place.country, place.county, u.id,
  );
  res.json(selfUser(await userById(u.id)));
});

// Photos: up to 6, the first one is the main photo shown on cards.
async function savePhotos(userId, list) {
  await sql.run('UPDATE users SET photos = ?, photo = ? WHERE id = ?', JSON.stringify(list), list[0] || '', userId);
  return selfUser(await userById(userId));
}

app.post(
  '/api/me/photo',
  requireAuth,
  (req, res, next) => {
    if (photosOf(req.user).length >= MAX_PHOTOS) return bad(res, `You can have up to ${MAX_PHOTOS} photos`);
    next();
  },
  upload.single('photo'),
  async (req, res) => {
    if (!req.file) return bad(res, `Upload a photo (JPG, PNG, WEBP or HEIC) under ${MAX_UPLOAD_MB}MB`);
    let jpeg;
    try {
      jpeg = await processImage(req.file.buffer);
    } catch {
      return bad(res, "That file doesn't look like a photo");
    }
    try {
      const url = await savePhoto(jpeg);
      // Re-read: another upload may have finished while this one was processing.
      const current = photosOf(await userById(req.user.id));
      if (current.length >= MAX_PHOTOS) {
        await deletePhoto(url);
        return bad(res, `You can have up to ${MAX_PHOTOS} photos`);
      }
      res.json(await savePhotos(req.user.id, [...current, url]));
    } catch (e) {
      console.error('photo upload failed', e);
      bad(res, "Couldn't save the photo, try again", 502);
    }
  },
);

app.delete('/api/me/photos/:i', requireAuth, async (req, res) => {
  const list = photosOf(req.user);
  const [removed] = list.splice(Number(req.params.i), 1);
  if (!removed) return bad(res, 'Photo not found', 404);
  await deletePhoto(removed);
  res.json(await savePhotos(req.user.id, list));
});

app.post('/api/me/photos/:i/main', requireAuth, async (req, res) => {
  const list = photosOf(req.user);
  const [picked] = list.splice(Number(req.params.i), 1);
  if (!picked) return bad(res, 'Photo not found', 404);
  res.json(await savePhotos(req.user.id, [picked, ...list]));
});

app.get('/api/tags', (req, res) => res.json(TAGS));
app.get('/api/turn-ons', (req, res) => res.json(TURN_ONS));

app.delete('/api/me', requireAuth, async (req, res) => {
  // Remove their uploaded photos too (awaited: on Lambda, unfinished work can be frozen after the response).
  await Promise.all(photosOf(req.user).map(deletePhoto));
  await sql.run('DELETE FROM users WHERE id = ?', req.user.id);
  res.json({ ok: true });
});

// ---------- discover & swipe ----------

app.get('/api/discover', requireAuth, async (req, res) => {
  const me = req.user;
  const mine = me.interested_in.split(',');
  const demo = await demoMode();
  const rows = await sql.all(
    `SELECT u.*, (SELECT created_at FROM swipes WHERE from_id = ? AND to_id = u.id) AS seen_at FROM users u
     WHERE u.id != ?
       AND COALESCE(u.banned, 0) = 0
       AND (',' || u.interested_in || ',') LIKE ?
       AND (u.id NOT IN (SELECT to_id FROM swipes WHERE from_id = ?) OR (? = 1 AND u.cognito_sub IS NULL))
       AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
       AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
       AND u.gender IN (${mine.map(() => '?').join(',')})
     ORDER BY u.last_active DESC
     LIMIT 500`,
    me.id, me.id, `%,${me.gender},%`, me.id, demo ? 1 : 0, me.id, me.id, ...mine,
  );

  // Unseen people first; then 3+ turn-ons in common; then same county, then by distance; "available now" gets a nudge; no location goes last.
  // (Already-seen people only appear in demo mode, least recently seen first.)
  const maxKm = Number(req.query.maxKm) || 100;
  const ranked = rows
    .map((u) => ({
      u,
      km: distanceKm(me, u),
      same: !!me.county && u.county === me.county && u.region === me.region,
      common: inCommon(me, u).length,
    }))
    // In demo mode, demo profiles ignore the distance limit so a tester anywhere always has a deck.
    .filter((r) => r.same || r.km == null || r.km <= maxKm || (demo && r.u.cognito_sub == null))
    .sort(
      (a, b) =>
        (a.u.seen_at ?? 0) - (b.u.seen_at ?? 0) ||
        // 3+ turn-ons in common jumps the queue, then more in common, then closer.
        (b.common >= 3) - (a.common >= 3) ||
        b.same - a.same ||
        Math.min(b.common, 5) - Math.min(a.common, 5) ||
        (a.km ?? 1e9) - (b.km ?? 1e9) - (b.u.available_now - a.u.available_now) * 5,
    )
    .slice(0, 20);
  res.json(ranked.map((r) => publicUser(r.u, me)));
});

app.post('/api/swipe', requireAuth, async (req, res) => {
  const { userId, dir } = req.body || {};
  if (!['like', 'pass'].includes(dir)) return bad(res, 'Invalid swipe');
  const other = await userById(userId);
  if (!other || other.id === req.user.id) return bad(res, 'User not found', 404);

  await sql.run(
    'INSERT INTO swipes (from_id, to_id, dir, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (from_id, to_id) DO UPDATE SET dir = excluded.dir, created_at = excluded.created_at',
    req.user.id, other.id, dir, now(),
  );
  if (dir === 'pass') return res.json({ match: null });

  const likedBack =
    ((await demoMode()) && other.cognito_sub == null) ||
    (await sql.one("SELECT 1 FROM swipes WHERE from_id = ? AND to_id = ? AND dir = 'like'", other.id, req.user.id));
  if (!likedBack) return res.json({ match: null });

  const [a, b] = [req.user.id, other.id].sort((x, y) => x - y);
  const { changes } = await sql.run('INSERT INTO matches (a, b, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', a, b, now());
  const m = await sql.one('SELECT id FROM matches WHERE a = ? AND b = ?', a, b);
  res.json({ match: { id: m.id, isNew: changes > 0, user: publicUser(other, req.user) } });
});

// ---------- matches & chat ----------

async function loadMatch(req, res) {
  const m = await sql.one('SELECT * FROM matches WHERE id = ? AND (a = ? OR b = ?)', req.params.id, req.user.id, req.user.id);
  if (!m) bad(res, 'Match not found', 404);
  return m;
}

app.get('/api/matches', requireAuth, async (req, res) => {
  const me = req.user.id;
  const rows = await sql.all(
    `SELECT u.*, m.id AS match_id, m.created_at AS matched_at,
            (SELECT body FROM messages WHERE match_id = m.id ORDER BY id DESC LIMIT 1) AS last_body,
            (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY id DESC LIMIT 1) AS last_at
     FROM matches m
     JOIN users u ON u.id = CASE WHEN m.a = ? THEN m.b ELSE m.a END
     WHERE (m.a = ? OR m.b = ?) AND COALESCE(u.banned, 0) = 0`,
    me, me, me,
  );
  rows.sort((x, y) => (y.last_at ?? y.matched_at) - (x.last_at ?? x.matched_at));
  res.json(
    await Promise.all(
      rows.map(async (r) => ({
        id: r.match_id,
        createdAt: r.matched_at,
        lastMessage: r.last_body,
        lastAt: r.last_at,
        bothDown: (await downState(r.match_id, me)).both,
        user: publicUser(r, req.user),
      })),
    ),
  );
});

// ---------- "down" signal ----------
// Each person can privately say they're down. The other person only learns it when both have said it —
// so nobody is exposed or turned down. Signals last 12 hours and can be withdrawn anytime.
const DOWN_TTL = 12 * 60 * 60 * 1000;

async function downState(matchId, meId) {
  const live = await sql.all('SELECT user_id, created_at, expires_at FROM down_signals WHERE match_id = ? AND expires_at > ?', matchId, now());
  const mine = live.find((s) => s.user_id === meId);
  const both = live.length === 2;
  return {
    mine: !!mine,
    mineExpiresAt: mine?.expires_at ?? null,
    both,
    bothSince: both ? Math.max(...live.map((s) => s.created_at)) : null,
  };
}

const signalDown = (matchId, userId, t) =>
  sql.run(
    'INSERT INTO down_signals (match_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (match_id, user_id) DO UPDATE SET created_at = excluded.created_at, expires_at = excluded.expires_at',
    matchId, userId, t, t + DOWN_TTL,
  );

app.post('/api/matches/:id/down', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  const t = now();
  await signalDown(m.id, req.user.id, t);
  // Testing only: demo profiles are always down too.
  const other = await userById(m.a === req.user.id ? m.b : m.a);
  if ((await demoMode()) && other?.cognito_sub == null) await signalDown(m.id, other.id, t);
  res.json(await downState(m.id, req.user.id));
});

app.delete('/api/matches/:id/down', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  await sql.run('DELETE FROM down_signals WHERE match_id = ? AND user_id = ?', m.id, req.user.id);
  res.json(await downState(m.id, req.user.id));
});

app.get('/api/matches/:id', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  const otherId = m.a === req.user.id ? m.b : m.a;
  const after = Number(req.query.after) || 0;
  const [messages, meetups, other, down] = await Promise.all([
    sql.all('SELECT * FROM messages WHERE match_id = ? AND id > ? ORDER BY id', m.id, after),
    sql.all('SELECT * FROM meetups WHERE match_id = ? ORDER BY id', m.id),
    userById(otherId),
    downState(m.id, req.user.id),
  ]);
  res.json({
    id: m.id,
    user: publicUser(other, req.user),
    messages: messages.map((x) => ({ id: x.id, senderId: x.sender_id, body: x.body, createdAt: x.created_at })),
    meetups: meetups.map((x) => ({ id: x.id, proposerId: x.proposer_id, place: x.place, time: x.time, status: x.status, createdAt: x.created_at })),
    down,
  });
});

app.post('/api/matches/:id/messages', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  const body = String(req.body?.body || '').trim().slice(0, 1000);
  if (!body) return bad(res, 'Empty message');
  const t = now();
  const { rows } = await sql.run('INSERT INTO messages (match_id, sender_id, body, created_at) VALUES (?, ?, ?, ?) RETURNING id', m.id, req.user.id, body, t);
  res.json({ id: rows[0].id, senderId: req.user.id, body, createdAt: t });
});

app.post('/api/matches/:id/meetups', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  const place = String(req.body?.place || '').trim().slice(0, 120);
  const time = String(req.body?.time || '');
  if (!place || Number.isNaN(Date.parse(time))) return bad(res, 'Add a place and time');
  await sql.run("UPDATE meetups SET status = 'declined' WHERE match_id = ? AND status = 'pending'", m.id);
  await sql.run('INSERT INTO meetups (match_id, proposer_id, place, time, created_at) VALUES (?, ?, ?, ?, ?)', m.id, req.user.id, place, time, now());
  res.json({ ok: true });
});

app.post('/api/matches/:id/meetups/:mid', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  const status = req.body?.status;
  if (!['accepted', 'declined'].includes(status)) return bad(res, 'Invalid status');
  const mu = await sql.one('SELECT * FROM meetups WHERE id = ? AND match_id = ?', req.params.mid, m.id);
  if (!mu) return bad(res, 'Meetup not found', 404);
  if (mu.proposer_id === req.user.id && status === 'accepted') return bad(res, "You can't accept your own invite");
  await sql.run('UPDATE meetups SET status = ? WHERE id = ?', status, mu.id);
  res.json({ ok: true });
});

app.delete('/api/matches/:id', requireAuth, async (req, res) => {
  const m = await loadMatch(req, res);
  if (!m) return;
  await sql.run('DELETE FROM matches WHERE id = ?', m.id);
  res.json({ ok: true });
});

// ---------- safety ----------

async function removeMatchWith(me, other) {
  const [a, b] = [me, other].sort((x, y) => x - y);
  await sql.run('DELETE FROM matches WHERE a = ? AND b = ?', a, b);
}

const blockUser = (me, other) => sql.run('INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING', me, other);

app.post('/api/block', requireAuth, async (req, res) => {
  const id = Number(req.body?.userId);
  if (!id || id === req.user.id || !(await userById(id))) return bad(res, 'Invalid user');
  await blockUser(req.user.id, id);
  await removeMatchWith(req.user.id, id);
  res.json({ ok: true });
});

app.post('/api/report', requireAuth, async (req, res) => {
  const id = Number(req.body?.userId);
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!id || id === req.user.id || !reason || !(await userById(id))) return bad(res, 'Add a reason');
  await sql.run('INSERT INTO reports (reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?)', req.user.id, id, reason, now());
  await blockUser(req.user.id, id);
  await removeMatchWith(req.user.id, id);
  res.json({ ok: true });
});

app.use('/api/admin', admin);

// When one server also serves the built web app (local/EC2): unknown paths fall back to index.html.
if (process.env.STATIC_DIR) {
  app.use(express.static(process.env.STATIC_DIR));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(process.env.STATIC_DIR, 'index.html')));
}

// Unexpected errors: log them, answer with a plain 500 (Express 5 routes async errors here).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return bad(res, `That photo is too big — keep it under ${MAX_UPLOAD_MB}MB`, 413);
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong' });
});

// Listen only when run directly (node src/server.js); tests and the Lambda handler import `app`.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  app.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`API on http://localhost:${PORT}`));
}
