#!/usr/bin/env bash
# Release the Claude Desktop extension to the splash site's S3 bucket.
#
# Usage:  AWS_PROFILE=fanpierlabs ./release.sh [patch|minor|major|<x.y.z>]
#         (default bump: patch)                 or `bun run release` in here
#
# What it does:
#   1. Bumps the version in manifest.json + package.json
#      (dev-scripts/bump-mcpb-version.ts keeps the two in lockstep).
#   2. Builds the bundle (`bun run pack` — tsc, tsup, mcpb pack).
#   3. Uploads to s3://openrecord-fanpierlabs-com/mcpb/ :
#        openrecord-<version>.mcpb   versioned artifact, immutable cache
#        openrecord.mcpb             stable download URL, short cache
#        latest.json                 {version, url} — what installed
#                                    extensions poll (src/update-check.ts)
#   4. Invalidates the two mutable paths on CloudFront.
#
# The bucket and distribution are the splash site's (openrecord-splash/deploy.sh);
# that script uploads named files only — no `sync --delete` — so nothing under
# mcpb/ is ever touched by a site deploy.
set -euo pipefail

PROFILE="${AWS_PROFILE:-fanpierlabs}"
REGION="${REGION:-us-east-2}"
BUCKET="${BUCKET:-openrecord-fanpierlabs-com}"
DIST_ID="${DIST_ID:-EXUZ8GHUQ9ULF}"   # CloudFront distribution for openrecord.fanpierlabs.com
SITE="https://openrecord.fanpierlabs.com"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AWS=(aws --profile "$PROFILE" --region "$REGION")

cd "$SRC_DIR"

# A release is a commit-worthy event: the version bump below must land in git
# as exactly what was shipped, so refuse to mix it into unrelated local edits.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty — commit or discard local changes first, so the release is exactly one version-bump commit." >&2
  exit 1
fi

bun ../dev-scripts/bump-mcpb-version.ts "${1:-patch}"
VERSION="$(node -p "require('./manifest.json').version")"

# Refuse to overwrite an already-published version: the versioned artifact is
# advertised as immutable, and installed extensions may have cached its URL.
if "${AWS[@]}" s3api head-object --bucket "$BUCKET" --key "mcpb/openrecord-$VERSION.mcpb" >/dev/null 2>&1; then
  echo "v$VERSION is already published at $SITE/mcpb/openrecord-$VERSION.mcpb — bump differently." >&2
  git checkout -- manifest.json package.json
  exit 1
fi

bun install
bun run pack

"${AWS[@]}" s3 cp openrecord.mcpb "s3://$BUCKET/mcpb/openrecord-$VERSION.mcpb" \
  --content-type application/octet-stream \
  --cache-control "public, max-age=31536000, immutable"

"${AWS[@]}" s3 cp openrecord.mcpb "s3://$BUCKET/mcpb/openrecord.mcpb" \
  --content-type application/octet-stream \
  --cache-control "public, max-age=300"

LATEST_JSON="$(mktemp)"
printf '{"version":"%s","url":"%s/mcpb/openrecord-%s.mcpb"}\n' "$VERSION" "$SITE" "$VERSION" > "$LATEST_JSON"
"${AWS[@]}" s3 cp "$LATEST_JSON" "s3://$BUCKET/mcpb/latest.json" \
  --content-type "application/json; charset=utf-8" \
  --cache-control "no-cache"
rm -f "$LATEST_JSON"

"${AWS[@]}" cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/mcpb/latest.json" "/mcpb/openrecord.mcpb" \
  --query 'Invalidation.Id' --output text

echo
echo "Released v$VERSION"
echo "  versioned: $SITE/mcpb/openrecord-$VERSION.mcpb"
echo "  stable:    $SITE/mcpb/openrecord.mcpb"
echo
echo "Now commit the bump:  git add -A && git commit -m 'Release mcpb v$VERSION'"
