# OpenRecord — Mobile App

An Expo / React Native app (iOS first; the Android build is smoke-tested in CI) that connects to a
patient's Epic MyChart portal and lets them ask an AI about their records. The MyChart scrapers run
**on the device** — the same `scrapers/` core the CLI and the Claude Desktop extension use, bundled
by Metro — and an on-device agent loop turns a chat message into scraper calls.

## What's in the app

| Screen | File | What it does |
| --- | --- | --- |
| Onboarding | `src/app/onboarding/` | Welcome → Google sign-in → "Where your data goes" disclosure → pick a health system → MyChart login → 2FA (if asked) → optional passkey |
| Chat | `src/app/(auth)/index.tsx`, `chat/[id].tsx` | A new chat (its empty state holds the alerts card and "Run a skill"), and a saved chat reopened from the drawer |
| Drawer | `src/components/LeftDrawer.tsx` | Chat history, new chat, Insights, Settings |
| Insights | `src/app/(auth)/insights.tsx` | The patient memory summary and AI-generated insights; an insight's suggested question opens a chat |
| Settings | `src/app/(auth)/settings/` | Google account and AI credit used this month, MyChart accounts (add / remove, passkeys, authenticator-app 2FA), AI provider, sign out |

On launch, if onboarding is complete and the device has biometrics enrolled, the app asks for Face
ID (or the passcode) before showing anything (`src/lib/auth/auth-context.tsx`).

