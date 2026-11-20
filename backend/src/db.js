import { sql } from './sql.js';
import { distanceKm, fuzzyKm, fuzzyMi } from './geo.js';
import { inCommon, turnOnsOf } from './turnons.js';

export { sql };

export const getSetting = async (key, fallback) => (await sql.one('SELECT value FROM settings WHERE key = ?', key))?.value ?? fallback;
export const setSetting = (key, value) =>
  sql.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, String(value));

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
    // Only the overlap with the viewer is ever shared, never someone's full list.
    inCommon: viewer ? inCommon(viewer, u) : [],
    distanceKm: fuzzyKm(km),
    distanceMi: fuzzyMi(km),
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
    turnOns: turnOnsOf(u),
  };
}
