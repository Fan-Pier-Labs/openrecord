# Testing

## Lint

`bun run lint` is **type-aware** (typescript-eslint `projectService`): each file is resolved against
its package's tsconfig, so every package's deps must be installed first (`expo-app`, `npm-package`,
`claude-desktop-extension`). A missing `node_modules` degrades imports to `any` and the type-aware
rules silently stop seeing them — lint passes while checking less.

Files no tsconfig includes (build configs, `dev-scripts/`, excluded test dirs) are listed in
`allowDefaultProject` in `eslint.config.mjs`; a new stray file fails lint with a "not found by the
project service" error until it's added there or to a tsconfig.

`@typescript-eslint/await-thenable` is off in test files only: bun-types declares the
`.rejects`/`.resolves` matchers as `void`, but awaiting them is load-bearing at runtime.

## Test suites

**A test file's *filename* decides which suite it belongs to, not its folder.** Every test file in
the repo ends in one of three suffixes, and every `test*` script in every `package.json` selects on
that suffix and nothing else — no script names a test directory, let alone an individual file.

| Suffix | Needs | Runs in CI |
| --- | --- | --- |
| `*.unit.test.ts` | nothing — no network, no server, no credentials | yes, `bun run test` |
| `*.integration.test.ts` | the fake-mychart server from `docker-compose.ci.yaml` | yes, `bun run test:integration` |
| `*.real-mychart.test.ts` | credentials for a **real** MyChart account | **never** — `bun run test:real-mychart`, by hand |

This replaced a root `test` script that was a hand-maintained list of thirteen per-directory globs
plus two individually-named files, which is how the CLO parser's two healthy tests ended up spelled
out one by one next to a broken neighbour.

There is deliberately **no `test:fake-mychart` and no `test:ci-integration`**. Those existed because
the scraper suites and the Docker suites needed different servers: the compose service ran with
`FAKE_MYCHART_ACCEPT_ANY=true`, which the suites asserting that a *bad* password is rejected would
have failed against. Nothing ever needed the knob — every suite signs in as the seeded `homer` — so
it is gone, one compose service serves every integration suite, and the two CI jobs are one.

Two things follow from selecting by suffix, and both are load-bearing:

- **The real-MyChart suite is out of CI by construction.** No workflow globs `.real-mychart` —
  `tests/suite-naming.unit.test.ts` reads the workflow files and fails if one ever does — so a new
  real-account test cannot be swept into a CI run by someone adding a directory to a list. Each
  package also keeps its own suffix-filtered `test` script for running that package alone; CI itself
  uses only the three root commands.
- **A test file that forgets its suffix never runs**, and a suite that never runs is
  indistinguishable from one that passes. `tests/suite-naming.unit.test.ts` walks the repo and fails
  the build on any unsuffixed `*.test.ts`.

There are **no exceptions and no allowlist** — every test file carries a kind. A suite that
genuinely cannot run belongs behind `it.skip`, where the reporter still counts it, never behind a
filename that makes it invisible.

**Bun runs test files in directory-entry order, not alphabetically.** That order changes whenever a
file in the directory is added or renamed, so a suite that depends on a neighbour having run first
breaks for reasons that look nothing like the cause. Everything sharing the fake-mychart server must
therefore reset it in its own `beforeAll` — see `resetFakeMyChart` in
`scrapers/myChart/__tests__/fake-mychart/mountMode.ts`. Every integration suite in the repo shares
one server, `tests/integration/ci/` included. Resetting only on the way *out* is not enough: it
still leaves the first suite of a run trusting the previous `bun test` invocation.

## CI integration tests

Integration tests in `tests/integration/ci/` run against the dockerized fake-mychart from
`docker-compose.ci.yaml` (served on `localhost:4000`):

- `cli-passkey.integration.test.ts` — spawns the built CLI (`npm-package/dist/cli.cjs`) to exercise
  passkey setup, passkey auto-login, and passkey removal end to end. Build the CLI first
  (`cd npm-package && bun run build`).
- `fake-mychart-passkey-ui.integration.test.ts` — Playwright-driven browser test of the fake-mychart
  passkey UI using Chromium's WebAuthn virtual authenticator (a CDP feature plain `fetch` can't
  replicate).

