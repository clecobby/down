import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distanceKm, fuzzyKm } from './geo.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(process.env.DB_PATH || path.join(dir, '..', 'down.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cognito_sub   TEXT,                     -- Cognito user id; null for seeded demo profiles
    email         TEXT UNIQUE NOT NULL,
    username      TEXT,
    password_hash TEXT NOT NULL DEFAULT '', -- unused since Cognito; kept for old databases
    name          TEXT NOT NULL,
    birthdate     TEXT NOT NULL,
    gender        TEXT NOT NULL,            -- man | woman | nonbinary
    interested_in TEXT NOT NULL,            -- comma list of genders
    bio           TEXT DEFAULT '',
    photo         TEXT DEFAULT '',          -- main photo (= first of photos)
    photos        TEXT DEFAULT '',          -- JSON array, up to 6
    tags          TEXT DEFAULT '',          -- comma list of vibe tags
    height_cm     INTEGER,
    city          TEXT DEFAULT '',
    available_now INTEGER DEFAULT 0,
    lat           REAL,
    lng           REAL,
    county        TEXT DEFAULT '',
    region        TEXT DEFAULT '',
    country       TEXT DEFAULT '',
    last_active   INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS swipes (
    from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dir        TEXT NOT NULL,               -- like | pass
    created_at INTEGER NOT NULL,
    PRIMARY KEY (from_id, to_id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    a          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    UNIQUE (a, b)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meetups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    proposer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    place       TEXT NOT NULL,
    time        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  -- Runtime settings the admin dashboard can change (e.g. demo mode).
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Who did what in the admin dashboard.
  CREATE TABLE IF NOT EXISTS admin_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    admin      TEXT NOT NULL,              -- admin's email
    action     TEXT NOT NULL,
    target     TEXT,
    detail     TEXT,
    created_at INTEGER NOT NULL
  );
`);

// Add columns to databases created before they existed.
const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
for (const [name, type] of [['banned', 'INTEGER DEFAULT 0'], ['banned_reason', "TEXT DEFAULT ''"], ['photos', "TEXT DEFAULT ''"], ['tags', "TEXT DEFAULT ''"], ['height_cm', 'INTEGER'], ['cognito_sub', 'TEXT'], ['username', 'TEXT'], ['lat', 'REAL'], ['lng', 'REAL'], ['county', "TEXT DEFAULT ''"], ['region', "TEXT DEFAULT ''"], ['country', "TEXT DEFAULT ''"]]) {
  if (!cols.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_cognito_sub ON users(cognito_sub)');
db.exec('CREATE INDEX IF NOT EXISTS users_county ON users(country, region, county)');
const reportCols = new Set(db.prepare('PRAGMA table_info(reports)').all().map((c) => c.name));
if (!reportCols.has('status')) db.exec("ALTER TABLE reports ADD COLUMN status TEXT DEFAULT 'open'"); // open | dismissed | actioned
if (!reportCols.has('resolved_at')) db.exec('ALTER TABLE reports ADD COLUMN resolved_at INTEGER');

export const getSetting = (key, fallback) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
export const setSetting = (key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

export const now = () => Date.now();

export function ageFrom(birthdate) {
  const b = new Date(birthdate);
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
  return age;
}

export function photosOf(u) {
  try {
    const list = JSON.parse(u.photos || '[]');
    if (Array.isArray(list) && list.length) return list;
  } catch {}
  return u.photo ? [u.photo] : [];
}

// Shape a user row for other people to see (never leaks email / hash / birthdate / coordinates).
// Pass the viewer to include how close they are.
export function publicUser(u, viewer) {
  if (!u) return null;
  const km = viewer ? distanceKm(viewer, u) : null;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    age: ageFrom(u.birthdate),
    gender: u.gender,
    bio: u.bio,
    photo: photosOf(u)[0] || '',
    photos: photosOf(u),
    tags: u.tags ? u.tags.split(',') : [],
    heightCm: u.height_cm ?? null,
    city: u.city,
    county: u.county,
    sameCounty: !!viewer?.county && viewer.county === u.county && viewer.region === u.region,
    distanceKm: fuzzyKm(km),
    availableNow: !!u.available_now,
    lastActive: u.last_active,
  };
}

export function selfUser(u) {
  return {
    ...publicUser(u),
    email: u.email,
    birthdate: u.birthdate,
    interestedIn: u.interested_in.split(','),
    region: u.region,
    country: u.country,
    hasLocation: u.lat != null,
  };
}
