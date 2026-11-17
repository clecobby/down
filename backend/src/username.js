// Username rules:
// 3–20 chars, lowercase letters, digits, "." and "_", must start with a letter,
// can't end with "." or "_", no ".." / "__" / "._" runs, not a reserved word.
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'support', 'help', 'staff', 'mod', 'moderator', 'official',
  'down', 'downapp', 'team', 'security', 'system', 'null', 'undefined', 'me', 'you', 'api', 'www',
]);

export const normalizeUsername = (u) => String(u || '').trim().replace(/^@/, '').toLowerCase();

export function usernameError(raw) {
  const u = normalizeUsername(raw);
  if (u.length < 3) return 'Username must be at least 3 characters';
  if (u.length > 20) return 'Username can be at most 20 characters';
  if (!/^[a-z]/.test(u)) return 'Username must start with a letter';
  if (!/^[a-z0-9._]+$/.test(u)) return 'Only letters, numbers, . and _';
  if (/[._]$/.test(u)) return "Username can't end with . or _";
  if (/[._]{2}/.test(u)) return "No double dots or underscores";
  if (RESERVED.has(u.replace(/[._\d]/g, ''))) return 'That username is reserved';
  return null;
}
