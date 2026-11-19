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

## Production (serverless, ~$0–1/month at low traffic)

Live at **https://d2lfawokdyd1nt.cloudfront.net** (website + API on one address).

### Branches and environments

| Branch | Deploys to | Notes |
|---|---|---|
| `main` | **production** https://d2lfawokdyd1nt.cloudfront.net | automatic on push to CodeCommit (CodePipeline `down-prod`) |
| `dev` | **dev** https://d3nrslazsd4mxv.cloudfront.net | automatic on push to CodeCommit (CodePipeline `down-dev`); shared testing, own database + photos, 88 demo profiles |
| anything else (e.g. `clecobby`) | nothing | CodeBuild `down-checks` runs tests/build/lint |

Flow: work on your branch → pull request into `dev` → test on dev → pull request `dev` → `main`.
Dev and production share the Cognito login (same account works on both) but have separate data.
Code flow: everyone pushes to **GitHub** (clecobby/down). `deploy/sync-github.sh` copies GitHub's branches to
**CodeCommit** (`origin`, never forced). A push to CodeCommit fires EventBridge rules (`down-push-main/dev/other`):
`main` → CodePipeline `down-prod`, `dev` → `down-dev` (CodeBuild runs `deploy/buildspec.yml`: tests, then
`deploy/deploy-aws.sh`; each build role can only touch its own stage), other branches → CodeBuild `down-checks`
(`deploy/checks-buildspec.yml`, tests only). No GitHub Actions, no AWS keys on GitHub.

Mobile: `eas.json` profiles `dev` (channel `dev`, installable APK / iOS internal build) and `production`.
Each deploy also publishes an over-the-air update to the matching channel when the SSM parameter `/down/expo-token` exists,
so installed apps pick up new code on next launch. `npx expo start` locally talks to the dev server (`mobile/.env`).

| Piece | Service |
|---|---|
| API | Lambda `down-api` / `down-api-dev` (Node 24, arm64) behind a function URL that only CloudFront may call (secret origin header) |
| Database | Aurora DSQL (serverless Postgres, IAM auth, app role `down_app`); local dev/tests use SQLite |
| Website | S3 `down-web-<account>` + CloudFront (SPA routing function, security headers policy) |
| Photos | S3 `down-photos-<account>` + CloudFront (dev: `photos/` in the dev site bucket), re-encoded with metadata stripped |
| Login | Cognito user pool `us-east-1_Lbp099d7v` (web: Amplify, mobile: Cognito API) |

```bash
deploy/deploy-aws.sh dev         # manual deploy of API + website (prod|dev, optional api|web)
cd backend && npm test           # 19 tests on SQLite
DSQL_HOST=<cluster>.dsql.us-east-1.on.aws node --experimental-test-module-mocks --test test/flow.test.js   # full flow against DSQL
DSQL_HOST=… npm run migrate      # create/upgrade DSQL tables
aws logs tail /aws/lambda/down-api --follow   # API logs
```
Lambda settings (DSQL host, Cognito ids, photo bucket, origin secret, DEMO_MODE) live in the function's configuration.
Uploads are capped at 4 MB on Lambda (request size limit).

The old single-server setup (`deploy/deploy.sh`, EC2 `i-0a5e94e032614c5c1`) is **stopped**, kept for rollback.
