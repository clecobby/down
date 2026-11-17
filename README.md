# down.

A minimal dating app for people who want the same thing. Swipe or tap, match, talk, meet.

```
mobile/    iOS + Android app — Expo SDK 58 (React Native), Expo Router     ← the product
backend/   Express + SQLite (node:sqlite), JWT auth, photo uploads   → http://localhost:4000
frontend/  React + Vite web version (optional)                       → http://localhost:5173
```

## Run

```bash
cd backend && cp .env.example .env && npm install && npm run seed && npm run dev
cd mobile  && npm install && npx expo start      # press i for iOS simulator, or scan the QR with Expo Go on your phone
```

Your phone must be on the same Wi-Fi as your computer; the app finds the backend automatically on the same host as the dev server.
Set `EXPO_PUBLIC_API_URL` to point it somewhere else (e.g. a deployed backend).

Accounts are handled by **Amazon Cognito** (user pool `us-east-1_Lbp099d7v`): sign-up with email code, login, forgot password and delete account all run through Cognito, on our own screens (`aws-amplify` in the browser). The backend only verifies Cognito ID tokens (`aws-jwt-verify`) and stores the dating profile, linked by the Cognito `sub`.
Seeded profiles are swipe-only demo data; nobody can log in as them.

## Features
- 18+ check on signup (server-side), gender + "into" preferences, matching works in both directions
- Usernames: 3–20 chars, letters/numbers/`.`/`_`, starts with a letter, unique, reserved words blocked; live availability check
- Location down to the county: same-county people first, then by distance. Exact coordinates are never shared — only county + rough distance
- Swipe (drag) or tap ✕ / ♥ — a mutual like is a match
- "Available now" toggle puts you at the top of the deck
- Chat with quick openers; 📍 lets you suggest a place and time, and the other person accepts or declines
- Unmatch, block and report from any chat; delete account from your profile

## Config (env)
| var | default |
|---|---|
| `PORT` (backend) | 4000 |
| `JWT_SECRET` | dev-secret-change-me, **change this in production** |
| `CORS_ORIGIN` | http://localhost:5173 |
| `DB_PATH` | backend/down.db |
| `VITE_API_URL` (frontend) | http://localhost:4000 |

## Production (single AWS server)

Live at **https://184-193-84-159.sslip.io** (EC2 `t4g.small`, us-east-1, Elastic IP `184.193.84.159`, instance `i-0a5e94e032614c5c1`).
Caddy serves HTTPS (auto Let's Encrypt via sslip.io) and proxies to the Node app, which serves both the API and the built web app.

```bash
deploy/deploy.sh 184.193.84.159          # build + ship + restart (uses ~/.ssh/down-web.pem)
ssh -i ~/.ssh/down-web.pem ubuntu@184.193.84.159
sudo journalctl -u down -f               # app logs
```
Data: `/var/lib/down/down.db` (SQLite) and `/opt/down/backend/uploads`. Config: `/etc/down.env`.
SSH is only open to the admin IP in security group `down-web-sg` — update it if your IP changes.
