#!/usr/bin/env bash
# E2E test runner for the OpenRecord expo app.
#
# Usage:
#   e2e/run.sh ios      [--skip-build] [--app <path-to.app>]
#   e2e/run.sh android  [--skip-build] [--apk <path-to.apk>]
#
# What it does:
#   1. Starts fake-mychart on :4000 and the mock AI server on :4600
#      (skipped when something is already listening).
#   2. Builds the app with EXPO_PUBLIC_E2E=1 and the backend URL pointed
#      at the mock AI server (expo prebuild + xcodebuild / gradle).
#   3. Boots a dedicated simulator/emulator, installs the app.
#   4. Runs every Maestro flow in e2e/flows/.
#
# Requirements: bun, maestro, and Xcode (ios) or the Android SDK with a
# running emulator (android — the script does not create AVDs).
set -euo pipefail

PLATFORM="${1:-ios}"
shift || true

SKIP_BUILD=0
APP_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --app|--apk) APP_PATH="$2"; shift ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

EXPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$EXPO_DIR/.." && pwd)"
FLOWS_DIR="$EXPO_DIR/e2e/flows"
ARTIFACTS_DIR="${E2E_ARTIFACTS_DIR:-$EXPO_DIR/e2e/artifacts}"
MOCK_AI_PORT=4600
FAKE_MYCHART_PORT=4000
BUNDLE_ID="com.fanpierlabs.openrecord"

export EXPO_PUBLIC_E2E=1
export EXPO_PUBLIC_BACKEND_URL="http://localhost:$MOCK_AI_PORT"

CLEANUP_PIDS=()
SIM_UDID=""

cleanup() {
  for pid in "${CLEANUP_PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  if [[ -n "$SIM_UDID" ]]; then
    xcrun simctl shutdown "$SIM_UDID" 2>/dev/null || true
    xcrun simctl delete "$SIM_UDID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for() { # url, label, seconds
  local url="$1" label="$2" tries="${3:-60}"
  for _ in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null "$url"; then echo "$label ready"; return 0; fi
    sleep 1
  done
  echo "$label failed to start" >&2
  return 1
}

# ── 1. Local services ──────────────────────────────────────────────────
if ! curl -sf -o /dev/null "http://localhost:$FAKE_MYCHART_PORT/api/health" \
   && ! curl -s -o /dev/null "http://localhost:$FAKE_MYCHART_PORT/"; then
  echo "Starting fake-mychart on :$FAKE_MYCHART_PORT..."
  # CORS on so the same server also works for browser-based (web) E2E runs;
  # the native apps ignore CORS headers entirely.
  (cd "$REPO_DIR/fake-mychart" && bun install --frozen-lockfile >/dev/null && bun run build >/dev/null && FAKE_MYCHART_CORS=true PORT=$FAKE_MYCHART_PORT bun run start) &
  CLEANUP_PIDS+=($!)
  wait_for "http://localhost:$FAKE_MYCHART_PORT/reset" "fake-mychart" 90
else
  echo "fake-mychart already running on :$FAKE_MYCHART_PORT"
fi

if ! curl -sf -o /dev/null "http://localhost:$MOCK_AI_PORT/health"; then
  echo "Starting mock AI server on :$MOCK_AI_PORT..."
  PORT=$MOCK_AI_PORT bun "$EXPO_DIR/e2e/mock-ai-server.ts" &
  CLEANUP_PIDS+=($!)
  wait_for "http://localhost:$MOCK_AI_PORT/health" "mock AI server" 30
else
  echo "mock AI server already running on :$MOCK_AI_PORT"
fi

mkdir -p "$ARTIFACTS_DIR"

