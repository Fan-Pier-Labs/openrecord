#!/usr/bin/env bash
# Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.
#
# Releases the Claude Desktop extension, start to finish:
#   1. installs dependencies
#   2. refreshes the bundled MyChart directory list from Epic (a few minutes)
#   3. packs openrecord.mcpb, unsigned, and boots the packed server (smoke.mjs)
#   3b. uploads the Google Calendar binaries the bundle downloads on demand
#   4. keeps the current live bundle as openrecord-<old version>.mcpb, then
#      uploads the new one to the splash site's bucket and invalidates CloudFront
#   5. checks the live download is byte-for-byte what was packed
#   6. deploys the splash site, which regenerates mcpb_version.json — the file
#      installed copies poll to learn a new version exists
#
# Unsigned on purpose. `mcpb sign` appends its signature after the zip's end
# record, and Claude Desktop's zip reader (yauzl) refuses the result with
# "Invalid comment length" — the signed 2.1.0 could not be installed. See README.
#
# Bump the version in manifest.json and package.json first, in a PR, and run
# this from main once that is merged. A failed run can be re-run as is: the
# directory list it refreshed is the one change the clean-checkout check allows.
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
# uncommitted edits. The refreshed directory list is exempt because step 2 of
# an earlier, failed run is what changed it.
echo "==> Checking the checkout is main, clean and current"
git -C "$REPO_DIR" fetch --quiet origin main
if [ -n "$(git -C "$REPO_DIR" status --porcelain -- . ":!$INSTANCES")" ]; then
  echo "!! Uncommitted changes — release from a clean checkout of main" >&2
  exit 1
fi
if [ "$(git -C "$REPO_DIR" rev-parse HEAD)" != "$(git -C "$REPO_DIR" rev-parse origin/main)" ]; then
  echo "!! HEAD is not origin/main — check out main and pull first" >&2
  exit 1
fi
VERSION="$(node -p "require('$EXT_DIR/manifest.json').version")"
LIVE_VERSION="$(curl -fsSL https://openrecord.fanpierlabs.com/mcpb_version.json \
  | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(0, 'utf8')).versions.mcpb)")"
# Re-uploading under the advertised version would swap the bits under copies
# that believe they are already current, and none of them would update.
if [ "$VERSION" = "$LIVE_VERSION" ]; then
  echo "!! $VERSION is already the live version — bump manifest.json and package.json first" >&2
  exit 1
fi
echo "    releasing MCPB $VERSION (live: $LIVE_VERSION)"

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

# The only check that boots the packed server the way Claude Desktop does; CI
# does not run it. `pack` just built dist/, so run smoke.mjs directly rather than
# `bun run smoke`, which would rebuild what is about to ship.
echo "==> Smoke-testing the packed server"
( cd "$EXT_DIR" && node smoke.mjs )

# The calendar binaries are too big to ship inside the bundle (~100 MB each),
# so they go beside it under content-addressed names: immutable, never
# invalidated, and every released bundle keeps finding the exact bytes whose
# hash it carries. They go up and are checked before the bundle that needs them.
HASHES="$EXT_DIR/applet/calendar-binaries.json"
if [ ! -f "$HASHES" ]; then
  echo "!! $HASHES is missing — pack did not build the calendar binaries (macOS only)" >&2
  exit 1
fi
for ARCH in arm64 x64; do
  HASH="$(node -p "require('$HASHES')['$ARCH']")"
  NAME="openrecord-calendar-darwin-$ARCH-$HASH"
  if ! "${AWS[@]}" s3 ls "s3://$BUCKET/calendar/$NAME" >/dev/null 2>&1; then
    echo "==> Uploading s3://$BUCKET/calendar/$NAME"
    "${AWS[@]}" s3 cp "$EXT_DIR/applet/openrecord-calendar-darwin-$ARCH" "s3://$BUCKET/calendar/$NAME" \
      --content-type application/octet-stream \
      --cache-control "public, max-age=31536000, immutable" \
      --only-show-errors
  fi
  LIVE_HASH="$(curl -fsSL "https://openrecord.fanpierlabs.com/calendar/$NAME" | shasum -a 256 | cut -d' ' -f1)"
  if [ "$LIVE_HASH" != "$HASH" ]; then
    echo "!! https://openrecord.fanpierlabs.com/calendar/$NAME serves $LIVE_HASH, expected $HASH" >&2
    exit 1
  fi
done

# Only the first attempt at a release keeps a copy: on a re-run, what is live
# may already be this release's bundle.
BACKUP="openrecord-$LIVE_VERSION.mcpb"
if ! "${AWS[@]}" s3 ls "s3://$BUCKET/$BACKUP" >/dev/null 2>&1; then
  echo "==> Keeping the live $LIVE_VERSION bundle as s3://$BUCKET/$BACKUP"
  "${AWS[@]}" s3 cp "s3://$BUCKET/openrecord.mcpb" "s3://$BUCKET/$BACKUP" --only-show-errors
fi
ROLLBACK="${AWS[*]} s3 cp s3://$BUCKET/$BACKUP s3://$BUCKET/openrecord.mcpb && ${AWS[*]} cloudfront create-invalidation --distribution-id $DIST_ID --paths /openrecord.mcpb"

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
  echo "   To restore $LIVE_VERSION:  $ROLLBACK" >&2
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
