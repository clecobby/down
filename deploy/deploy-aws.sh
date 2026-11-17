#!/usr/bin/env bash
# Deploy the serverless setup: API on Lambda (down-api), website on S3 + CloudFront.
#   deploy/deploy-aws.sh            # API + website
#   deploy/deploy-aws.sh api|web    # just one
# Needs AWS CLI credentials for the account. Lambda settings (DSQL, Cognito, photos, origin secret)
# live in the function's configuration, not in this repo.
set -euo pipefail
export AWS_REGION="${AWS_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
SITE_BUCKET="down-web-$ACCOUNT"
WHAT="${1:-all}"

if [[ $WHAT == all || $WHAT == api ]]; then
  BUILD=$(mktemp -d)
  cp -R "$ROOT/backend/src" "$ROOT/backend/package.json" "$ROOT/backend/package-lock.json" "$BUILD/"
  # Lambda runs Linux on ARM (glibc): install those builds of native packages (sharp).
  (cd "$BUILD" && npm ci --omit=dev --os=linux --cpu=arm64 --libc=glibc --no-audit --no-fund --silent && zip -qr api.zip . -x '*.md')
  aws lambda update-function-code --function-name down-api --zip-file "fileb://$BUILD/api.zip" --query LastUpdateStatus --output text
  aws lambda wait function-updated-v2 --function-name down-api
  rm -rf "$BUILD"
  echo "API deployed"
fi

if [[ $WHAT == all || $WHAT == web ]]; then
  (cd "$ROOT/frontend" && npm run build --silent)
  aws s3 sync "$ROOT/frontend/dist/assets" "s3://$SITE_BUCKET/assets" --cache-control "public, max-age=31536000, immutable" --only-show-errors
  aws s3 cp "$ROOT/frontend/dist/index.html" "s3://$SITE_BUCKET/index.html" --cache-control "no-cache" --only-show-errors
  DIST=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='down web app + API'].Id | [0]" --output text)
  aws cloudfront create-invalidation --distribution-id "$DIST" --paths /index.html --query Invalidation.Status --output text
  echo "Website deployed: https://$(aws cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text)"
fi
