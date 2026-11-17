import { fetchAuthSession } from 'aws-amplify/auth';

// In production the backend serves this app, so API calls are same-origin.
export const API = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');

export const photoUrl = (p) => (!p ? '' : p.startsWith('http') ? p : API + p);

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Attaches the Cognito ID token (Amplify refreshes it automatically when it expires).
export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = (await fetchAuthSession().catch(() => ({}))).tokens?.idToken?.toString();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + '/api' + path, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong', res.status, data);
  return data;
}
