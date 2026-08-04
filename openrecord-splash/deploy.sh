#!/usr/bin/env bash
# Deploy the OpenRecord splash page + interactive demo to S3 + CloudFront.
#
# Follows the standard Fan Pier Labs static-site pattern:
#   - Private S3 bucket `openrecord-fanpierlabs-com` (us-east-2), served via CloudFront OAC
#   - CloudFront distribution fronts openrecord.fanpierlabs.com (wildcard *.fanpierlabs.com cert)
#
# Uploads:
#   index.html        the marketing splash
#   demo.html         the interactive demo page
#   demo/*.js|.css    the demo's ES modules and stylesheet
#
# Content types are set explicitly: S3 guesses `binary/octet-stream` for
# unknown extensions, and a .js served as anything but a JavaScript MIME type
# is refused by the browser's ES-module loader, which would break the demo
# while leaving the splash page looking fine.
#
# Usage:  AWS_PROFILE=fanpierlabs ./deploy.sh
set -euo pipefail

PROFILE="${AWS_PROFILE:-fanpierlabs}"
REGION="${REGION:-us-east-2}"
BUCKET="${BUCKET:-openrecord-fanpierlabs-com}"
DIST_ID="${DIST_ID:-EXUZ8GHUQ9ULF}"   # CloudFront distribution for openrecord.fanpierlabs.com
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AWS=(aws --profile "$PROFILE" --region "$REGION")

upload() {
  local path="$1" key="$2" ctype="$3"
  echo "    $key"
  "${AWS[@]}" s3 cp "$path" "s3://$BUCKET/$key" \
    --content-type "$ctype" \
    --cache-control "public, max-age=300" \
    --only-show-errors
}

echo "==> Uploading pages to s3://$BUCKET/"
upload "$SRC_DIR/index.html" "index.html" "text/html; charset=utf-8"
upload "$SRC_DIR/demo.html"  "demo.html"  "text/html; charset=utf-8"

echo "==> Uploading demo assets"
for file in "$SRC_DIR"/demo/*.js "$SRC_DIR"/demo/*.css; do
  [ -e "$file" ] || continue
  name="$(basename "$file")"
  case "$name" in
    *.js)  ctype="text/javascript; charset=utf-8" ;;
    *.css) ctype="text/css; charset=utf-8" ;;
    *)     continue ;;
  esac
  upload "$file" "demo/$name" "$ctype"
done

echo "==> Invalidating CloudFront ($DIST_ID)"
"${AWS[@]}" cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/index.html" "/demo.html" "/demo/*" "/" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo "==> Done."
echo "    https://openrecord.fanpierlabs.com/"
echo "    https://openrecord.fanpierlabs.com/demo.html"
