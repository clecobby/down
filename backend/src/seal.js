import crypto from 'node:crypto';

// Encrypts location points before they're stored (AES-256-GCM). The key comes from LOCATION_KEY
// (32 bytes, base64). Without it the key is derived from ORIGIN_SECRET, which only the server has;
// local development falls back to a fixed key and says so. Points live 24 hours, so a key change
// only makes the last day's points unreadable.
let key;
function getKey() {
  if (key) return key;
  if (process.env.LOCATION_KEY) {
    key = Buffer.from(process.env.LOCATION_KEY, 'base64');
    if (key.length !== 32) throw new Error('LOCATION_KEY must be 32 bytes, base64-encoded');
  } else {
    const secret = process.env.ORIGIN_SECRET;
    if (!secret) console.warn('LOCATION_KEY and ORIGIN_SECRET are unset: using a development-only location key');
    key = Buffer.from(crypto.hkdfSync('sha256', secret || 'local-development-only', 'down', 'location-v1', 32));
  }
  return key;
}

// `bind` (e.g. the owner's user id) is authenticated with the data, so a point can't be moved to another user.
export function seal(value, bind = '') {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  c.setAAD(Buffer.from(String(bind)));
  const body = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

export function unseal(text, bind = '') {
  const raw = Buffer.from(String(text).replace(/^v1\./, ''), 'base64url');
  const d = crypto.createDecipheriv('aes-256-gcm', getKey(), raw.subarray(0, 12));
  d.setAAD(Buffer.from(String(bind)));
  d.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString());
}

export const randomToken = () => crypto.randomBytes(24).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
