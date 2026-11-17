import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { db, now } from './db.js';

// Login, signup, email verification and password reset are handled by Amazon Cognito.
// The browser sends the Cognito ID token; we verify it against the user pool's keys and
// map its `sub` to a profile row.
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: (process.env.COGNITO_CLIENT_ID || '').split(','), // web and mobile app clients
  tokenUse: 'id',
});

const touch = db.prepare('UPDATE users SET last_active = ? WHERE id = ?');
const findBySub = db.prepare('SELECT * FROM users WHERE cognito_sub = ?');

async function identify(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const claims = await verifier.verify(token);
  if (!claims.email_verified) throw new Error('Email not verified');
  return { sub: claims.sub, email: String(claims.email).toLowerCase() };
}

// Signed in with Cognito, profile may not exist yet (used to create the profile).
export async function requireIdentity(req, res, next) {
  try {
    req.identity = await identify(req);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Signed in and has a profile.
export async function requireAuth(req, res, next) {
  try {
    req.identity = await identify(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = findBySub.get(req.identity.sub);
  if (!user) return res.status(404).json({ error: 'Profile not set up', needsProfile: true });
  touch.run(now(), user.id);
  req.user = user;
  next();
}
