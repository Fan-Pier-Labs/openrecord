# OpenRecord — Memory

**Scraper knowledge does not live here.** Each scraper is documented by the `README.md` in
its own folder — endpoints, request bodies, the behaviours that bite, the research behind
them. Start at [`scrapers/README.md`](../scrapers/README.md). Everything that used to sit in
this file about eUnity, messaging, keepalive, passkeys, CLO decoding, the pre-login surface
and the React-activity trap is now in the folder it belongs to, beside the code.

What stays here is repo-level: decisions, patterns and gotchas that are not about one
scraper.

## Cross-cutting findings, and where they went

| Finding | Now documented in |
| --- | --- |
| eUnity AMF3 protocol, SAML chain, `serviceInstance` two-phase init, per-image series UIDs | [`scrapers/myChart/eunity/`](../scrapers/myChart/eunity/) |
| CLO format, zigzag signs, modality-LUT windowing, slice ordering | [`scrapers/myChart/clo-image-parser/`](../scrapers/myChart/clo-image-parser/) |
| Messaging API — `medicaladvicerequests` vs `conversations`, `id` vs `conversationId`, the 500-char silent drop | [`scrapers/myChart/chart/messages/`](../scrapers/myChart/chart/messages/) |
| Session keepalive, CSRF-token shapes, failed-answer classification | [`scrapers/myChart/core/`](../scrapers/myChart/core/) |
| Mount discovery, passkey challenge encoding and counter desync, TOTP | [`scrapers/myChart/auth/`](../scrapers/myChart/auth/) |
| The pre-login surface, and anonymous scheduling's three refusals | [`scrapers/myChart/prelogin/`](../scrapers/myChart/prelogin/) |
| A React `/app/*` activity an instance does not serve answers 200 with the Home page | [`scrapers/SCRAPING.md`](../scrapers/SCRAPING.md) |

## Cookie Serialization Bug (Fixed 2026-03-03)

`MyChartRequest.serialize()` was sync but `cookieJar.serialize()` is async → serialized a Promise, not cookies. Fixed by making `serialize()` async + `await` at all call sites (cli.ts, storage.ts, web app).

## Project Patterns
- Scrapers follow pattern: export async function that takes `MyChartRequest`, returns typed data
- `MyChartRequest` handles cookies, headers, redirects via `makeRequest(config)`
- CLI at `cli/cli.ts` with `--host`, `--user`, `--pass`, `--2fa`, `--action` args
- Real-account testing goes through the CLI's credential resolution + cookie cache (`docs/cli.md`), not a creds.json in the repo root

## Monorepo Structure (slimmed 2026-08 to three clients: CLI, desktop extension, mobile)
- `scrapers/` — shared scraper code (myChart)
- `npm-package/` — `mychart-cli` npm package (CLI entry at `npm-package/cli/cli.ts`) + resend 2FA
- `claude-desktop-extension/` — Claude Desktop `.mcpb` extension
- `expo-app/` — Expo/React Native mobile app
- `shared/` — the capability registry, logger, host concurrency limiter and other cross-package helpers
- `read-local-passwords/` — browser keystore extraction
- `scrapers/myChart/clo-image-parser/` — eUnity CLO image parser
- `fake-mychart/` — fake MyChart server for dev/CI
- `openrecord-splash/` — static splash + browser demo (with `openrecord-demo-lambda/` backing it)
- Removed 2026-08: `web/` (Next.js app) and `openclaw-plugin/`
- Tests: `bun run test` (all unit suites from repo root)
- Node 25 + ESLint crashes (SIGABRT) — pre-existing issue, not refactor-related

## Deliberate Non-Simplifications (decided 2026-08-13, don't re-flag in audits)

- **Splash demo tool surface intentionally diverges from the capability registry**
  (invented demo-only tools, its own naming, `instance:` param). Ryan is OK with
  the demo being different; it stays out of the parity test.
- **`fake-mychart/src/lib/amf3.ts` stays a separate AMF3 implementation** — it
  can't import from `scrapers/` because fake-mychart's Docker build context is
  that directory only. (The scrapers themselves now share one strict reader,
  `eunity/amf3Reader.ts`; resilience lives at each call site.)
- **fake-mychart's knob modules (`mount`/`proxy`/`terms`/`epicVersion`) stay
  separate files** — they're mostly documentation of observed real-instance
  behavior; a generic knob factory would scatter it.

## TypeScript 6 Migration Gotchas (2026-08-12)

- TS 6 removed `moduleResolution: "Node"` (node10), `baseUrl`, and non-relative
  `paths` entries — configs using them fail to parse at all, so a CI job that
  never ran tsc hid this. Root tsconfig now: `module: "preserve"`,
  `moduleResolution: "bundler"`, `target: "es2022"`, `types: ["bun", "node"]`
  (without the explicit `types`, `bun:test` fails to resolve), full `strict`.
- Expo SDK 57 removed top-level `splash` (now the `expo-splash-screen` plugin),
  `newArchEnabled`, and `android.edgeToEdgeEnabled` from `ExpoConfig`.
- React Native (expo-app's version) removed `StyleSheet.absoluteFillObject` at
  runtime too — spreading it silently yields `undefined`. Use
  `StyleSheet.absoluteFill`.
- bun:test typing quirk: calling a generic-defaulted method inline inside
  `expect(...)` (e.g. `expect(call.json()).toEqual(...)`) collapses inference to
  `Matchers<undefined>` — pass an explicit type arg (`json<{...}>()`).
- bun's `Mock<...>` can't be cast straight to `typeof fetch` (Bun's fetch has
  `preconnect`); use `as unknown as typeof globalThis.fetch`.
