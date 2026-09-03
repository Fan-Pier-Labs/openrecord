# MyChart Scrapers - Memory

## eUnity Image Viewer Protocol (Reverse-Engineered 2026-03-03)

See `scrapers/myChart/eunity/docs/EUNITY_PROTOCOL.md` for full details.

**Direct HTTP download pipeline works end-to-end** (no Playwright needed):
1. SAML chain → JSESSIONID
2. AMF `getStudyListMeta` → code=0, study metadata with all series/instance UIDs
3. `CustomImageServlet` CLOWRAPPER → 6+ MB CLO image data

Key AMF protocol details (verified by byte-for-byte match with captured browser traffic):
- `AmfServicesMessage` sealed members: `messageID`, `messageType`, `body` (order matters!)
- `AmfServicesRequest` sealed members: `service`, `method`, `parameters` (NOT `args`)
- Parameter is `StudyListRequest` Externalizable object (NOT a string array)
- patientId format: `<MRN>$$$<SITE>` (triple dollar signs)
- AMF3Writer needs string reference table for correct encoding

Key endpoints on the eUnity server:
- **`POST /e/AmfServicesServlet`** — AMF binary protocol for study metadata (series/instance UIDs)
- **`POST /e/CustomImageServlet`** — Image data (`CLOWRAPPER` or `CLOPIXEL`)
- Response format: `CLOHEADERZ01` magic + zstd-compressed Haar wavelet data
- Auth: JSESSIONID cookie from SAML chain; CLOAccessKeyID tokens are single-use, expire in ~1-2 min
- `node-fetch` fails at the SAML selfauth endpoint (TLS fingerprinting) — use `globalThis.fetch`

## Cookie Serialization Bug (Fixed 2026-03-03)

`MyChartRequest.serialize()` was sync but `cookieJar.serialize()` is async → serialized a Promise, not cookies. Fixed by making `serialize()` async + `await` at all call sites (cli.ts, storage.ts, web app).

## MyChart Messaging API (Reverse-Engineered)

See [mychart-messaging-api.md](mychart-messaging-api.md) for full details.

Key points:
- New messages use `/api/medicaladvicerequests/` endpoints (NOT `/api/conversations/`)
- Replies use `/api/conversations/SendReply`
- `messageBody` is an **array of strings**, not a plain string
- All API calls need `__RequestVerificationToken` header from `/app/communication-center` HTML
- WP-encoded IDs used throughout (e.g. `WP-24...`)

## MyChart Session Keepalive (Reverse-Engineered 2026-03-06)

MyChart has TWO separate timeout mechanisms:

**Server-side session**: Kept alive by calling `/Home/KeepAlive?cnt=N` and `/keepalive.asp?cnt=N` every 30s (both return "1" if alive, "0" if expired). These are the actual endpoints that reset the server session timer. Pinging `/Home` does NOT extend the session — it just serves the page.

**Client-side inactivity timer**: JavaScript `checkActivity()` tracks `$$WPUtil.setActivity.__lastActivity`. Shows a "Your session is expiring" popup at 19 min (`refreshTimeout=1140000ms`), force-logs out at 20 min (`sessionTimeout=1200000ms`). Only reset by user interaction (mouse/keyboard) or clicking "Stay logged in" (which calls `$$WPUtil.setActivity()`). The keepAlive pings do NOT reset this timer.

For our scraper: only the server-side keepalive matters. The client-side timer is browser JS only. Fixed in PR #59 — sessionStore now calls both `/Home/KeepAlive` and `/keepalive.asp` every 30s.

The sessionStore's globalThis singleton (`scrapers/myChart/core/sessionStore.ts`) was added for the removed `web/` Next.js app; no Next.js code imports it anymore, so a plain module-level singleton would suffice.

## Playwright Virtual Authenticator for Passkey Login

Playwright can use CDP virtual authenticators to log in with saved software passkeys automatically — no 2FA needed:

