# CLAUDE.md

## Project Overview

Health data platform that connects to Epic MyChart portals to scrape and consolidate a patient's medical records. Supports 30+ data categories. Ships three clients on one shared scraper core: a Claude Desktop extension (`.mcpb`), an Expo/React Native mobile app, and a headless CLI published as the `mychart-cli` npm package.

## License

Proprietary source-available license (see `LICENSE`). Viewing and personal/educational use permitted; no commercial use, redistribution, SaaS offerings, or competing products without written permission from Fan Pier Labs. Modifications must be contributed back via PR.

## Architecture

- **Scrapers** (`scrapers/`): Shared scraper code for MyChart — every client calls into these
- **Mount discovery** (`scrapers/myChart/login.ts`): `determineFirstPathPart` works out where MyChart lives on a hostname — the prefix its routes sit under (`/MyChart`, `/UCSFMyChart`, `prd`, or nothing for a root-mounted instance) and which host actually serves it. It follows the root redirect chain to the end (Location headers, meta refreshes, scripted `window.location`, cross-host moves), since MyChart's canonical bounce only names the mount on its last hop. Guesses — a link off a landing page, a host it was redirected to — are checked for a real login page before being trusted. Verify changes with `probe-mount-discovery.ts` (see Key Commands).
- **Per-host rate limiting** (`shared/hostConcurrency.ts`): Every outbound scraper request goes through `MyChartRequest.makeRequest`, which holds a per-hostname permit for the duration of each fetch. At most **10 requests are in flight to a single MyChart host at a time**, process-wide — the limiter is keyed by host and shared across every session and client, because the far end counts connections, not accounts. A full 30-category scrape otherwise fans out ~60 simultaneous requests at one hospital, which is how an instance ends up in `blockedInstances.ts`. Override with `MYCHART_MAX_CONCURRENT_REQUESTS_PER_HOST`; anything that isn't a positive integer falls back to 10 rather than silently disabling the cap. **The permit wraps only the individual fetch, never the redirect recursion** — `makeRequest` calls itself to follow redirects, and holding a permit across that would let one chain hold several at once and deadlock against its own callers. `requestConcurrency.test.ts` covers that case specifically; it times out if the permit is ever moved to wrap the whole call. Keys on the host actually being contacted, so a cross-host redirect gets its own budget instead of spending the vanity hostname's.
- **CLI + npm package** (`npm-package/`): Headless CLI entry point (`npm-package/cli/cli.ts`) — bundled into the published `mychart-cli` npm package as the `mychart-cli` bin, alongside an importable library. `npm i -g mychart-cli` puts `mychart-cli` on PATH. Great for Claude Code to use for testing changes in the CLI or scrapers.
- **Claude Desktop extension** (`claude-desktop-extension/`): A `.mcpb` Claude Desktop Extension that runs the scrapers locally as an MCP server. `bun run pack` builds `dist/server.cjs` and produces `openrecord.mcpb`. Includes an interactive setup widget (health-system autocomplete over the MyChart directory, sign-in, 2FA) with a tool-call fallback for non-widget clients. Credentials are stored locally in `~/.openrecord-mcpb/`. Ships a built-in **Springfield General Hospital (test)** instance pointing at `fake-mychart.fanpierlabs.com`. See `claude-desktop-extension/README.md`.
- **Mobile app** (`expo-app/`): Expo/React Native iOS app running the scrapers on-device, with an agent loop (`src/lib/ai/claude-client.ts`), skills, and alerts. Build with `bunx expo run:ios`. **AI requires Google sign-in — all providers, BYO keys included.** Signing in is what unlocks the $50/month included credit: the free tier POSTs to the OpenRecord AI Lambda with the user's Google ID token attached (`backendUrl` in `expo-app/app.config.ts`, override with `EXPO_PUBLIC_BACKEND_URL`), and the Lambda verifies the token server-side — the client is never trusted about identity. Tokens live ~1h; `getFreshIdToken()` (`src/lib/backend/google-signin.ts`) silently re-signs-in to refresh. BYO-key providers call OpenAI/Anthropic/Gemini directly. Everything else lives on-device.
- **Shared types** (`shared/`): Common types and enums shared across packages
- **Read local passwords** (`read-local-passwords/`): Browser password store extraction (Chrome, Arc, Firefox) — used by the CLI
- **CLO image parser** (`scrapers/myChart/clo-image-parser/`): eUnity CLO image format decoder and encoder
- **Newsletter Lambda** (`newsletter-lambda/`): Tiny zero-dep AWS Lambda that captures newsletter/waitlist signups and `console.log`s them to CloudWatch (log group `/aws/lambda/newsletter-signup`). Replaces the old Formspree integration. Fronted by an API Gateway HTTP API (`newsletter-signup-api`, wide-open CORS) because this account blocks unauthenticated Lambda Function URLs. Deploy with `cd newsletter-lambda && AWS_PROFILE=fanpierlabs ./deploy.sh`. Endpoint: `https://a4443h7zdd.execute-api.us-east-2.amazonaws.com`. Read signups via CloudWatch Logs Insights: `fields @timestamp, @message | filter @message like /newsletter_signup/ | sort @timestamp desc`. Hidden `company` honeypot field drops bots. See `newsletter-lambda/README.md`.
- **Fake MyChart** (`fake-mychart/`): Standalone Next.js app that mimics MyChart's API surface with Homer Simpson fake data. Used for development without real MyChart access and CI integration tests. Run with `cd fake-mychart && bun run dev` (port 4000). Credentials: `homer`/`donuts123` (no 2FA) or `marge`/`donuts123` (TOTP enabled — always requires the 2FA code `123456`). Set `FAKE_MYCHART_ACCEPT_ANY=true` to accept any username/password. All state lives in RAM. Visit `/reset` (or `POST /reset`) to wipe all in-memory state — sessions, sent messages, emergency contacts, per-user TOTP/passkeys, booked appointments, active patient record, mount/discovery/proxy-discovery/terms modes — back to the seed. `POST /mode` sets the knobs: `{"mode":"prefixed"|"root"}` is where MyChart is mounted (under `/MyChart`, or at the domain root like Cleveland Clinic); `{"discovery":…}` is how `/` announces that — `redirect` (302 with a `Location`), `meta-refresh` (200 with an absolute `<meta http-equiv="refresh">`, Renown), `default-asp` (the multi-hop bounce through a bare relative `DefaultAsp` that only names the route on its last hop, adams.mychartcc.com), `script` (a `window.location` assignment, mydovetale.ca), `landing-page` (an affiliate chooser that redirects nowhere and only links at the mount, mychart.chihealth.com), or `moved-host` (the deployment now lives elsewhere, patients.mycslink.org → mycslink.cedars-sinai.org — pair it with `{"movedHost":"127.0.0.1:4000"}`); and `{"proxyDiscovery":"json"|"html"|"script"}` is which surface lists the patient records an account can access, and `{"requireTerms":true|false}` is whether login lands on the chart or bounces to Terms & Conditions until accepted (this replaced the `FAKE_MYCHART_REQUIRE_TERMS` env var, which needed a whole second server on another port, its own CI job and its own test directory to exercise). Omitted keys are left alone; all combinations work. Whichever mount is active serves MyChart from exactly one prefix — the other 404s, and a root-mounted instance 404s `/<anything>/Authentication/*` so a wrong prefix guess can't silently pass.
  - **Proxy (multi-patient) records**: `homer` has proxy access to his three kids (Bart, Lisa, Maggie), each with its own chart data — switching context changes what every endpoint returns, and a category a child has no data for comes back empty rather than falling through to Homer's. `marge` has none. **Every record, the account holder's included, carries a long opaque `WP-…` id; self is identified by `IsSelf`, never by a blank id** (confirmed on UCSF, Renown and Carson Tahoe — see PR #206). Served via `GET /ProxySwitch` and switched via `GET /inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=<id>`; the account holder's own `LinkUrl` is a bare `inside.asp`. The `proxyDiscovery` knob above selects the JSON endpoint, `.proxySubjectLink` anchors, or bare `proxySubjects.push(...)` script blocks, so all three scraper fallbacks are testable. Only the JSON surface has been verified against real instances; the HTML/script markup is inferred. See `fake-mychart/README.md`.
  - **Fidelity rule — the fake MUST behave EXACTLY like real MyChart.** It is a faithful stand-in, not a convenience mock. Always replicate the real API's response shapes, field names/casing, pagination (page sizes, `HasMoreData`/`SerializedIndex` continuation), status codes, and server-side enforcement rules (e.g. WebAuthn signature-counter monotonicity) precisely as observed on a real instance. Never simplify a contract just to make a test easier — if real MyChart returns 10 results per page, the fake returns 10, and the fixture/test is sized around that. When you discover how a real endpoint behaves, update the fake to match it exactly.

## Key Commands

- `bun run lint` — Run ESLint
- `bun run test` — Run all unit tests (scrapers, shared, CLI, expo-app libs, desktop extension)
- `bun run test:unit` — Alias for `bun run test`
- `bun run test:integration` — Run integration tests (requires credentials)
- `bun run test:fake-mychart` — Run scraper tests against a running fake-mychart on port 4000
- `bun run cli` — Run the CLI scraper (defaults to MyChart)
- `bun run cli mychart [flags]` — MyChart scraper
- `cd fake-mychart && bun run dev` — Run fake MyChart server on port 4000
- `cd fake-mychart && bun run build` — Build fake MyChart for production
- `cd claude-desktop-extension && bun run pack` — Build the Claude Desktop extension (`openrecord.mcpb`)
- `cd npm-package && bun run build` — Build the `mychart-cli` npm package (CLI binary at `npm-package/dist/cli.cjs`)
- `bun run test:ci-integration` — Run CI integration tests (requires Docker Compose fake-mychart running and the CLI binary built)
- `bun scrapers/list-all-mycharts/probe-mount-discovery.ts` — Run mount discovery against all ~750 hosts in the directory and report the ones it gets wrong. Run it after touching discovery. Sends no credentials. Flags: `--out`, `--concurrency`, `--limit`, `--hosts a.org,b.org`, `--verbose`.
- `docker compose -f docker-compose.ci.yaml up -d --build --wait` — Start the CI fake-mychart service (port 4000)
- `docker compose -f docker-compose.ci.yaml down -v` — Tear down CI services

## CI Integration Tests

Integration tests in `tests/integration/ci/` run against the dockerized fake-mychart from `docker-compose.ci.yaml` (served on `localhost:4000`):

- `cli-passkey.test.ts` — spawns the built CLI (`npm-package/dist/cli.cjs`) to exercise passkey setup, passkey auto-login, and passkey removal end to end. Build the CLI first (`cd npm-package && bun run build`).
- `fake-mychart-passkey-ui.test.ts` — Playwright-driven browser test of the fake-mychart passkey UI using Chromium's WebAuthn virtual authenticator (a CDP feature plain `fetch` can't replicate).