# ── 2 + 3 + 4. Per-platform build, install, test ───────────────────────
if [[ "$PLATFORM" == "ios" ]]; then
  if [[ -z "$APP_PATH" && "$SKIP_BUILD" -eq 0 ]]; then
    echo "Prebuilding iOS project..."
    (cd "$EXPO_DIR" && bunx expo prebuild --platform ios)
    # expo prebuild exits 0 even when pod install fails — verify the workspace.
    [[ -d "$EXPO_DIR/ios/OpenRecord.xcworkspace" ]] || {
      echo "prebuild did not produce OpenRecord.xcworkspace (pod install failed?)" >&2
      exit 1
    }
    echo "Building with xcodebuild (Release, simulator)..."
    # Single arch (the host's) — the app installs on a local simulator,
    # and building both simulator architectures doubles time and disk.
    (cd "$EXPO_DIR/ios" && xcodebuild \
      -workspace OpenRecord.xcworkspace \
      -scheme OpenRecord \
      -configuration Release \
      -sdk iphonesimulator \
      -derivedDataPath build-e2e \
      -quiet \
      ARCHS="$(uname -m)" ONLY_ACTIVE_ARCH=YES \
      CODE_SIGNING_ALLOWED=NO build)
    APP_PATH="$EXPO_DIR/ios/build-e2e/Build/Products/Release-iphonesimulator/OpenRecord.app"
  fi
  APP_PATH="${APP_PATH:-$EXPO_DIR/ios/build-e2e/Build/Products/Release-iphonesimulator/OpenRecord.app}"
  [[ -d "$APP_PATH" ]] || { echo "app not found at $APP_PATH" >&2; exit 1; }

  # Newest base-model iPhone device type + newest iOS runtime on this
  # machine. (The devicetypes list is not numerically sorted, so parse the
  # generation number — "iPhone 6s Plus" must not beat "iPhone 17".)
  DEVICE_TYPE=$(python3 - <<'PY'
import json, re, subprocess
data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "-j", "devicetypes"]))
best = max(
    ((int(m.group(1)), dt["identifier"])
     for dt in data["devicetypes"]
     if (m := re.fullmatch(r"iPhone (\d+)", dt["name"]))),
)
print(best[1])
PY
)
  RUNTIME=$(xcrun simctl list runtimes | grep -E "^iOS" | tail -1 | grep -oE "com\.apple\.CoreSimulator\.SimRuntime\.iOS-[0-9-]+")
  echo "Creating simulator ($DEVICE_TYPE, $RUNTIME)..."
  SIM_UDID=$(xcrun simctl create "openrecord-e2e-$(date +%s)" "$DEVICE_TYPE" "$RUNTIME")
  xcrun simctl boot "$SIM_UDID"
  xcrun simctl bootstatus "$SIM_UDID" -b
  xcrun simctl install "$SIM_UDID" "$APP_PATH"

  echo "Running Maestro flows..."
  maestro --udid "$SIM_UDID" test "$FLOWS_DIR" \
    --format junit --output "$ARTIFACTS_DIR/maestro-ios.xml" \
    --debug-output "$ARTIFACTS_DIR/maestro-ios-debug"

elif [[ "$PLATFORM" == "android" ]]; then
  if [[ -z "$APP_PATH" && "$SKIP_BUILD" -eq 0 ]]; then
    echo "Prebuilding Android project..."
    (cd "$EXPO_DIR" && bunx expo prebuild --platform android)
    echo "Building with gradle (Release)..."
    (cd "$EXPO_DIR/android" && ./gradlew --no-daemon assembleRelease)
    APP_PATH="$EXPO_DIR/android/app/build/outputs/apk/release/app-release.apk"
  fi
  APP_PATH="${APP_PATH:-$EXPO_DIR/android/app/build/outputs/apk/release/app-release.apk}"
  [[ -f "$APP_PATH" ]] || { echo "apk not found at $APP_PATH" >&2; exit 1; }

  adb wait-for-device
  # localhost inside the emulator → the host's servers.
  adb reverse "tcp:$FAKE_MYCHART_PORT" "tcp:$FAKE_MYCHART_PORT"
  adb reverse "tcp:$MOCK_AI_PORT" "tcp:$MOCK_AI_PORT"
  adb install -r "$APP_PATH"

  echo "Running Maestro flows..."
  maestro test "$FLOWS_DIR" \
    --format junit --output "$ARTIFACTS_DIR/maestro-android.xml" \
    --debug-output "$ARTIFACTS_DIR/maestro-android-debug"

else
  echo "unknown platform: $PLATFORM (expected ios or android)" >&2
  exit 1
fi

echo "E2E flows passed on $PLATFORM"