```typescript
const cdpSession = await page.context().newCDPSession(page);
await cdpSession.send('WebAuthn.enable');
const { authenticatorId } = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true }
});
// Add saved credential from .passkey-credentials/<hostname>.json
await cdpSession.send('WebAuthn.addCredential', {
  authenticatorId,
  credential: { credentialId, rpId, privateKey, userHandle, signCount, isResidentCredential: true }
});
```

Private key format: CDP expects raw PKCS8 bytes as base64, which is exactly what's stored in the credential file. Then click "Log in with passkey" and the virtual authenticator handles everything.

## eUnity Image Download — Each Image Has Its Own SeriesUID (Discovered 2026-04-05)

The AMF parser may report multiple instanceUIDs under the "same" seriesUID, but the real eUnity viewer treats each (seriesUID, objectUID) pair as a separate image request. Network capture shows:
- 3 separate CLOWRAPPER requests with 3 **different** seriesUIDs, each with `frameNumber=1`
- Requesting the same seriesUID with different objectUIDs returns 217-byte errors
- `level` parameter varies per series (0, 3, 4) — not just per progressive refinement

The scraper must use each entry's own seriesUID + instanceUID as-is from the AMF parse, not group by seriesUID.

## Passkey Challenge Encoding (Fixed 2026-04-05)

WebAuthn spec requires the `challenge` field in `clientDataJSON` to be **base64url** encoded, not standard base64. The MyChart server sends the challenge as standard base64. Must convert: `Buffer.from(challenge, 'base64').toString('base64url')` before building clientDataJSON.

## CLO Sign Encoding — Zigzag is Correct (2026-04-06)

Attempted two's complement decoding based on eUnity's GPU shader code (`unpackedValueFromSignedShort`), but it produced WORSE results (visible checkerboard/tile artifacts). The shader's two's complement is for the final pixel display stage, NOT wavelet coefficient decoding. Zigzag is correct.

## MRI Downloads Work (2026-04-06)

MRI was previously skipped in the CLI (`nameLower.includes('mri')` check). Removed the skip — the eUnity pipeline is modality-agnostic (same CLO format for X-ray, CT, MRI). Successfully tested MRI downloads with multi-series studies.

## CLO Windowing Needs the Modality LUT (Fixed 2026-08-13)

`windowCenter`/`windowWidth` in the CLO wrapper are in **output** units (Hounsfield for CT); the
reconstructed pixels are **stored** values. `applyVoiLut` compared them directly and ignored
`rescaleSlope`/`rescaleIntercept` (parsed but unused). With a typical intercept of -1024, a narrow
soft-tissue window (centre 50, width 150) against stored values clips everything above 125 — soft
tissue saturates to white and only air keeps any gradation. Apply `stored * slope + intercept` per
pixel before windowing. Wide windows (centre 350/width 2000) still looked plausible, which is why
this hid for so long. `parseWrapper` also dropped negative window centres behind a `> 0` guard —
report/scout frames commonly use -512 and lung windows sit near -600.

## React `/app/*` Activities Are Not Always Served (Learned 2026-09-03)

An instance still on the legacy jQuery version of an activity answers `GET /app/<activity>` with a
**200 Home page**, and every `/api/*` endpoint in that activity's React bundle 500s with
`{"Message":"An error has occurred."}` whatever it is sent — indistinguishable from "no data".
The bundle still downloads, so the caller looks real. Check the page `<title>`, then read the legacy
page's `bundles/<area>-controllers` for the real `makeLink("Area/Controller/Action")` call.
`/api/insurance/LoadPayers` (dead on 4/4 instances) vs `Insurance/Coverages/GetPayors` (live,
org-level payer catalogue) was this trap — `docs/api-surface-gaps.md` §1f, `docs/scraping.md`.

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
- **The AMF3 implementations stay separate**: `eunity/amf3Reader.ts` (strict) vs
  the lenient reader in `clo_to_bitmap.ts` have deliberately different failure
  semantics (see their headers), and `fake-mychart/src/lib/amf3.ts` can't import
  from `scrapers/` because fake-mychart's Docker build context is that directory
  only.
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
