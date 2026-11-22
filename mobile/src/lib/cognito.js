import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Auth goes through our own API, which forwards each call to Amazon Cognito server-side. Some mobile
// networks can't reach cognito-idp directly, but they can reach our API. (The mobile app client allows
// USER_PASSWORD_AUTH; the password travels over TLS to our API and on to Cognito.)
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;
const devHost = Constants.expoConfig?.hostUri?.split(':')[0] || 'localhost';
const API = process.env.EXPO_PUBLIC_API_URL || `http://${devHost}:4000`;
const PROXY = `${API}/api/cognito`;

class CognitoError extends Error {
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

async function call(action, body) {
  let res;
  try {
    res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, body }),
    });
  } catch {
    throw new CognitoError('NetworkError', "Can't reach the login service. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CognitoError((data.__type || '').split('#').pop(), data.message || 'Something went wrong');
  return data;
}

// Short, human messages for our UI.
const MESSAGES = {
  UsernameExistsException: 'An account with this email already exists. Try logging in.',
  NotAuthorizedException: 'Wrong email or password.',
  UserNotFoundException: 'Wrong email or password.',
  CodeMismatchException: "That code isn't right. Check your email and try again.",
  ExpiredCodeException: 'That code has expired. Send a new one.',
  LimitExceededException: 'Too many attempts. Wait a bit and try again.',
  TooManyRequestsException: 'Too many attempts. Wait a bit and try again.',
  InvalidPasswordException: 'Password needs 10+ characters with upper and lower case letters and a number.',
  InvalidParameterException: 'Please check what you entered.',
};
export function authMessage(e) {
  // Cognito's InvalidParameterException covers several input problems; say which one.
  if (e?.name === 'InvalidParameterException') {
    const m = e.message || '';
    if (/'password'/.test(m)) return "Your password can't start or end with a space.";
    if (/'username'|email/i.test(m)) return "That email doesn't look right. Check for spaces or typos.";
  }
  return MESSAGES[e?.name] || e?.message || 'Something went wrong';
}

// Emails: drop spaces and invisible characters that keyboards and autofill sometimes add.
export const cleanEmail = (s) => (s || '').replace(/[\s​-‍⁠﻿]/g, '').toLowerCase();

// ---- token storage (each token in its own key: SecureStore values should stay small) ----

const KEYS = ['idToken', 'accessToken', 'refreshToken', 'expiresAt'];
let session = null; // { idToken, accessToken, refreshToken, expiresAt }

async function saveSession(result, refreshToken) {
  session = {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken || refreshToken,
    expiresAt: String(Date.now() + result.ExpiresIn * 1000),
  };
  await Promise.all(KEYS.map((k) => SecureStore.setItemAsync(k, session[k])));
}

async function clearSession() {
  session = null;
  await Promise.all(KEYS.map((k) => SecureStore.deleteItemAsync(k)));
}

export async function loadSession() {
  const values = await Promise.all(KEYS.map((k) => SecureStore.getItemAsync(k)));
  session = values[2] ? Object.fromEntries(KEYS.map((k, i) => [k, values[i]])) : null;
  return !!session;
}

// A valid ID token for our API, refreshing it when it's about to expire. Null when signed out.
let refreshing = null;
export async function getIdToken() {
  if (!session) return null;
  if (Date.now() < Number(session.expiresAt) - 60_000) return session.idToken;
  refreshing ??= call('GetTokensFromRefreshToken', { ClientId: CLIENT_ID, RefreshToken: session.refreshToken })
    .then((r) => saveSession(r, session.refreshToken))
    .catch(async () => clearSession())
    .finally(() => (refreshing = null));
  await refreshing;
  return session?.idToken ?? null;
}

// ---- account flows ----

// Kept in memory only, so confirming the email can sign straight in without asking for the password again.
let pending = null;
export const rememberForAutoSignIn = (email, password) => (pending = { email, password });
export function takeAutoSignIn(email) {
  const p = pending?.email === email ? pending : null;
  pending = null;
  return p;
}

export const signUp = (email, password) =>
  call('SignUp', { ClientId: CLIENT_ID, Username: email, Password: password, UserAttributes: [{ Name: 'email', Value: email }] });

export const confirmSignUp = (email, code) => call('ConfirmSignUp', { ClientId: CLIENT_ID, Username: email, ConfirmationCode: code });

export const resendCode = (email) => call('ResendConfirmationCode', { ClientId: CLIENT_ID, Username: email });

// Returns 'DONE' or 'CONFIRM_SIGN_UP' (account exists but email isn't verified yet).
export async function signIn(email, password) {
  try {
    const r = await call('InitiateAuth', { AuthFlow: 'USER_PASSWORD_AUTH', ClientId: CLIENT_ID, AuthParameters: { USERNAME: email, PASSWORD: password } });
    await saveSession(r.AuthenticationResult);
    return 'DONE';
  } catch (e) {
    if (e.name === 'UserNotConfirmedException') return 'CONFIRM_SIGN_UP';
    throw e;
  }
}

export async function signOut() {
  if (session?.refreshToken) await call('RevokeToken', { ClientId: CLIENT_ID, Token: session.refreshToken }).catch(() => {});
  await clearSession();
}

export const forgotPassword = (email) => call('ForgotPassword', { ClientId: CLIENT_ID, Username: email });

export const confirmForgotPassword = (email, code, password) =>
  call('ConfirmForgotPassword', { ClientId: CLIENT_ID, Username: email, ConfirmationCode: code, Password: password });

export async function deleteUser() {
  await getIdToken(); // make sure the access token is fresh
  await call('DeleteUser', { AccessToken: session.accessToken });
  await clearSession();
}
