# Testing

## Lint

`bun run lint` is **type-aware** (typescript-eslint `projectService`): each file is resolved against
its package's tsconfig, so every package's deps must be installed first (`expo-app`, `npm-package`,
`claude-desktop-extension`). A missing `node_modules` degrades imports to `any` and the type-aware
rules silently stop seeing them — lint passes while checking less.

**Every TS file in the repo belongs to a tsconfig project — there is deliberately no
`allowDefaultProject` escape hatch.** A new file outside every tsconfig fails lint with a "not
found by the project service" error; the fix is to put it in a project (root tsconfig's `include`
or a package tsconfig), never to exempt it — an exempted file resolves without its package's
`paths` and silently loses type-aware linting. The same projects back `bun run typecheck`, so
nothing is excluded from typechecking either: expo-app checks its `__tests__`, npm-package checks
`examples/` and `tsup.config.ts` (build `dist/` first — examples import the published package
name), and the lambdas' tests, `dev-scripts/` and all of `tests/` (playwright suites included) ride the
root tsconfig.

One caveat the compiler can't express: the expo test files carry `/// <reference types="bun" />`
so `bun:test` resolves, and a triple-slash reference is program-wide — it puts `Bun` in scope for
app code too, where Hermes has no Bun. Don't reach for Bun APIs in `expo-app/src` outside
`__tests__`.

`@typescript-eslint/await-thenable` is off in test files only: bun-types declares the
`.rejects`/`.resolves` matchers as `void`, but awaiting them is load-bearing at runtime.

`import-x/no-cycle` guards `scrapers/` + `shared/` — #263 made the session-renewal graph
acyclic and the rule keeps it that way. Its two settings are both load-bearing: the TS resolver
so `./foo` finds `foo.ts`, and the parsers map so the rule can parse imported TS files (without
it, no-cycle silently reports nothing).

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
  replicate). `playwright` rides the root install, but the Chromium binary is a separate download
  (`bunx playwright install chromium`); without it the suite **skips with that command in the
  message** rather than failing to launch. `$CI` overrides the skip, so a browser-install break in
  the workflow fails loudly instead of quietly covering nothing.

The `integration` CI job runs the whole suffix at once, so this directory, the scraper suites, the
desktop extension's imaging download and npm-package's built-bundle test all share one server. That
includes `scrapers/myChart/__tests__/fake-mychart/credential-setup.integration.test.ts`, which
drives `setupTotp`/`disableTotp` and `setupPasskey`/`listPasskeys`/`deletePasskey` **directly**
rather than through the CLI, so a scraper break reports as a scraper failure instead of a CLI-output
assertion. It is the layer below `tests/integration/ci/cli-passkey.integration.test.ts`, which
covers the same ground through the built binary.

**Credential-setup test coverage.** `setupTotp.ts` and `setupPasskey.ts` are covered at three
levels, because no single one reaches everything:
`scrapers/myChart/auth/__tests__/setupTotp.unit.test.ts` and `setupPasskey.unit.test.ts` are unit tests
over a mocked transport (`__tests__/mockMyChartRequest.ts` swaps `transport`, so real URL building,
default headers and the host limiter still run) and are the **only** place the per-instance response
variants are exercised — the eight names instances use for the TOTP secret field, Pascal- vs
camel-cased passkey envelopes, and every error branch. They also assert the secret and password
never reach the log sink. fake-mychart serves exactly one shape of each, so those branches are
unreachable from an integration test.

The `/Home/CSRFToken` variants moved out to `scrapers/myChart/core/__tests__/csrf.unit.test.ts` when
the three copies of that parsing were merged into `core/csrf.ts` — the four JSON key spellings, the
bare-string body, the HTML hidden input, the empty-body `/Home` fallback, and the Terms & Conditions
bounce that must *not* fall back. Same reasoning: fake-mychart serves one shape, so this suite is the
only place the matrix runs.

**Protocol detection**: hostnames without a dot (e.g. Docker service names like
`fake-mychart:3000`) automatically use HTTP instead of HTTPS.

## Android smoke tests

`.github/workflows/android-smoke.yml` — its own workflow, not a job in `checks.yml`, so it can carry
a paths filter (`expo-app/**` plus the workflow itself). Two tiers, split by cost:

- **`bundle` (~2-4 min), on every matching PR and push**: `expo prebuild --platform android`
  (validates the config-plugin pipeline) then `expo export --platform android` — Metro compiles the
  exact JS bundle gradle would embed, down to Hermes bytecode. Catches Node-only imports, bad
  platform resolution, bundling errors, and Hermes-incompatible code: the breakage classes a PR
  actually introduces. This is the fast gate; it must stay under ~5 minutes.
- **`emulator` (~15-40 min), weekly cron + `workflow_dispatch` only — never on PRs**: full
  `gradlew assembleRelease`, boot a headless API 34 emulator (KVM-accelerated, AVD snapshot
  cached), install the APK, run the Maestro flow `expo-app/e2e/android-smoke.yaml`: cold boot →
  onboarding welcome screen renders → tap Get Started → the Google sign-in step appears. The only
  tier that proves native modules (quick-crypto, nitro-modules, reanimated, screens, secure-store,
  sqlite) actually initialize and expo-router navigates on device.

**No AI/LLM call can happen in either tier, by construction at three layers:** the Maestro flow
stops at the Google sign-in gate and never opens a chat; the release build strips the `__DEV__`-only
skip button, so nothing past that gate is even reachable; and the workflow bakes
`EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:9` into the build, so it physically cannot reach the real
AI Lambda. Keep all three when extending the flow — a deeper Android E2E that signs in or chats
belongs in a new flow with its own guarantees, not in this one.

The emulator tier builds the release variant deliberately: it embeds the JS bundle so the emulator
needs no Metro dev server. Maestro targets elements by `testID` (`welcome-get-started`,
`google-continue`), which is why the testID rule matters on Android too.

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

Not blockers, but where to spend the next test-writing effort: `eunity/download.ts` and
`eunity/imagingViewer.ts` (need a live eUnity server), `setupTotp.ts` / `setupPasskey.ts`
(interactive flows), `login.ts`, and the scraper-tool handler bodies in
`claude-desktop-extension/src/tools.ts` (each needs its scraper mocked; only the shared error path is
covered today). All three files in `clo-image-parser/` now run.

`npm-package/cli/capabilityActions.ts` came off the waiver list at 82% lines / 96% functions, once
`--action` dispatch grew tests that drive it without `cli.ts` in front.

**Check what a waived file actually still calls before writing tests for it.**
`clo-image-parser/generate_clo.ts` came *off* the waiver list in #245 without a single new assertion,
because it was never under-tested — its only uncoverable part was an `import.meta.main` demo block,
which is unreachable from a test by construction (96% lines without it). Some of what remains on that
list is likely partly dead too, not hard to test: most of `eunity/download.ts`'s gap is a
superseded copy of the download loop that no caller reaches, and removing it would take the file to
93%/93%. That one is parked until the live path can be verified against a real eUnity instance — the
account it was tried on turned out not to use eUnity at all.
