#!/usr/bin/env bash
# Build and deploy the OpenRecord splash page + interactive demo to S3 + CloudFront.
#
# Follows the standard Fan Pier Labs static-site pattern:
#   - Private S3 bucket `openrecord-fanpierlabs-com` (us-east-2), served via CloudFront OAC
#   - CloudFront distribution fronts openrecord.fanpierlabs.com (wildcard *.fanpierlabs.com cert)
#
# Two things get uploaded:
#   index.html          the marketing splash — hand-written, no build step
#   demo/ → dist/       the React + TypeScript demo, built with Vite
#
# Content types are set explicitly. S3 guesses `binary/octet-stream` for unknown
# extensions, and a .js served as anything but a JavaScript MIME type is refused
# by the browser's module loader — which would break the demo while leaving the
# splash page looking fine.
#
# Usage:  AWS_PROFILE=fanpierlabs ./deploy.sh
set -euo pipefail

PROFILE="${AWS_PROFILE:-fanpierlabs}"
REGION="${REGION:-us-east-2}"
BUCKET="${BUCKET:-openrecord-fanpierlabs-com}"
DIST_ID="${DIST_ID:-EXUZ8GHUQ9ULF}"   # CloudFront distribution for openrecord.fanpierlabs.com
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SRC_DIR/dist"

AWS=(aws --profile "$PROFILE" --region "$REGION")

content_type_for() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "text/javascript; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.woff2) echo "font/woff2" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

upload() {
  local path="$1" key="$2" cache="$3"
  echo "    $key"
  "${AWS[@]}" s3 cp "$path" "s3://$BUCKET/$key" \
    --content-type "$(content_type_for "$path")" \
    --cache-control "$cache" \
    --only-show-errors
}

echo "==> Building the demo (typecheck + vite build)"
( cd "$SRC_DIR/demo" && npx tsc --noEmit -p tsconfig.json && npx vite build )

if [ ! -f "$BUILD_DIR/demo.html" ]; then
  echo "!! Build did not produce $BUILD_DIR/demo.html" >&2
  exit 1
fi

echo "==> Uploading the splash page"
# Short TTL: the HTML is the entry point and must pick up new asset hashes.
upload "$SRC_DIR/index.html" "index.html" "public, max-age=300"

echo "==> Uploading the demo"
upload "$BUILD_DIR/demo.html" "demo.html" "public, max-age=300"

# Vite fingerprints asset filenames, so they can be cached hard and forever.
while IFS= read -r file; do
  upload "$file" "assets/$(basename "$file")" "public, max-age=31536000, immutable"
done < <(find "$BUILD_DIR/assets" -type f 2>/dev/null || true)

echo "==> Invalidating CloudFront ($DIST_ID)"
# Only the HTML needs invalidating; hashed assets are new paths every build.
"${AWS[@]}" cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/index.html" "/demo.html" "/" \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo ""
echo "==> Done."
echo "    https://openrecord.fanpierlabs.com/"
echo "    https://openrecord.fanpierlabs.com/demo.html"