The health-system picker (`src/lib/mychart-instances.ts`) shows the checked-in MyChart directory
(`listMyCharts()` from `scrapers/list-all-mycharts/`), then the SQLite-cached copy of its own
monthly rerun of the same refresh (Epic's directory, every login URL checked, in the background).
Its first row, **Springfield Medical Center (Demo)**,
points at the deployed `fake-mychart.fanpierlabs.com` sandbox and is greyed out when that sandbox is
down. "Enter hostname manually" covers anything not in the list.

### The agent loop

`src/lib/ai/claude-client.ts`. The model is never given a provider-native tool schema — it is
prompted to emit JSON objects, `{ "tool": "<name>", "args": { … } }`, so any chat model works:

- Several **read** tools in one turn run in parallel and their results go back as one turn.
- **Write** tools and `respond` are exclusive — alone in their turn, or the batch is rejected and
  the model is asked again.
- `respond({ text })` is the only way to reply, and ends the loop. Three consecutive turns with no
  parseable tool call abort; the whole loop has a 10-minute deadline.
- Every write tool shows a native confirmation dialog with the exact payload before it runs
  (`src/lib/ai/tool-executor.ts`). Declining is reported back to the model as a cancellation.
- Images (X-ray studies, image attachments on messages) are kept out of the conversation: the tool
  returns an `image_id`, the model writes `[image:ID]`, and the UI swaps in the picture from
  `src/lib/imaging/attachment-store.ts`.

### One tool per capability

The tool list is **derived, not written**: `src/lib/ai/tool-catalog.ts` maps every `read`, `write`
and `public` entry in [`shared/capabilities/`](../shared/capabilities/) to an agent tool, and every
non-stub `write` entry to a confirmation dialog. `account`-kind capabilities (passkeys, TOTP) are
driven from the Settings screen instead. `src/lib/scrapers/session-manager.ts` executes them through
`executeCapability`, handles login (passkey first, then password + 2FA) and keeps sessions alive.
Add a capability to the registry and the app picks it up; don't hand-add a tool here.

### Skills, alerts and memory

- **Skills** (`src/lib/skills/catalog.ts`) are curated playbooks launched from the chat empty
  state: a kickoff message plus instructions appended to the system prompt for that chat. There are
  three: *Find bills to itemize*, *Analyze medical history*, *Recommend an insurance fit*.
- **Alerts** (`src/lib/alerts/generator.ts`) are built without AI from scraper output whenever the
  new-chat empty state mounts: outstanding bill balances (open the pay link, or a chat), refillable prescriptions
  (request the refill after a confirmation), and lab components outside their own reference range
  (`outOfRange.ts` — MyChart gives no usable abnormal flag) which open an AI chat. Dismissed alerts
  stay dismissed.
- **Memory** (`src/lib/memory/`) is an on-device patient digest. After the first successful
  connect, the app fetches a fixed set of categories and asks the model for a summary, facts and
  insights; on app foreground it re-fetches at most every 6 hours per account and only sends the
  categories whose content changed. After each chat turn a small model extracts facts the user
  stated. The digest is added to the chat system prompt.

## Where data goes

- **MyChart credentials** — username, password, TOTP secret and the software passkey — live in the
  iOS Keychain via `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
  (`src/lib/storage/secure-store.ts`). So do the Google ID token and any BYO API keys.
- **Chats, alerts, memory, insights, and the directory / logo cache** live in a local SQLite
  database, `openrecord.db` (`src/lib/storage/schema.ts`). The schema runs on every cold start, so
  every statement must be `CREATE TABLE IF NOT EXISTS` — a drop there deletes user data on launch.
- **AI calls** are the one thing that leaves the device, and onboarding says so before a chart is
  connected (`src/app/onboarding/steps/ai-step.tsx`).

### AI providers

AI is gated behind Google sign-in for every provider, including BYO keys. Settings → AI Provider
picks one:

| Provider | Where the call goes | Models (default / small side-calls) |
| --- | --- | --- |
| Free tier (default) | The OpenRecord AI Lambda ([`openrecord-demo-lambda/`](../openrecord-demo-lambda/)) with the Google ID token as `Authorization: Bearer`; it verifies the token and meters a $50/month credit per Google account | `gemini-2.5-flash` / `gemini-2.5-flash-lite` |
| OpenAI key | `api.openai.com` directly | `gpt-4o` / `gpt-5.4-mini` |
| Anthropic key | `api.anthropic.com` directly | `claude-sonnet-4-6` / `claude-haiku-4-5-20251001` |
| Gemini key | `generativelanguage.googleapis.com` directly | `gemini-2.5-flash` / `gemini-2.5-flash-lite` |

On the free tier a 401 is surfaced as "sign in again", a 402 as "monthly credit used up". Expired
Google ID tokens are refreshed silently before each call (`src/lib/backend/google-signin.ts`). The
Lambda's tiers, limits and deploy are in [`docs/infrastructure.md`](../docs/infrastructure.md#openrecord-ai-lambda-openrecord-demo-lambda).

## Build and run

Prerequisites: Bun (the version in [`../.bun-version`](../.bun-version)), Xcode with an iOS
simulator, and CocoaPods. The app bundles source from outside this folder (`scrapers/`, `shared/`),
so install both the repo root and this package:

```bash
bun install                 # repo root
cd expo-app && bun install
bunx expo run:ios           # generates ios/ on first run, builds, installs, starts Metro
```

`ios/` and `android/` are generated by `expo prebuild` and gitignored — native config belongs in
`app.config.ts` or a config plugin, not a hand edit. `plugins/withModularHeaders.js` is one: it
re-adds `use_modular_headers!` to the Podfile so Google Sign-In's Firebase pods compile.

On a simulator, give each session its own sim and Metro port when other sessions are running:

```bash
bunx expo run:ios --device "$UDID" --port 8083
```

[`docs/ios-simulator.md`](../docs/ios-simulator.md) has the full setup and the `maestro-cli` commands
for driving the sim. `bunx expo run:ios --device` with no value prompts for a simulator or a
connected device.

`metro.config.js` is what makes the scrapers bundle: it watches the repo root, resolves packages
from this folder's `node_modules`, swaps Node built-ins for browser shims (`crypto` →
`react-native-quick-crypto`, `zlib` → pako, empty stubs for `fs` / `net` / `tls` …), and replaces
`shared/telemetry` with a no-op.

### Against fake-mychart

Two options:

- **The deployed sandbox** — pick *Springfield Medical Center (Demo)* in the picker.
- **A local server** — start it pinned to a known port, then choose "Enter hostname manually" and
  enter `localhost:4000`. Login uses plain `http` for `localhost`, and the simulator shares the
  Mac's network.

```bash
PORT=4000 bun run fake-mychart     # from the repo root
```

Sign in as `homer` / `donuts123` (`marge` exercises 2FA). See
[`fake-mychart/README.md`](../fake-mychart/README.md).

### Dev shortcuts

- In a `__DEV__` build the Google step has a **Skip (dev)** button (`google-dev-skip`) to walk the
  rest of onboarding without OAuth. It creates no Google session, so AI calls still refuse until
  you really sign in. Release builds strip it.
- `expo-app/secrets.local.json` (gitignored) is read at bundle time as a fallback for
  `claude_api_key`, `gemini_api_key` and `ai_provider`. With a Claude key there and a Google session
  already stored, a dev build skips onboarding.

### Environment variables

Read by `app.config.ts`; each overrides a baked-in default.

| Variable | Default |
| --- | --- |
| `EXPO_PUBLIC_BACKEND_URL` | The production AI Lambda endpoint |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | OpenRecord's Google web client id |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | OpenRecord's Google iOS client id |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | The reversed iOS client id |

The Google client ids are not secrets — iOS ships them in every build.

## Tests

| What | How |
| --- | --- |
| Unit tests (`*.unit.test.ts` under `src/`) | `bun test --isolate expo-app/src` from the repo root; also part of `bun run test` |
| Typecheck (CI runs it) | `cd expo-app && bun run typecheck` |
| testIDs | `src/__tests__/testids.unit.test.ts` fails on any `Pressable`, `TouchableOpacity`, `TextInput`, `Switch` or `Button` under `src/app` or `src/components` without a `testID` |
| Maestro flows | `e2e/` — see below |
| Android smoke | `.github/workflows/android-smoke.yml` — see below |

The unit tests import the real modules, which is why `tool-catalog.ts`, `outOfRange.ts` and
`schema.ts` stay free of React Native imports (the schema test runs it against `bun:sqlite`).

**Every interactive element needs a `testID`** (plus an `accessibilityLabel`), added in the same
diff — Maestro targets by it on both platforms. Naming rules are in
[`docs/ios-simulator.md`](../docs/ios-simulator.md#testids-are-mandatory).

### Maestro flows

- `e2e/android-smoke.yaml` is the only flow CI runs. It cold-boots, checks the welcome screen, taps
  Get Started and stops at the Google sign-in step.
- `alerts.yaml`, `chat-tool-call.yaml`, `drawer.yaml`, `keyboard.yaml` and `signin.yaml` are
  hand-run against an already-authenticated app pointed at fake-mychart. They are not
  self-contained, and `chat-tool-call.yaml` sends a real chat message to a real model — keep it out
  of CI. [`e2e/README.md`](e2e/README.md) has the details.

### Android smoke tiers

| Tier | When | What |
| --- | --- | --- |
| `bundle` | Every PR / push touching `expo-app/**` | `expo prebuild --platform android` + `expo export --platform android` (Metro → Hermes bytecode). Must stay under ~5 min |
| `emulator` | Weekly cron + `workflow_dispatch` only | `gradlew assembleRelease`, API 34 emulator, then `e2e/android-smoke.yaml` |

Neither tier may be able to reach a real model: the flow stops at the sign-in gate, release builds
strip the dev skip button, and the workflow bakes `EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:9`.
Keep all three — see [`docs/testing.md`](../docs/testing.md#android-smoke-tests).

## EAS builds

`eas.json` defines three build profiles (EAS CLI `>= 18.0.0`, app version managed remotely):

| Profile | Settings |
| --- | --- |
| `development` | `developmentClient: true`, internal distribution, iOS simulator build |
| `preview` | Internal distribution |
| `production` | `autoIncrement: true` |

`submit.production` holds the Apple account and team for iOS submissions. The `EXPO_TOKEN` and
Apple credentials used for EAS builds and TestFlight submissions are listed under Secrets in
[`docs/infrastructure.md`](../docs/infrastructure.md).

## Reference

- [Architecture](../docs/architecture.md) — the invariants every client follows
- [Testing](../docs/testing.md) — suites, CI, the coverage gate, Android smoke
- [iOS simulator](../docs/ios-simulator.md) — sim sessions, `maestro-cli`, testID rules
- [Infrastructure](../docs/infrastructure.md) — the AI Lambda, secrets
- [Scrapers](../scrapers/README.md) and [capabilities](../shared/capabilities/) — what the agent can call
