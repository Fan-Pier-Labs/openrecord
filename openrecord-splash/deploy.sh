#!/usr/bin/env bash
# Deploy the OpenRecord splash page to S3 + CloudFront.
#
# Follows the standard Fan Pier Labs static-site pattern:
#   - Private S3 bucket `openrecord-fanpierlabs-com` (us-east-2), served via CloudFront OAC
#   - CloudFront distribution fronts openrecord.fanpierlabs.com (wildcard *.fanpierlabs.com cert)
#
# Usage:  AWS_PROFILE=fanpierlabs ./deploy.sh
set -euo pipefail

PROFILE="${AWS_PROFILE:-fanpierlabs}"
REGION="${REGION:-us-east-2}"
BUCKET="${BUCKET:-openrecord-fanpierlabs-com}"
DIST_ID="${DIST_ID:-EXUZ8GHUQ9ULF}"   # CloudFront distribution for openrecord.fanpierlabs.com
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Uploading index.html to s3://$BUCKET/"
aws --profile "$PROFILE" --region "$REGION" s3 cp \
  "$SRC_DIR/index.html" "s3://$BUCKET/index.html" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "public, max-age=300"

echo "==> Invalidating CloudFront ($DIST_ID)"
aws --profile "$PROFILE" cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/index.html" "/" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo "==> Done. https://openrecord.fanpierlabs.com/"
