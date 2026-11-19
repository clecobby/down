#!/usr/bin/env bash
# Deploy the serverless setup: API on Lambda, website on S3 + CloudFront.
#   deploy/deploy-aws.sh prod           # production (main branch)  https://d2lfawokdyd1nt.cloudfront.net
#   deploy/deploy-aws.sh dev            # dev (dev branch)          https://d3nrslazsd4mxv.cloudfront.net
#   deploy/deploy-aws.sh dev api|web    # just one part
# GitHub Actions runs this on every push to main / dev (.github/workflows/deploy.yml).
# Needs AWS credentials for the account. Lambda settings (database, Cognito, photos, origin secret)
# live in each function's configuration, not in this repo.
set -euo pipefail
export AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${1:?usage: deploy-aws.sh prod|dev [api|web]}"
WHAT="${2:-all}"

case "$STAGE" in
  prod) FUNCTION=down-api;     SITE_BUCKET=down-web-504886488640;     DIST=E10SSPHXF8HBB2 ;;
  dev)  FUNCTION=down-api-dev; SITE_BUCKET=down-web-dev-504886488640; DIST=E3NSC5WK9N7R3G ;;
  *) echo "unknown stage: $STAGE (prod or dev)" >&2; exit 1 ;;
esac

if [[ $WHAT == all || $WHAT == api ]]; then
  BUILD=$(mktemp -d)
  cp -R "$ROOT/backend/src" "$ROOT/backend/package.json" "$ROOT/backend/package-lock.json" "$BUILD/"
  # Lambda runs Linux on ARM (glibc): install those builds of native packages (sharp).
  (cd "$BUILD" && npm ci --omit=dev --os=linux --cpu=arm64 --libc=glibc --no-audit --no-fund --silent && zip -qr api.zip . -x '*.md')
  aws lambda update-function-code --function-name "$FUNCTION" --zip-file "fileb://$BUILD/api.zip" --query LastUpdateStatus --output text
  aws lambda wait function-updated-v2 --function-name "$FUNCTION"
  rm -rf "$BUILD"
  echo "API deployed to $FUNCTION"
fi

if [[ $WHAT == all || $WHAT == web ]]; then
  (cd "$ROOT/frontend" && npm run build --silent)
  # Only assets/ and index.html are touched: the dev bucket also holds photos/.
  aws s3 sync "$ROOT/frontend/dist/assets" "s3://$SITE_BUCKET/assets" --cache-control "public, max-age=31536000, immutable" --only-show-errors
  aws s3 cp "$ROOT/frontend/dist/index.html" "s3://$SITE_BUCKET/index.html" --cache-control "no-cache" --only-show-errors
  aws cloudfront create-invalidation --distribution-id "$DIST" --paths /index.html --query Invalidation.Status --output text
  echo "Website deployed: https://$(aws cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text)"
fi
