# iOS Simulator Debugging & UI Automation

Use **`maestro-cli`** (installed at `~/.local/bin/maestro-cli`) for every interaction with the iOS
simulator. It's a one-shot wrapper around Maestro (mobile.dev) designed for agent loops — each
invocation does one action and writes a screenshot to `/tmp/maestro-last.png`, so the next step reads
the result with the `Read` tool and decides what to do.

## Hard rules (no exceptions)

- **NEVER take over the user's mouse.** No `cliclick`, `osascript ... click at`, AppleScript mouse
  events, AppKit/CGEvent, or anything else that moves the cursor or steals focus. The user may be
  using their computer.
- **NEVER click the simulator by computing pixel coordinates against the simulator window
  position.** It's brittle, focus-races with whatever the user is doing, and breaks on every window
  move or sim resize. `maestro-cli` talks to the simulator through iOS's native automation hooks,
  not the macOS cursor.
- **Do NOT write multi-step Maestro YAML flows.** Each rerun replays every prior step from the
  beginning — slow, error-prone, and bad at recovering when the UI is in an unexpected state. One
  action per call.
- **Do not install a separate Maestro.** The brew `maestro` cask is a different product
  (runmaestro.ai). The mobile.dev Maestro CLI is what `maestro-cli` wraps and it's already on PATH.

## Starting a sim session (exactly once per Claude session)

Every Claude session that touches the simulator must own a fresh, dedicated sim — never share one
with another running Claude.

```bash
# 1. Create a new simulator. simctl assigns a UDID and prints it.
UDID=$(xcrun simctl create "claude-$(date +%Y%m%d)-$(openssl rand -hex 3)" \
  "iPhone 17" \
  "com.apple.CoreSimulator.SimRuntime.iOS-26-1")

# 2. Boot it and surface the Simulator.app window so the user can watch.
xcrun simctl boot "$UDID"
open -a Simulator

# 3. Pin the UDID for the rest of the session. The Bash tool's shell state
#    persists across tool calls, so this one export is enough — every later
#    maestro-cli invocation picks it up automatically.
export MAESTRO_UDID="$UDID"

# 4. Build + install + launch the Expo app on this exact sim.
cd expo-app && bunx expo run:ios --device "$UDID" --port 8083 &
```

- The UDID is CoreSimulator-assigned, not Claude-generated. Capture it from `simctl create`'s stdout.
- The `claude-<date>-<random>` naming makes orphaned sims easy to spot and bulk-delete:
  `xcrun simctl delete $(xcrun simctl list devices | grep -E 'claude-[0-9]{8}-' | grep -oE '[A-F0-9-]{36}')`
- Use a port other than 8081 if other Claude instances are running their own Metro. Pick
  deterministically (8082, 8083, …) and pass `--port` to `expo run:ios`.
- At end of session: `xcrun simctl shutdown "$MAESTRO_UDID" && xcrun simctl delete "$MAESTRO_UDID"`.
  Leave it running only if the user explicitly wants to keep it.

## Commands

Full reference: `maestro-cli --help`.

```bash
maestro-cli tap "Get Started"          # tap by visible text / accessibilityLabel (regex)
maestro-cli tap-id run-skill-button    # tap by testID — preferred when set
maestro-cli tap-id ".*Springfield.*"   # regex match on testID
maestro-cli tap-xy 200 480             # tap at pixel coordinates
maestro-cli fill "Username" "homer"    # tap a field by label, then type
maestro-cli type "homer"               # type into focused field
maestro-cli hide-keyboard              # dismiss soft keyboard
maestro-cli press Enter                # hardware/keyboard key
maestro-cli back                       # system back / swipe-back
maestro-cli scroll down                # screen scroll
maestro-cli swipe-up | swipe-down      # gestures
maestro-cli wait "Run a skill"         # extendedWaitUntil (default 10s)
maestro-cli assert-visible "Insights"  # fail if missing
maestro-cli screenshot [path]          # /tmp/maestro-last.png by default
maestro-cli hierarchy                  # dump a11y tree (great for finding testIDs)
maestro-cli launch | stop              # relaunch / terminate app
maestro-cli reset-keychain             # wipe sim keychain (forgets logins/setup_complete)
```

Env vars:

- `MAESTRO_UDID` — **REQUIRED.** `maestro-cli` exits non-zero immediately if it's unset. There's no
  fallback, on purpose: multiple Claude sessions run in parallel and a default would let one agent
  silently drive another agent's sim. Find UDIDs with `xcrun simctl list devices booted`.
- `MAESTRO_APP_ID` — bundle id (default `com.fanpierlabs.openrecord`).
- `MAESTRO_QUIET=1` — silence Maestro output.
- `MAESTRO_NO_SCREENSHOT=1` — skip the auto-screenshot; `MAESTRO_SCREENSHOT=/path` overrides where
  it goes.

## testIDs are mandatory

**Every interactive element in the Expo app MUST have a `testID` so `maestro-cli tap-id` works
deterministically.**

- Set `testID` AND `accessibilityLabel` on every `Pressable`, `Button`, `TextInput`, `Switch`, and
  tappable `View`. `testID` is the primary handle for Maestro; `accessibilityLabel` is what VoiceOver
  reads (and a fallback for `maestro-cli tap` by text).
- Use a stable kebab- or snake-case name describing what the element does, not where it sits:
  `get-started-button`, `onboarding-continue`, `skill-bill_itemization`, `chat-input`,
  `send-message`.
- For lists (chats, insights, skills), include the row id: `chat-row-${chatId}`.
- Maestro's `tap-id` selector is a regex over `accessibilityIdentifier` (what RN's `testID` maps to
  on iOS), so values containing regex metacharacters need escaping or a wildcard match
  (`.*Springfield.*`).
- Add the `testID` in the same diff as the new screen or button. PRs that introduce untargetable UI
  should be rejected at review.
- Enforced in CI: `expo-app/src/__tests__/testids.unit.test.ts` scans every `.tsx` under
  `expo-app/src/app` and `expo-app/src/components` and fails on any
  `Pressable`/`TextInput`/`TouchableOpacity`/`Switch`/`Button` without one.