The `fake-mychart` CI job separately runs the scraper suite (`bun run test:fake-mychart`), the desktop-extension tests, and the npm-package tests against a locally built fake-mychart server.

**Protocol detection**: Hostnames without a dot (e.g. Docker service names like `fake-mychart:3000`) automatically use HTTP instead of HTTPS.

## Proxy (Multi-Patient) Support

Accounts with proxy access to several patients' charts (a parent reading a child's record) can list and switch the active patient. **MyChart's active patient is server-side session state — there is no per-request patient parameter — so callers must name the patient they mean rather than relying on a previous switch.** `withProxyTarget(request, patient, fn)` in `scrapers/myChart/proxyContext.ts` is the primitive for that; `findProxyTarget` resolves a name, partial name, id or `me` and refuses to guess when ambiguous. The CLI is deliberately conservative: reads never mutate. `--patient "<name>"` (names only, never ids; defaults to the account holder) asserts who the command is about via `checkProxyContext`, and if MyChart is on someone else the CLI errors out with the `--action list-proxies` and `--switch "<name>"` commands to run. `--switch` is the only command that changes MyChart's server-side active patient. Switching changes which record every other tool reads from, and is verified against the profile page before it returns — a switch that lands on a different patient fails instead of returning the wrong chart. Record ids are opaque and organization-specific, so switch tools accept `self: true` to return to the account holder rather than requiring a looked-up id.

