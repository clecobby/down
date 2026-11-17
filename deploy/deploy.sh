#!/usr/bin/env bash
# Build the web app and ship it to the server. Usage: deploy/deploy.sh <public-ip>
# Cognito ids are read from frontend/.env.production.
set -euo pipefail
IP="$1"
KEY="${KEY:-$HOME/.ssh/down-web.pem}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a; . "$ROOT/frontend/.env.production"; . "$ROOT/mobile/.env"; set +a
MOBILE_COGNITO_CLIENT_ID="$EXPO_PUBLIC_COGNITO_CLIENT_ID"
# Profile photos: S3 bucket + CloudFront domain (see README).
PHOTOS_BUCKET="${PHOTOS_BUCKET:-down-photos-504886488640}"
PHOTOS_CDN="${PHOTOS_CDN:-d19w0z98a0ngg3.cloudfront.net}"

(cd "$ROOT/frontend" && npm run build)
tar -czf /tmp/down.tgz -C "$ROOT" --exclude node_modules --exclude 'backend/uploads' --exclude '*.db*' \
  backend/package.json backend/package-lock.json backend/src frontend/dist
scp -i "$KEY" -o StrictHostKeyChecking=accept-new /tmp/down.tgz "$ROOT/deploy/setup.sh" "ubuntu@$IP:/tmp/"
ssh -i "$KEY" "ubuntu@$IP" "sudo bash /tmp/setup.sh $IP $VITE_COGNITO_USER_POOL_ID $VITE_COGNITO_CLIENT_ID,$MOBILE_COGNITO_CLIENT_ID ${DEMO_MODE:-0} $PHOTOS_BUCKET $PHOTOS_CDN"
