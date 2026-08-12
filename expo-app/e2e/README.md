# Expo App E2E Tests

End-to-end tests for the OpenRecord mobile app across three targets:

| Target | Driver | Where it runs |
|---|---|---|
| Web export | Playwright specs in `web/specs/` | `cd web && bunx playwright test`; `expo-web-e2e` in CI on every PR (fast — no native build) |
| iOS simulator | [Maestro](https://maestro.mobile.dev) flows in `flows/` | `run.sh ios` locally; manual `Mobile E2E` workflow (Actions tab) |
| Android emulator | Same Maestro flows | `run.sh android` locally; manual `Mobile E2E` workflow |

The web export is the always-on layer: it exercises the same JS — onboarding,
real scraper logins against fake-mychart, the chat tool loop, history,
settings — in seconds. The Maestro suites do full native builds (~30-45 min)
and are run on demand.

> **Known issue**: Release simulator builds currently launch to a blank
> screen — the JS bundle executes (DB init, keychain reads) but React mounts
> no views, with no error logged. Debug builds via `expo run:ios` work. Until
> this is root-caused, the Maestro flows can't pass on iOS Release builds;
> they are written and validated against the app's testIDs and the mock
> backend, and the runner/CI plumbing is in place.

## How determinism works

Real AI is never called. The app is built with:

- `EXPO_PUBLIC_E2E=1` — unlocks the Google-skip onboarding button outside
  dev builds, writes a fake backend session token on skip, and adds
  local-HTTP transport exceptions (iOS ATS / Android cleartext). Inlined at
  bundle time — production builds never carry these affordances.
- `EXPO_PUBLIC_BACKEND_URL=http://localhost:4600` — points the app's
  free-tier AI provider at **`mock-ai-server.ts`**, a scripted model that
  speaks the app's JSON tool protocol. Asked about medications, it emits a
  `get_medications` tool call; the app then runs the *real* scraper
  on-device against the local **fake-mychart** (`localhost:4000`,
  homer/donuts123) and the scripted model summarizes the real tool result.
  Chat titles, memory digests, and fact extraction get fixed scripted
  responses.

So the full production pipeline — UI → tool loop → scrapers → MyChart API →
model feedback → rendered reply — runs for real; only the model text is
scripted.

## Running locally

```bash
# iOS (builds the app, boots a throwaway simulator, runs all flows):
expo-app/e2e/run.sh ios

# Re-run flows without rebuilding:
expo-app/e2e/run.sh ios --skip-build

# Android (requires a running emulator; builds the APK, adb-reverses ports):
expo-app/e2e/run.sh android

# Web (exports the app to dist/, then Playwright starts all servers itself):
cd expo-app/e2e/web
bun install
bun run export
bunx playwright test
```

`run.sh` starts fake-mychart and the mock AI server automatically if they
aren't already listening, and leaves servers it didn't start untouched.

## Flow inventory (`flows/`, run alphabetically)

1. `01-onboarding` — welcome → E2E skip → manual hostname → homer login (no
   2FA) → skip passkey → chat home. Resets fake-mychart first.
2. `02-chat-medications` — full tool-loop round trip; asserts the reply
   lists Homer's real fixture medications.
3. `03-history-drawer` — AI-titled chat appears in the drawer, reopening
   restores messages from SQLite, drawer search narrows/misses.
4. `04-settings` — connected account, fake backend session, AI spend from
   the mock server, AI-provider sub-screen navigation.
5. `04b-insights` — the background memory build (scripted digest + insight)
   renders on the Insights screen.
6. `05-alerts` — Homer's refillable meds surface a refill alert on the
   empty state; Ignore dismisses it.
7. `06-onboarding-2fa-passkey` — clean slate, marge login (TOTP code is
   always `123456`), then real passkey registration against fake-mychart
   using the on-device software authenticator.

## Web-specific notes

- Native modules are mapped to `src/lib/shims/*.web.ts` by `metro.config.js`
  for the web platform (localStorage-backed secure-store/sqlite, no-op
  biometrics, throw-on-use crypto/google-signin).
- Browser scraping needs CORS: fake-mychart only sends CORS headers when
  started with `FAKE_MYCHART_CORS=true` (kept off otherwise — real MyChart
  sends none, and the fake must stay faithful). The session manager adds
  `credentials: "include"` to scraper fetches on web so the MyChart session
  cookie sticks cross-origin.
- expo-router keeps stacked screens mounted-but-hidden on web; assert with
  `.filter({ visible: true })` when text exists on more than one screen.
