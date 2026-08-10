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

# Icons, share card, and PWA manifest. Each needs an explicit content-type —
# S3 guesses from the extension, and it guesses wrong for .webmanifest/.svg.
# Long max-age is safe: these are content-stable, and a change ships with an
# invalidation below.
upload() {
  local file="$1" ctype="$2"
  echo "==> Uploading $file"
  aws --profile "$PROFILE" --region "$REGION" s3 cp \
    "$SRC_DIR/$file" "s3://$BUCKET/$file" \
    --content-type "$ctype" \
    --cache-control "public, max-age=86400"
}

upload og-image.png         "image/png"
upload icon.svg             "image/svg+xml"
upload icon-192.png         "image/png"
upload icon-512.png         "image/png"
upload apple-touch-icon.png "image/png"
upload favicon.ico          "image/x-icon"
upload manifest.json        "application/manifest+json"

echo "==> Invalidating CloudFront ($DIST_ID)"
aws --profile "$PROFILE" cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/index.html" "/" "/og-image.png" "/icon.svg" "/icon-192.png" \
          "/icon-512.png" "/apple-touch-icon.png" "/favicon.ico" "/manifest.json" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo "==> Done. https://openrecord.fanpierlabs.com/"
