import Constants from 'expo-constants';
import { getIdToken } from './cognito';

// EXPO_PUBLIC_API_URL (mobile/.env) points at the live server. Without it, use a local backend on the machine
// serving the JS bundle (works on simulators and on phones on the same Wi-Fi).
const devHost = Constants.expoConfig?.hostUri?.split(':')[0] || 'localhost';
export const API = process.env.EXPO_PUBLIC_API_URL || `http://${devHost}:4000`;

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

export const photoUrl = (p) => (!p ? null : p.startsWith('http') ? p : API + p);

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Sends the Cognito ID token (refreshed automatically when it's about to expire).
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = await getIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(API + '/api' + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch {
    throw new Error(`Can't reach the server (${API})`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status, data);
  return data;
}
