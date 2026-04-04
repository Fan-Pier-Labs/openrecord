# OpenRecord iOS App — Development Log

## What Was Built

### Expo App Scaffold (`expo-app/`)
- **Expo Router** file-based navigation with 3 tabs (Chat, History, Settings)
- **Onboarding flow**: Welcome → Face ID → API Key → Add MyChart Account
- **Chat screen**: Full chat UI with message bubbles, markdown rendering, tool call indicators
- **History screen**: Chat list with search, date display, swipe-to-delete
- **Settings screen**: MyChart account management, Claude API key (masked), model selector
- **Individual chat view**: Resume chats from history

### Core Infrastructure
- **Face ID auth gate** (`expo-local-authentication`) — biometric lock on app open
- **iOS Keychain storage** (`expo-secure-store`) — credentials, passkeys, API key
- **SQLite chat persistence** (`expo-sqlite`) — chats + messages tables, CRUD + search
- **Web shims** for all native modules (localStorage, in-memory SQLite, etc.)

### AI Integration
- **Claude API client** (non-streaming) with full tool use loop
- 25 health data tools defined (matching MCP server tool definitions)
- Tool executor bridges Claude's tool_use requests to local scrapers
- CORS proxy (`proxy.js`) for web development

### Ported Scrapers
- `myChartRequest.ts` — HTTP client with tough-cookie (replaces fetch-cookie)
- `softwareAuthenticator.ts` — WebAuthn passkey ops (react-native-quick-crypto)
- `login.ts` — Full login flow: password, 2FA (email + SMS), passkey auth
- `session-manager.ts` — Multi-account sessions, keepalive, auto-reconnect, TOTP

### Main Repo Changes
- **Removed `fetch-cookie` dependency** from scrapers — replaced with direct `tough-cookie` usage
- All 266 unit tests pass with the new implementation
- Removed from `package.json` and `web/next.config.ts`

## What Works (Tested)

### iOS Simulator
- App builds and runs on iPhone 17 Pro simulator
- Onboarding flow displays correctly
- Auto-skips onboarding in dev mode when `secrets.local.json` has API key
- Chat screen renders with input, send button, tabs
- Tabs (Chat, History, Settings) navigate correctly

### Web (via Playwright MCP)
- Chat with Claude API — sends messages, receives formatted responses
- Markdown rendering (bold, bullets, numbered lists, emojis, code)
- Tool use loop — Claude calls tools, gets results, responds intelligently
- Chat history persistence with correct dates ("Today")
- New Chat functionality
- Settings — add/view/remove MyChart accounts
- API key storage (masked with show/hide toggle)
- Model selector (Sonnet/Opus/Haiku)
- Tab navigation works correctly

## Bugs Found & Fixed

1. **"No response body" error** — React Native's `fetch` doesn't support `response.body.getReader()` for streaming. Fixed by switching to non-streaming Claude API.

2. **cheerio `node:stream` import crash** — cheerio's ESM entry pulls in Node.js streams. Fixed with Metro config `resolveRequest` to force cheerio's browser build.

3. **"Invalid Date" in history** — Web SQLite shim's UPDATE handler didn't correctly map SET columns to params. Fixed by passing ISO date strings as params instead of using `datetime('now')` SQL function.

4. **SafeAreaView deprecation warning** — Switched from `react-native` SafeAreaView to `react-native-safe-area-context`.

5. **Tab routing warnings** — Expo Router tab names needed to include `/index` suffix to match directory structure.

6. **react-native-quick-crypto crash on web** — Top-level import crashed the web bundle. Fixed with lazy `require()` guarded by `Platform.OS` check.

7. **React version mismatch** — `react` 19.1.0 vs `react-dom` 19.2.4. Fixed by pinning `react-dom@19.1.0`.

8. **Buffer/ArrayBuffer type mismatch** — `react-native-quick-crypto` returns Buffer objects. Can't just cast `as ArrayBuffer`. Fixed with `bufferToUint8Array()` helper that copies byte-by-byte.

## Problems / Blockers

### Web Testing Limitations
- **CORS blocks all API calls from browser** — Both Anthropic API and MyChart APIs reject cross-origin requests. Required building a local CORS proxy (`proxy.js`).
- **`redirect: "manual"` returns opaque responses on web** — Browser security feature. The scraper relies on manual redirect handling to extract Location headers, but browser fetch returns status 0 for manual redirects. Would need proxy to convert 3xx → 200 with custom headers. Abandoned this approach.
- **Native modules don't work on web** — expo-secure-store, expo-sqlite, expo-local-authentication, react-native-quick-crypto all need web shims.

### iOS Simulator Testing Limitations
- **No programmatic interaction** — `xcrun simctl` doesn't have tap/type commands. Can only take screenshots and launch/terminate apps.
- **Can't verify Claude responses** — Can send messages by rebuilding the app, but can't read the response text back programmatically.
- **Installing Maestro** for proper simulator UI testing.

### Scraper Wiring (Not Yet Done)
- The `runScraper()` function in `session-manager.ts` returns placeholder responses
- The 30+ individual scraper modules (profile, medications, labs, etc.) need to be imported and mapped to tool names
- These scrapers import from `./myChartRequest` which would need to point to the ported version
- On web, all scraper HTTP calls hit CORS (would work fine on iOS)

## Architecture Decisions

1. **Non-streaming API** — React Native's fetch doesn't support ReadableStream. Used synchronous API calls. Text appears all at once per turn. Could add streaming later with a polyfill like `react-native-sse`.

2. **Web shims for development** — Created localStorage/in-memory replacements for native modules to enable Playwright testing. These are dev-only.

3. **CORS proxy** — Simple Node.js HTTP proxy that adds CORS headers. Forwards requests to Anthropic API and MyChart servers. Dev-only, not needed on iOS.

4. **Lazy crypto import** — `react-native-quick-crypto` imported via `require()` inside a function, guarded by `Platform.OS !== "web"`, to prevent web bundle crash.

5. **tough-cookie directly** — Removed `fetch-cookie` from the main repo scrapers. Manual cookie injection via `getCookieString()`/`setCookie()`. All 266 tests pass. Same approach used in both main repo and expo app.

## Next Steps

1. **Maestro testing** — Install Maestro for proper iOS simulator UI automation (text matching, element tapping, assertions)
2. **Wire scrapers** — Map tool names to scraper functions in `runScraper()`. Import from ported myChartRequest.
3. **Test with fake MyChart** — Connect to `fake-mychart.fanpierlabs.com` on iOS simulator (no CORS issues)
4. **Streaming responses** — Add `react-native-sse` or similar for word-by-word streaming
5. **Passkey registration flow** — Wire `createCredential()` into Settings UI
6. **Create PR** — Once core features are tested end-to-end