The `integration` CI job runs the whole suffix at once, so this directory, the scraper suites, the
desktop extension's imaging download and npm-package's built-bundle test all share one server. That
includes `scrapers/myChart/__tests__/fake-mychart/credential-setup.integration.test.ts`, which
drives `setupTotp`/`disableTotp` and `setupPasskey`/`listPasskeys`/`deletePasskey` **directly**
rather than through the CLI, so a scraper break reports as a scraper failure instead of a CLI-output
assertion. It is the layer below `tests/integration/ci/cli-passkey.integration.test.ts`, which
covers the same ground through the built binary.

**Credential-setup test coverage.** `setupTotp.ts` and `setupPasskey.ts` are covered at three
levels, because no single one reaches everything:
`scrapers/myChart/__tests__/setupTotp.unit.test.ts` and `setupPasskey.unit.test.ts` are unit tests
over a mocked transport (`__tests__/mockMyChartRequest.ts` swaps `transport`, so real URL building,
default headers and the host limiter still run) and are the **only** place the per-instance response
variants are exercised — the four CSRF-token formats plus the empty-body `/Home` fallback, the eight
names instances use for the TOTP secret field, Pascal- vs camel-cased passkey envelopes, and every
error branch. They also assert the secret and password never reach the log sink. fake-mychart serves
exactly one shape of each, so those branches are unreachable from an integration test.

**Protocol detection**: hostnames without a dot (e.g. Docker service names like
`fake-mychart:3000`) automatically use HTTP instead of HTTPS.

## Expo app tests (unit + E2E)

The mobile app (`expo-app/`) has three layers of tests:

**Unit tests** (`expo-app/src/lib/**/__tests__/*.unit.test.ts`) — picked up by the root
`bun run test` like every other unit suite. Native modules (`expo-secure-store`, `expo-sqlite`,
`react-native`, `expo-constants`) are mocked with `mock.module()` + dynamic `await import(...)`
(static imports hoist above the mocks). `database.unit.test.ts` backs the expo-sqlite API with
`bun:sqlite` so the real SQL runs against a real engine. The `@/` path alias works in bun via
`expo-app/tsconfig.json`'s `paths` (no `baseUrl` — TS6 dropped it; paths resolve relative to the
tsconfig).

**Maestro E2E** (`expo-app/e2e/flows/*.yaml`) — drives the real app on an iOS simulator or Android
emulator against a local fake-mychart (`localhost:4000`) and a deterministic mock AI backend
(`expo-app/e2e/mock-ai-server.ts`, port 4600). Run locally with `expo-app/e2e/run.sh ios` (or
`android`; add `--skip-build` to reuse a build). Flows cover: onboarding (homer, no 2FA), chat
through the full tool loop (scripted model → on-device scraper → reply), history/drawer/search,
settings, alerts (refill alert + ignore), and a second onboarding with marge (TOTP `123456`) + real
passkey registration. The iOS/Android jobs live in `.github/workflows/mobile-e2e.yml` and are
**manual-trigger only** (workflow_dispatch) — they need full native builds (~30-45 min). Known
issue: Release simulator builds currently launch to a blank screen (React renders no views despite
JS executing) — use `expo run:ios` (Debug + Metro) or the web export until that's root-caused.

**Web E2E (Playwright)** (`expo-app/e2e/web/`) — the app exported to web (`bun run export` in
`e2e/web`, wraps `expo export --platform web`) and tested in Chromium; runs on every PR
(`expo-web-e2e` in `checks.yml` — fast, no native build). Browser scraping of fake-mychart works
because (a) `FAKE_MYCHART_CORS=true` enables a CORS proxy in the fake (off by default — real
MyChart sends no CORS headers), and (b) `scrapers/http.ts`'s default transport opts into
`credentials: "include"` when it detects a real web browser (a cross-origin fetch silently drops
cookies without it). Metro maps native modules to `src/lib/shims/*.web.ts` (localStorage-backed
storage, no-op biometrics) for the web platform. Run with
`cd expo-app/e2e/web && bun install && bunx playwright test` (Playwright's `webServer` brings up
the static server, mock AI, and fake-mychart). The harness (mock server, static server, specs)
typechecks against its own `expo-app/e2e/tsconfig.json` — it runs under bun/Playwright, not React
Native, so the app's typecheck excludes `e2e/` and the `expo-web-e2e` CI job runs
`bun run typecheck` in `e2e/web` instead.