**All three clients expose proxy support, with the CLI's semantics.** The Claude Desktop extension and the mobile app share `scrapers/myChart/proxyTools.ts`, a thin client layer over `proxyContext.ts`: `runListProxyTargets` / `runSwitchProxyTarget` back the `list_proxy_targets` / `switch_proxy_target` agent tools registered in both clients (extension: `claude-desktop-extension/src/tools.ts`; app: declared in `expo-app/src/lib/ai/tool-catalog.ts`, dispatched in `expo-app/src/lib/scrapers/session-manager.ts`), and `assertProxyReadContext` gates every other data tool: each call asserts the active patient (an optional `patient` arg names one; omitted means the account holder) and refuses with instructions rather than reading whichever record a previous switch left active. The guard caches one proxy discovery per session in a `WeakMap` keyed on the `MyChartRequest`, so a re-login (keepalive reconnect, process restart) can never inherit stale knowledge, and parallel reads (the app's memory builder) share a single discovery. In the app, `switch_proxy_target` is an exclusive write tool with a native confirmation dialog; the app's background memory/alert jobs run through the same guard, so they fail safe instead of mixing a family member's data into the account holder's caches. Note an account with no proxy access can still surface a single self-only entry on `/ProxySwitch` — a one-entry list is "nothing to switch", not an error. Tests: `scrapers/myChart/__tests__/proxyTools.test.ts` (mocked), `scrapers/myChart/__tests__/fake-mychart/proxy.test.ts` (end-to-end against fake-mychart), `claude-desktop-extension/src/__tests__/proxy-tools.test.ts` (registration shape), `expo-app/src/lib/ai/__tests__/tool-catalog.test.ts` (declarations + write gating).

## Reference Docs

