#!/usr/bin/env bash
# Releases the Claude Desktop extension, start to finish:
#   1. installs dependencies
#   2. refreshes the bundled MyChart directory list from Epic (a few minutes)
#   3. packs openrecord.mcpb, unsigned
#   4. uploads it to the splash site's bucket and invalidates CloudFront
#   5. checks the live download is byte-for-byte what was packed
#   6. deploys the splash site, which regenerates mcpb_version.json — the file
#      installed copies poll to learn a new version exists
#
# Unsigned on purpose. `mcpb sign` appends its signature after the zip's end
# record, and Claude Desktop's zip reader (yauzl) refuses the result with
# "Invalid comment length" — the signed 2.1.0 could not be installed. See README.
#
# Bump the version in manifest.json and package.json first, in a PR, and run
# this from main once that is merged.
#
# Usage:  ./deploy.sh
set -euo pipefail

PROFILE="fanpierlabs"
REGION="us-east-2"
BUCKET="openrecord-fanpierlabs-com"
DIST_ID="EXUZ8GHUQ9ULF"   # CloudFront distribution for openrecord.fanpierlabs.com
URL="https://openrecord.fanpierlabs.com/openrecord.mcpb"
EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$EXT_DIR/.." && pwd)"
INSTANCES="scrapers/list-all-mycharts/mychart-instances.json"

AWS=(aws --profile "$PROFILE" --region "$REGION")

# What ships should be exactly what is on main — not an unmerged branch, not
# uncommitted edits.
echo "==> Checking the checkout is main, clean and current"
git -C "$REPO_DIR" fetch --quiet origin main
if [ -n "$(git -C "$REPO_DIR" status --porcelain)" ]; then
  echo "!! Uncommitted changes — release from a clean checkout of main" >&2
  exit 1
fi
if [ "$(git -C "$REPO_DIR" rev-parse HEAD)" != "$(git -C "$REPO_DIR" rev-parse origin/main)" ]; then
  echo "!! HEAD is not origin/main — check out main and pull first" >&2
  exit 1
fi
VERSION="$(node -p "require('$EXT_DIR/manifest.json').version")"
echo "    releasing MCPB $VERSION"

echo "==> Installing dependencies"
( cd "$REPO_DIR" && bun install )
( cd "$REPO_DIR/openrecord-splash/demo" && bun install )

echo "==> Refreshing the MyChart directory list"
( cd "$REPO_DIR" && bun scrapers/list-all-mycharts/fetch-mychart-instances.ts )

echo "==> Packing openrecord.mcpb"
( cd "$EXT_DIR" && bun run pack )

# yauzl requires the end-of-central-directory record to be the file's last 22
# bytes. Anything appended after it — a signature — makes the bundle uninstallable.
if [ "$(tail -c 22 "$EXT_DIR/openrecord.mcpb" | xxd -p | head -c 8)" != "504b0506" ]; then
  echo "!! openrecord.mcpb does not end with a zip end record — Claude Desktop will refuse it" >&2
  exit 1
fi
SHA="$(shasum "$EXT_DIR/openrecord.mcpb" | cut -d' ' -f1)"

echo "==> Uploading s3://$BUCKET/openrecord.mcpb"
"${AWS[@]}" s3 cp "$EXT_DIR/openrecord.mcpb" "s3://$BUCKET/openrecord.mcpb" \
  --content-type application/octet-stream \
  --content-disposition 'attachment; filename="openrecord.mcpb"' \
  --cache-control "public, max-age=300" \
  --only-show-errors

echo "==> Invalidating CloudFront ($DIST_ID)"
INVALIDATION_ID="$("${AWS[@]}" cloudfront create-invalidation --distribution-id "$DIST_ID" \
  --paths /openrecord.mcpb --query 'Invalidation.Id' --output text)"
"${AWS[@]}" cloudfront wait invalidation-completed --distribution-id "$DIST_ID" --id "$INVALIDATION_ID"

echo "==> Checking the live download"
LIVE_SHA="$(curl -fsSL "$URL" | shasum | cut -d' ' -f1)"
if [ "$LIVE_SHA" != "$SHA" ]; then
  echo "!! $URL serves $LIVE_SHA, expected $SHA" >&2
  exit 1
fi

echo "==> Deploying the splash site (publishes mcpb_version.json)"
AWS_PROFILE="$PROFILE" "$REPO_DIR/openrecord-splash/deploy.sh"

echo ""
echo "==> Released MCPB $VERSION ($SHA)"
echo "    $URL"
if [ -n "$(git -C "$REPO_DIR" status --porcelain -- "$INSTANCES")" ]; then
  echo "    The refreshed $INSTANCES shipped in this bundle — commit it in a PR."
fi