**E2E build flag**: `EXPO_PUBLIC_E2E=1` (inlined at bundle time) unlocks the Google-skip button
outside dev builds, writes a fake backend session on skip so the free-tier AI path hits the mock
server (the seeded token is a decodable far-future JWT — `getFreshIdToken` treats anything else as
expired and tries a silent Google re-sign-in, which cannot succeed in a test build), and adds
local-HTTP transport exceptions (iOS ATS / Android cleartext) via `app.config.ts`. Production
builds never set it. `EXPO_PUBLIC_BACKEND_URL` points the app at the mock AI server.

## Code coverage gate

`bun run test:coverage` runs **every `*.unit.test.ts` and `*.integration.test.ts`** with coverage,
enforced by **Bun's built-in `coverageThreshold`: every measured file must clear 75% lines and 75%
functions on its own.**

It is `bun run test` and `bun run test:integration` in one process, with no exclusions — the gate is
a *mode* over the two CI kinds, not a fourth suite. It cannot be folded into either script:
measuring the unit suite alone counts every scraper that is only covered end-to-end as untested, and
measuring the integration suite alone does the reverse. Coverage has to see both at once.

**It needs everything the integration suite needs** — the compose service, npm-package's `dist/`
built, and every package's deps installed — so the CI step lives in the `integration` job, the only
one with all of that. Locally: `docker compose -f docker-compose.ci.yaml up -d --build --wait`, then
`cd npm-package && bun install && bun run build`.

Three things to know before touching it:

- **The threshold is per file, not an aggregate.** No file can hide behind a healthy average — but a
  file nobody has tested must be covered or waived in `coveragePathIgnorePatterns`, because there is
  no overall number for it to be absorbed into.
- **The keys must be plural** — `lines`, `functions`, `statements`. Bun's own docs show
  `line`/`function`; those spellings are parsed and then **silently ignored**, leaving the gate
  reading as configured while enforcing nothing. `bun test -c <file>` is ignored the same way, which
  is why the settings live in the repo-root `bunfig.toml`. They only activate under `--coverage`, so
  `bun run test` and `bun run test:integration` are unaffected.
- **Only files a test imports are measured.** A module nothing imports is *absent* from the report
  rather than counted as 0%, so it slips the gate by never being looked at. In practice the
  fake-mychart suite reaches nearly all of `scrapers/`, but a genuinely orphaned new module would
  need a test (or an import from one) before the gate sees it.

`bunfig.toml` carries two kinds of exclusion, and the difference matters. Non-product code
(fixtures, `fake-mychart/`, dev diagnostics, test helpers, `dev-scripts/`, `dist/` build output) is
out permanently. Everything under **"Below the bar, waived for now"** is real product code that
isn't tested yet — a waived file is *wholly unchecked*, so shortening that list is how this gate
gets stronger.

**Put run-it-yourself demos in `dev-scripts/`, never in an `if (import.meta.main)` block inside a
product module.** Such a block is unreachable from a test, so under a per-file gate a few lines of
demo code drag an otherwise fully-covered module under the bar, and the only outs are waiving the
whole file or leaving CI red. `dev-scripts/` holds no test files, and coverage ignores it outright.

**Install the Claude Desktop extension's dependencies before measuring**
(`cd claude-desktop-extension && bun install`), as CI does. Without them the extension's modules fail
to import, drop out of the report entirely, and the number reads about 1.5 points higher than it
really is.

**Testing anything that touches `~/.openrecord-mcpb`**: use the in-memory `fs` shim at
`claude-desktop-extension/src/__tests__/memfs.ts` — import it before the store and the tests touch no
disk at all. It intercepts only paths under the store root and delegates everything else to the real
`fs`, because `bun test` runs the package's files in one process and the imaging suites read real
fixtures. Do **not** reach for `$HOME`: Bun's `os.homedir()` does not follow it, so redirecting the
env var silently leaves you pointed at the developer's real credentials.

### Known coverage gaps

Not blockers, but where to spend the next test-writing effort: `eunity/imagingDirectDownload.ts` and
`eunity/imagingViewer.ts` (need a live eUnity server), `setupTotp.ts` / `setupPasskey.ts`
(interactive flows), `login.ts`, and the scraper-tool handler bodies in
`claude-desktop-extension/src/tools.ts` (each needs its scraper mocked; only the shared error path is
covered today). All three files in `clo-image-parser/` now run.