- **[CLI reference](docs/cli.md)** — Cookie caching, credential resolution, 2FA, CLI actions
- **[Imaging scraper](docs/imaging.md)** — eUnity protocol, AMF3, instance-specific notes
- **[Scraping guide](docs/scraping.md)** — MyChart login, scraping tips, and tooling
- **[MyChart features](docs/MYCHART_FEATURES.md)** — Full inventory of MyChart features and scraper coverage
- **[MyChart TOTP](docs/mychart-totp.md)** — TOTP authenticator app 2FA setup, API endpoints, CLI flags

## Deployment

- **AWS account**: fanpierlabs (`aws --profile fanpierlabs`), region `us-east-2`
- **Fake MyChart** (`fake-mychart/`): Fargate app deployed independently. **Run the deploy script from inside `fake-mychart/`** so the relative `Dockerfile` path resolves to `fake-mychart/Dockerfile`:
  - `cd fake-mychart && bun install && bun run deploy` (uses its own `deploy` dev dependency and `deploy.yaml`)
  - Domain: `fake-mychart.fanpierlabs.com` (its own ALB + ECS service `fake-mychart-service` in cluster `fake-mychart-cluster`)

### Static splash page + interactive demo (primary public site)

- **`openrecord.fanpierlabs.com` serves a static site.** See `openrecord-splash/`.
  - Two halves on purpose: `index.html` is a hand-written self-contained splash with no build step, and `demo/` is a React + TypeScript app built with Vite. On S3 + CloudFront, following the standard Fan Pier Labs static-site pattern (`people-monitor-tool`, `autoinsights`, …).
  - Bucket `openrecord-fanpierlabs-com` (us-east-2, private) → CloudFront `EXUZ8GHUQ9ULF` (OAC `E1X3K4LP97988Z`, wildcard `*.fanpierlabs.com` cert). Deploy: `cd openrecord-splash && AWS_PROFILE=fanpierlabs ./deploy.sh` — it typechecks, builds the demo into `dist/`, then uploads `index.html`, `demo.html`, the hashed assets, and the icons/share card/manifest, setting content types explicitly (a `.js` served as `binary/octet-stream` is refused by the browser's module loader). Hashed assets get a one-year immutable cache; the HTML and the fixed-name assets are invalidated.
  - Splash is presentational — no auth. Waitlist form posts to the shared `fanpierlabs-forms` Lambda (`https://ns8remz3t7.execute-api.us-east-2.amazonaws.com`), which is not in this repo.
  - **The demo lives at `/demo.html`, not `/demo`** — the default root object only applies to `/`, and the 403/404 → `/index.html` error handling would otherwise quietly serve the splash.
  - **The splash deliberately does not link to the demo.** `/demo.html` deploys with every push but is unadvertised, so it is reached by sharing the URL. Don't "fix" the missing CTA — putting the demo on the homepage is a product decision to make on purpose.
  - **Share previews + PWA assets**: `og-image.png` (1200×630 card), `favicon.ico`, `icon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `manifest.json`. The PNGs are generated but committed — run `cd openrecord-splash && ./generate-assets.sh` after editing `icon.svg` or `assets-src/og-image.html`. It renders the card with headless Chrome and the icons with `rsvg-convert` (`brew install librsvg`). `og:image` must be an **absolute** `https://` URL — iMessage and Slack will not resolve a relative path. `deploy.sh` uploads and invalidates every asset; `openrecord-splash/__tests__/metadata.test.ts` fails if one is referenced but not deployed.

### Interactive demo (`openrecord-splash/demo/`)

A complete OpenRecord session running in the browser against a fictional patient (Homer Simpson), so people can try the product before installing anything. Re-creates **both clients** — the iOS app and the Claude Desktop extension — sharing one session, so a refill requested on the phone shows up in the desktop chat.

**React 19 + TypeScript, built with Vite.** `strict` everywhere; `npx tsc --noEmit` runs as part of the build and of `deploy.sh`, so the demo cannot ship with a type error. Build output goes to `openrecord-splash/dist/` (gitignored). React and its types resolve from the **root** `package.json` — the demo's own manifest is script-only.

Logic modules — framework-free and fully unit-tested:

- `src/data.ts` — the fictional record, extended with multi-draw lab trends and a longer billing ledger. Payload shapes elsewhere are derived from it with `typeof` so they can't drift.
- `src/types.ts` — shared types for the record, tool layer, and agent loop.
- `src/tools.ts` — all 46 MyChart tools. **Write tools genuinely mutate session state** (refills decrement, booked slots leave the pool, sent messages appear in `get_messages`).
- `src/agent.ts` — the agent loop, a faithful port of `expo-app/src/lib/ai/claude-client.ts`: same JSON tool-call protocol (`{"tool": ..., "args": ...}`), read batching, exclusive write tools, `respond` terminator.
- `src/stream.ts` — reveals a finished reply at the pace a model would have produced it. Uses `setTimeout`, **not** `requestAnimationFrame`: rAF is paused in background tabs, so a visitor who switches away mid-reply would return to a message frozen half-written.
- `src/skills.ts` — the three skill playbooks plus the home-screen alert cards.
- `src/markdown.ts` — parses assistant replies into a typed tree. Produces no HTML.

Components:

- `src/App.tsx` — shell: owns the session, surface switching, the shared tool-call activity panel. Both surfaces stay mounted (toggled with `hidden`) so switching clients preserves each conversation.
- `src/components/IosSurface.tsx`, `DesktopSurface.tsx` — the two device surfaces.
- `src/components/Markdown.tsx` — renders the parsed tree as React elements.
- `src/components/Radiograph.tsx` — the chest X-ray, drawn procedurally on a canvas rather than shipped as a file, and labelled as simulated.
- `src/config.ts` — `AI_ENDPOINT`, resolved from `?ai=<url>`, then `VITE_AI_ENDPOINT`, then the baked-in default.

**Every reply is a real model call — there is deliberately no canned-response path.** An earlier version fell back to a keyword table when no model was reachable, and it produced confident non sequiturs the moment a visitor asked something it hadn't anticipated. A failed call now surfaces an honest error and the badge reads "Model unreachable". **The demo also starts on a connected account** — the onboarding and extension-setup flows belong to the product, not the demo.

**Security:** model output is untrusted. `markdown.ts` parses it into a typed tree and `Markdown.tsx` renders that tree as React elements, so React escapes every text node. **There is no `dangerouslySetInnerHTML` in the demo and there must never be one** — see the project rule above. Tests assert that markup in model output stays text.

Local dev: `cd openrecord-splash/demo && npx vite` (serves `/demo.html` with hot reload).

### OpenRecord AI Lambda (`openrecord-demo-lambda/`)

Zero-dep Lambda backing both the demo's chat turns and the **mobile app's free tier**. Takes `{ system, messages, model? }` and returns `{ text }` — a provider-neutral shape, so the demo's and the app's agent loops stay identical.

- Endpoint: `https://dur15eh31e.execute-api.us-east-2.amazonaws.com` (baked into `openrecord-splash/demo/src/config.ts` and `expo-app/app.config.ts`).
- **Two tiers.** Unauthenticated (the browser demo): `gemini-2.5-flash` / `gemini-2.5-flash-lite`, per-IP rate limit (40 req / 10 min). Signed-in (the mobile app): the request carries a Google ID token as `Authorization: Bearer`, verified server-side in `src/google-auth.mjs` against Google's JWKS (signature, issuer, audience = our OAuth client ids, expiry) — never trust the client about identity. Verified users additionally get **`gemini-2.5-pro`**, a higher per-account rate limit (120 req / 10 min), and the **$50/month included credit**, metered per Google account × calendar month in the `openrecord-ai-spend` DynamoDB table (`src/spend.mjs`, on-demand billing; the AWS SDK comes from the Lambda runtime, imported lazily so local tests stay dependency-free). Over the cap → 402. `GET` with a valid token returns `{ spentCents, limitCents, remainingCents, period }` for the app's settings screen. Invalid/expired tokens → 401 (the app silently refreshes and retries), unauth request for pro → 403.
- Model: **`gemini-2.5-flash` with `thinkingBudget: 0`** by default; override with `DEMO_MODEL=... ./deploy.sh`. Flash-lite as the *primary* model was tried and rejected: it completed 23/40 of the demo's own suggested prompts against flash's 40/40. See `openrecord-demo-lambda/README.md`.
- Reuses the existing `GEMINI_API_KEY` secret, read at deploy time and set as a function env var (so the Lambda needs no Secrets Manager permissions). Google OAuth client ids and the spend table name are also env vars set by `deploy.sh` (`GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `SPEND_TABLE`, optional `SPEND_LIMIT_CENTS`).
- Public endpoint, so it's treated as hostile input: a server-side guard preamble is prepended to whatever system prompt the client sends (worded to fit both the fictional-patient demo and the app's real-record sessions), plus the rate limits above, a per-container global cap, and hard size caps. Upstream error bodies are never forwarded (they can echo the key's project id).
- Deploy: `cd openrecord-demo-lambda && AWS_PROFILE=fanpierlabs ./deploy.sh`. Creates/updates the `openrecord-demo-ai` Lambda, the `openrecord-demo-ai-api` HTTP API, the `openrecord-ai-spend` DynamoDB table, and the role's table access, then prints the endpoint — if it changed, update the two baked-in configs above and redeploy the splash site.
- Usage/cost: `fields @timestamp, @message | filter @message like /demo_ai_call/ | sort @timestamp desc` on `/aws/lambda/openrecord-demo-ai` (`authed: true|false` per call).
- **Any proxy failure surfaces an honest error in the chat** and flips the header badge to "Model unreachable". The demo has no offline path by design.

## S3 Buckets (us-east-2)

- **mychart-connector** (`arn:aws:s3:::mychart-connector`)
  - `mychart-logos/` — logos for all MyChart instances, uploaded by `scrapers/list-all-mycharts/fetch-mychart-instances.ts`
- **openrecord-fanpierlabs-com** (`arn:aws:s3:::openrecord-fanpierlabs-com`)
  - Static splash page (`index.html`), interactive demo (`demo.html` + `demo/`) for `openrecord.fanpierlabs.com`. Private; served only via CloudFront `EXUZ8GHUQ9ULF` (OAC). Source in `openrecord-splash/`.

## Secrets (AWS Secrets Manager, us-east-2)

- **RESEND_API_KEY**: `arn:aws:secretsmanager:us-east-2:555985150976:secret:RESEND_API_KEY-vKJonO`
  - Used by CLI for autonomous 2FA code retrieval via Resend inbound emails
  - Inbound email address: `healthapp@bocuedpo.resend.app`
- **GEMINI_API_KEY**: `arn:aws:secretsmanager:us-east-2:555985150976:secret:GEMINI_API_KEY-GPbdf6`
  - Google Gemini API key used by the public demo's `openrecord-demo-ai` Lambda, which copies it into a function env var at deploy time.
- **EXPO_TOKEN**: `arn:aws:secretsmanager:us-east-2:555985150976:secret:EXPO_TOKEN-XYwf9T`
  - Expo access token for EAS CLI builds and TestFlight submissions. Used with `EXPO_TOKEN` env var.
- **APPLE_CREDENTIALS**: `arn:aws:secretsmanager:us-east-2:555985150976:secret:APPLE_CREDENTIALS-GZhHoo`
  - Apple Developer credentials (appleId, appleTeamId) for iOS builds and App Store submissions.
- **APPLE_APP_SPECIFIC_PASSWORD** (ryanhughes624): `arn:aws:secretsmanager:us-east-2:066949051862:secret:APPLE_APP_SPECIFIC_PASSWORD-fZNTNC`
  - Apple app-specific password for App Store Connect / TestFlight CLI uploads (ryan@fanpierlabs.com).

## Memory

You maintain persistent memory in markdown files at `claude-memory/` in the repo root. This replaces the built-in auto-memory feature (which is disabled for this project).

### How it works
- **`claude-memory/MEMORY.md`** is your main memory file — read it at the start of every conversation to build on prior context.
- Create separate topic files (e.g., `claude-memory/debugging.md`, `claude-memory/patterns.md`) for detailed notes and reference them from MEMORY.md.
- Use Edit/Write tools to update memory files as you learn new things.

### When to save
- Stable patterns and conventions confirmed across multiple interactions
- Key architectural decisions, important file paths, and project structure changes
- User preferences for workflow, tools, and communication style
- Solutions to recurring problems and debugging insights
- When the user explicitly asks you to remember something

### When NOT to save
- **NEVER save PII** (personally identifiable information) — no names, emails, phone numbers, addresses, dates of birth, medical record numbers, patient IDs, health data, or credentials
- Session-specific context (current task details, in-progress work, temporary state)
- Information that might be incomplete — verify before writing
- Anything that duplicates existing CLAUDE.md content
- Speculative or unverified conclusions from reading a single file

### Rules
- Always check existing memory files before writing to avoid duplicates
- Update or remove memories that turn out to be wrong or outdated
- Keep MEMORY.md concise — use separate files for detailed notes
- Organize by topic, not chronologically

## iOS Simulator Debugging & UI Automation

Use **`maestro-cli`** (already installed at `~/.local/bin/maestro-cli`) for every interaction with the iOS simulator. It's a one-shot wrapper around Maestro (mobile.dev) designed for agent loops — each invocation does one action and writes a screenshot to `/tmp/maestro-last.png` so the next step can read it.

**Hard rules (no exceptions):**
- **NEVER take over the user's mouse.** Do not use `cliclick`, `osascript ... click at`, AppleScript mouse events, AppKit/CGEvent, or any other tool that moves the cursor or steals focus. The user may be using their computer.
- **NEVER click on the simulator by computing pixel coordinates against the simulator window position.** It's brittle, focus-races with whatever the user is doing, and breaks on every window move or sim resize. Use `maestro-cli` instead — it talks to the simulator through iOS's native automation hooks, not the macOS cursor.
- **Do not install a separate Maestro.** The brew `maestro` cask is a different product (runmaestro.ai). The mobile.dev Maestro CLI is what `maestro-cli` wraps and it's already on PATH.

### Starting a sim session (do this exactly once per Claude session)

Every Claude session that touches the simulator must own a fresh, dedicated sim — never share one with another running Claude. The recipe:

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

Notes:
- The UDID is CoreSimulator-assigned, not Claude-generated. Capture it from `simctl create`'s stdout.
- Naming pattern `claude-<date>-<random>` makes orphaned sims easy to spot and bulk-delete: `xcrun simctl delete $(xcrun simctl list devices | grep -E 'claude-[0-9]{8}-' | grep -oE '[A-F0-9-]{36}')`.
- Use a port other than 8081 if other Claude instances are running their own Metro on the default port. Pick deterministically (8082, 8083, …) and pass `--port` to `expo run:ios`.
- At end of session: `xcrun simctl shutdown "$MAESTRO_UDID" && xcrun simctl delete "$MAESTRO_UDID"`. Leave it running only if the user explicitly wants to keep it.

**Common commands** (full reference: `maestro-cli --help`):

```
maestro-cli tap "Get Started"         # tap by visible text or regex
maestro-cli tap-id run-skill-button   # tap by testID — preferred when set
maestro-cli type "homer"              # type into focused field
maestro-cli fill "Username" "homer"   # tap a field by label, then type
maestro-cli press Enter               # hardware/keyboard key
maestro-cli scroll down               # screen scroll
maestro-cli wait "Run a skill"        # block until text appears
maestro-cli assert-visible "Insights" # fail if missing
maestro-cli screenshot [path]         # /tmp/maestro-last.png by default
maestro-cli hierarchy                 # dump a11y tree (great for finding testIDs)
maestro-cli launch / stop             # relaunch / terminate app
maestro-cli reset-keychain            # wipe sim keychain (forgets logins/setup_complete)
```

Env vars:
- `MAESTRO_APP_ID` — bundle id (default `com.fanpierlabs.openrecord`).
- `MAESTRO_UDID` — **REQUIRED.** iOS simulator UDID. `maestro-cli` will exit non-zero immediately if this is unset. There's no fallback, on purpose — multiple Claude sessions run in parallel and a default would let one agent silently drive another agent's sim.

Find UDIDs with `xcrun simctl list devices booted`. Then either:

```
export MAESTRO_UDID=4C4A3949-7F06-4335-BFE4-DBBB8B183DFD  # session-wide
maestro-cli tap "Get Started"
```

or pass per-command:

```
MAESTRO_UDID=4C4A3949-… maestro-cli tap "Get Started"
```

**Every interactive element in the Expo app MUST have a testID so `maestro-cli tap-id` works deterministically.**

- React Native: set `testID` AND `accessibilityLabel` on every `Pressable`, `Button`, `TextInput`, `Switch`, and tappable `View`. `testID` is the primary handle for Maestro; `accessibilityLabel` is what VoiceOver reads (also a fallback for `maestro-cli tap` by text).
- Use a stable, kebab- or snake-case `testID` that describes what the element does, not where it sits. Examples: `get-started-button`, `onboarding-continue`, `skill-bill_itemization`, `chat-input`, `send-message`.
- For lists of items (chats, insights, skills), include the row id in the `testID` (e.g. `chat-row-${chatId}`) so flows can target a specific row.
- When you add a new screen or button as part of a feature, add the `testID` in the same diff. PRs that introduce new untargetable UI should be rejected at review.

## Rules

- **NEVER modify or delete anything from the macOS Keychain or the browser keychain.** Read-only access is OK.
- **NEVER make changes in AWS without explicit user direction.** No `aws ... create-*`, `delete-*`, `update-*`, `put-*`, ECS service updates, ALB/target-group/listener changes, IAM edits, Secrets Manager writes, RDS modifications, S3 deletes, CloudFront invalidations, etc. Read-only AWS calls (`describe-*`, `list-*`, `get-*`, `sts get-caller-identity`) are fine. Running the official deploy script (`cd fake-mychart && bun run deploy`) is also fine when the user has asked you to deploy. If a deploy script fails partway and leaves orphan/inconsistent AWS resources, **stop and ask** before cleaning them up.
- **NEVER use `git stash`.** If you're considering stashing changes, stop and ask the user first.
- **NEVER upload PII to git or GitHub.** Before committing, review all staged changes to ensure no personally identifiable information (names, emails, phone numbers, addresses, dates of birth, medical record numbers, patient IDs, health data, credentials, API keys, or any other sensitive data) is included. If PII is found in code, test fixtures, logs, or output files, remove or redact it before committing. **Body parts, diagnoses, procedures, dates of medical events, and medical details extracted from real patient data also count as PII** — do not include specific body parts (e.g., "shoulder"), procedure names (e.g., "arthrogram"), series descriptions from real imaging studies, or when specific scans/procedures were performed (e.g., "MRI was done on 1/1") in commit messages, PR descriptions, documentation examples, or code comments. Use generic examples instead.
- **NEVER use `dangerouslySetInnerHTML`.** All HTML from external sources (MyChart API responses, scraped content) must be sanitized (e.g. with DOMPurify) before rendering, or parsed into a typed tree and rendered as React elements so every text node is escaped. This is a health data app — XSS is unacceptable.
- **Always update this CLAUDE.md when adding new features** — document new CLI flags, scrapers, configuration, or architectural changes so this file stays current.

## Workflow

- Always create a PR for new features — never push directly to `main`
- CI must pass (lint, tests, build) before merging
- **NEVER merge pull requests or enable auto merge without the user's explicit permission.** Wait for the user to explicitly tell you to do so.
- **Always write tests for all changes.** Unit tests for scraper/utility logic; fake-mychart-backed tests (`scrapers/myChart/__tests__/fake-mychart/` or `tests/integration/ci/`) for end-to-end flows. No PR should be submitted without corresponding test coverage.
- **Scraper tests live in `scrapers/myChart/__tests__/` only** — put tests next to the implementation in `scrapers/`, not in a client package that re-exports it.
- **Never assert against logic pasted into the test file.** Import the real function. If a module isn't importable (e.g. it runs a script at load time), guard the script with `if (import.meta.main)` and export the function instead.

### Creating / Updating PRs

- `gh pr edit` fails due to a GitHub Projects Classic deprecation error. Use the GitHub API directly instead:
  ```bash
  gh api repos/Fan-Pier-Labs/ryans-health-app/pulls/<PR_NUMBER> -X PATCH \
    -f title="PR title" \
    -f body="PR body"
  ```
- To create a PR, use `gh pr create` as normal. If a PR already exists for the branch, update it with the API method above.

### Maestro UI automation (one-step pattern)

When driving the iOS simulator (or any device) with Maestro, **do NOT write multi-step YAML files** that try to script the entire flow up front. Each rerun replays every prior step from the beginning, which is slow, error-prone, and bad at recovering when the UI is in an unexpected state.

**Use `maestro-cli` (one-shot wrapper).** A small bash wrapper at `~/.local/bin/maestro-cli` does one Maestro action per call, so each step is a single shell command — no YAML file to write or read. After every action it auto-saves a screenshot to `/tmp/maestro-last.png` so the next prompt can read the result with the `Read` tool.

```bash
maestro-cli tap "Get Started"                       # tap by visible text / accessibilityLabel
maestro-cli tap-id "google-continue"                # tap by accessibilityIdentifier (RN testID), regex
maestro-cli tap-id ".*Springfield.*"                # regex match on testID
maestro-cli tap-xy 200 480                          # tap at pixel coordinates
maestro-cli fill "Username" "homer"                 # tap a field then type
maestro-cli type "homer"                            # type into focused field
maestro-cli hide-keyboard                           # dismiss soft keyboard
maestro-cli press Enter                             # press a hardware/keyboard key
maestro-cli back                                    # system back / swipe-back
maestro-cli swipe-up   |  maestro-cli swipe-down    # gestures
maestro-cli wait "Welcome"                          # extendedWaitUntil (default 10s)
maestro-cli assert-visible "Find your provider"
maestro-cli launch  |  maestro-cli stop             # relaunch / kill the app
maestro-cli screenshot [/path/out.png]              # explicit screenshot
maestro-cli hierarchy                               # dump accessibility tree (find testIDs)
maestro-cli reset-keychain                          # wipe sim keychain (forgets all logins)
```

After each command the screenshot lives at `/tmp/maestro-last.png`. Read it with the `Read` tool to evaluate the new state, then decide the next action.

Env knobs: `MAESTRO_APP_ID` (default `com.fanpierlabs.openrecord`), `MAESTRO_UDID` (default the dev sim), `MAESTRO_QUIET=1` (silence Maestro output), `MAESTRO_NO_SCREENSHOT=1` (skip auto-screenshot), `MAESTRO_SCREENSHOT=/path` (override path).

**Add `testID` props to interactive elements.** All `Pressable`, `Button`, and `TextInput` components in onboarding/settings/chat should carry a stable `testID` so Maestro can target them by ID even when the visible text changes. Use kebab-case names (`google-continue`, `mychart-signin`, `picker-item-${name}`). Maestro's `tap-id` selector is a regex over `accessibilityIdentifier` (which is what RN's `testID` maps to on iOS), so values containing regex metacharacters (parens, brackets) need either escaping or a wildcard match (`.*Springfield.*`).

The simulator UDID for this machine is currently `3276F6D9-0713-48EC-91A0-E34FBB27F0C8` (iOS 26.4).
