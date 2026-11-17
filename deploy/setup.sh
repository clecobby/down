#!/usr/bin/env bash
# One-time / re-runnable server setup for a single Ubuntu 24.04 box.
# Usage (on the server): sudo bash setup.sh <public-ip> <cognito-user-pool-id> <cognito-client-id>   — expects /tmp/down.tgz from deploy.sh
set -euo pipefail
IP="$1"
COGNITO_USER_POOL_ID="$2"
COGNITO_CLIENT_ID="$3"   # comma-separated: web,mobile
PHOTOS_BUCKET="${5:-}"   # S3 bucket for profile photos (empty = local disk)
PHOTOS_CDN="${6:-}"      # CloudFront domain serving that bucket
DEMO_MODE="${4:-0}"  # 1 = endless demo deck, liking a demo profile is a match (testing only)
HOST="${IP//./-}.sslip.io"   # free DNS name that resolves to the IP, so Caddy can get a real HTTPS cert

if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

id down >/dev/null 2>&1 || useradd --system --home /opt/down --shell /usr/sbin/nologin down
mkdir -p /opt/down /var/lib/down
tar -xzf /tmp/down.tgz -C /opt/down
mkdir -p /opt/down/backend/uploads
(cd /opt/down/backend && npm ci --omit=dev --no-audit --no-fund)
chown -R down:down /opt/down /var/lib/down

if [ ! -f /etc/down.env ]; then
  cat > /etc/down.env <<ENV
NODE_ENV=production
PORT=4000
HOST=127.0.0.1
DB_PATH=/var/lib/down/down.db
STATIC_DIR=/opt/down/frontend/dist
CORS_ORIGIN=https://$HOST
ENV
  chmod 600 /etc/down.env
  # Demo profiles so the app isn't empty on first visit.
  (cd /opt/down/backend && runuser -u down -- env DB_PATH=/var/lib/down/down.db node src/seed.js)
fi

sed -i '/^JWT_SECRET=/d; /^COGNITO_/d; /^DEMO_MODE=/d; /^DEMO_AUTOLIKE=/d; /^PHOTOS_/d; /^AWS_REGION=/d' /etc/down.env
printf 'COGNITO_USER_POOL_ID=%s\nCOGNITO_CLIENT_ID=%s\nDEMO_MODE=%s\nPHOTOS_BUCKET=%s\nPHOTOS_CDN=%s\nAWS_REGION=us-east-1\n' \
  "$COGNITO_USER_POOL_ID" "$COGNITO_CLIENT_ID" "${DEMO_MODE:-0}" "$PHOTOS_BUCKET" "$PHOTOS_CDN" >> /etc/down.env

cat > /etc/systemd/system/down.service <<UNIT
[Unit]
Description=down web app
After=network.target

[Service]
User=down
EnvironmentFile=/etc/down.env
WorkingDirectory=/opt/down/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/down /opt/down/backend/uploads

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
  encode gzip
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    Referrer-Policy strict-origin-when-cross-origin
    Permissions-Policy "geolocation=(self), camera=(), microphone=()"
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://$PHOTOS_CDN https://randomuser.me https://picsum.photos https://fastly.picsum.photos; connect-src 'self' https://cognito-idp.us-east-1.amazonaws.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    -Server
  }
  request_body {
    max_size 6MB
  }
  reverse_proxy 127.0.0.1:4000
}

# Visiting the bare IP sends you to the HTTPS name.
http://$IP {
  redir https://$HOST{uri} permanent
}
CADDY

systemctl daemon-reload
systemctl enable --now down
systemctl restart down
systemctl reload caddy || systemctl restart caddy
echo "ready: https://$HOST"
