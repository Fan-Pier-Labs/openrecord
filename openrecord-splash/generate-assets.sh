#!/usr/bin/env bash
# Regenerate the splash page's binary assets from their checked-in sources.
#
#   og-image.png      1200x630 social share card  <- assets-src/og-image.html
#   icon-192.png      PWA manifest icon           <- icon.svg
#   icon-512.png      PWA manifest icon           <- icon.svg
#   apple-touch-icon.png  180x180 iOS home screen <- icon.svg
#
# The PNGs are committed so deploys need no build step; rerun this only when
# icon.svg or assets-src/og-image.html changes.
#
# Requires: Google Chrome (og card render) and rsvg-convert (`brew install librsvg`).
#
# Usage:  ./generate-assets.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [[ ! -x "$CHROME" ]]; then
  echo "error: Chrome not found at '$CHROME' (override with CHROME=/path/to/chrome)" >&2
  exit 1
fi
if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found — brew install librsvg" >&2
  exit 1
fi

# render_card <output-png> <query-string>
# --virtual-time-budget lets the webfont load and lay out before the capture.
render_card() {
  "$CHROME" \
    --headless \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1200,630 \
    --virtual-time-budget=8000 \
    --screenshot="$1" \
    "file://$SRC_DIR/assets-src/og-image.html$2" 2>/dev/null
}

echo "==> Rendering og-image.png (1200x630)"
render_card "$SRC_DIR/og-image.png" ""

echo "==> Rendering icon PNGs from icon.svg"
rsvg-convert -w 192 -h 192 "$SRC_DIR/icon.svg" -o "$SRC_DIR/icon-192.png"
rsvg-convert -w 512 -h 512 "$SRC_DIR/icon.svg" -o "$SRC_DIR/icon-512.png"
rsvg-convert -w 180 -h 180 "$SRC_DIR/icon.svg" -o "$SRC_DIR/apple-touch-icon.png"

echo "==> Done:"
for f in og-image.png icon-192.png icon-512.png apple-touch-icon.png; do
  printf '    %-28s %s\n' "openrecord-splash/$f" "$(file -b "$SRC_DIR/$f")"
done
