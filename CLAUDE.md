# CLAUDE.md

Health data platform that connects to Epic MyChart portals to scrape and consolidate a patient's
medical records (30+ data categories). Four clients on one shared scraper core: a Claude Desktop
extension (`.mcpb`), an Expo/React Native iOS app, a headless CLI published as the `mychart-cli` npm
package, and that package's importable library.

Proprietary source-available license (see `LICENSE`) — personal/educational use only; no commercial
use, redistribution, or SaaS offerings without written permission from Fan Pier Labs.

**This file is an index of invariants, not a changelog.** It loads on every session, so keep it
short and put detail in `docs/`. See [Keeping this file small](#keeping-this-file-small).

## Repo map

| Path | What it is |
| --- | --- |
| `scrapers/` | Shared MyChart + eUnity scraper core — every client calls into this |
| `shared/` | Capability registry, common types, host concurrency limiter, small codecs |
| `npm-package/` | The `mychart-cli` CLI and importable library |
| `claude-desktop-extension/` | `.mcpb` MCP server for Claude Desktop |
| `expo-app/` | Expo/React Native iOS app (scrapers run on-device, plus an agent loop) |
| `fake-mychart/` | Next.js stand-in for real MyChart — dev + all integration tests |
| `openrecord-splash/` | Static splash site + the browser demo |
| `openrecord-demo-lambda/` | AI proxy behind the demo and the app's free tier |
| `newsletter-lambda/` | Waitlist signup capture |
| `read-local-passwords/` | Browser password store extraction (Chrome, Arc, Firefox) — used by the CLI |
| `dev-scripts/` | Run-it-yourself diagnostics (never `import.meta.main` blocks in product code) |

## Invariants

Break one of these and it fails silently, in production, on someone's medical record. Rationale and
detail for every line here is in [`docs/architecture.md`](docs/architecture.md).

- **Every post-login call goes through `makeAuthenticatedRequest`**, never raw `request.makeRequest`.
  It is what detects an expired session, silently re-logs-in, restores the active proxy patient, and
  retries once. Raw `makeRequest` is only for the pre-login world (discovery, DoLogin, 2FA, terms,
  keepalive).
- **Every outbound request leaves through `scraperFetch` (`scrapers/http.ts`)** — it owns the browser
  headers, the cookie jar, and the per-host permit. A second fetch path silently loses all three;
  `http.unit.test.ts` fails the build if one appears. **There is no injectable `fetchFn`** — the
  platform picks the transport. Tests use `setTestTransport` / `req.transport`.
- **At most 10 in-flight requests per MyChart host, process-wide** (`shared/hostConcurrency.ts`).
  The permit wraps the individual fetch only, never the redirect recursion.
- **`shared/capabilities.ts` is the single source of truth for what the product can do.** Every
  client derives its surface from it; none hand-maintains a list. Add an entry there and it ships
  everywhere. `capability-parity.unit.test.ts` fails if a client stops covering one.
- **Never read a chart without asserting whose it is.** MyChart's active patient is server-side
  session state, so every chart-touching capability asserts the patient before running and refuses
  with the fix rather than returning the wrong family member's record.
- **fake-mychart must behave EXACTLY like real MyChart** — response shapes, field casing, pagination
  sizes, status codes, server-side enforcement. It is a faithful stand-in, not a convenience mock.
  Never simplify a contract to make a test easier; size the fixture around the real behavior.
  Response shapes are held to skeletons generated from live captures (`realShapes.ts` +
  `conformToShape`), every `/api/*` POST requires a CSRF token, and a `/mode` knob switches the
  instance between the two captured Epic releases (November 2025 / August 2025). See `fake-mychart/README.md`.

## Key commands

| Command | What it does |
| --- | --- |
| `bun run lint` | ESLint — **type-aware**, so every package's deps must be installed first or the rules silently stop seeing typed imports. See [`docs/testing.md`](docs/testing.md#lint) |
| `bun run typecheck` | Typecheck the shared core (strict). CI also runs `expo-app` and `npm-package` (the latter needs `bun run build` first) |
| `bun run test` | Every `*.unit.test.ts`. **Needs `cd claude-desktop-extension && bun install` first** — the parity test imports the extension's real tools |
| `bun run test:integration` | Every `*.integration.test.ts` (needs the compose service + built CLI) |
| `bun run test:coverage` | Unit + integration with the 75%-per-file gate — see [`docs/testing.md`](docs/testing.md) |
| `bun run test:real-mychart` | Every `*.real-mychart.test.ts`, against a real account. Never in CI, by hand only |
| `bun run cli mychart [flags]` | Run the CLI scraper |
| `bun run cli --list-capabilities` | Every capability and the arguments it takes |
| `bun run cli --host <host> --action <id> [--arg name=value ...]` | Run any capability and print JSON |
| `bun run fake-mychart` | Fake MyChart dev server on a **random port in 4000-5000**, printed at startup, so parallel worktrees don't collide. `PORT=4000` pins it — needed by anything defaulting to `localhost:4000`. Sign in as `homer`/`donuts123` (`marge` for 2FA) |
| `cd claude-desktop-extension && bun run pack` | Build `openrecord.mcpb` |
| `cd npm-package && bun run build` | Build the CLI binary at `npm-package/dist/cli.cjs` |
| `docker compose -f docker-compose.ci.yaml up -d --build --wait` | Start the CI fake-mychart (port 4000); `down -v` to stop |
| `bun scrapers/list-all-mycharts/probe-mount-discovery.ts` | Mount discovery against all ~750 directory hosts. Run after touching discovery; sends no credentials |

All five packages are on TypeScript 6 — `moduleResolution: "Node"`, `baseUrl`, and paths without a
leading `./` no longer parse, so don't reintroduce them.

## Tests

**A test file's *filename* decides which suite it runs in, not its folder.** Every `test*` script
selects on the suffix and nothing else.

| Suffix | Needs | Runs in CI |
| --- | --- | --- |
| `*.unit.test.ts` | nothing — no network, no server, no credentials | yes |
| `*.integration.test.ts` | the fake-mychart server from `docker-compose.ci.yaml` | yes |
| `*.real-mychart.test.ts` | credentials for a **real** MyChart account | **never** |

- **A file that forgets its suffix never runs**, which looks exactly like passing.
  `tests/suite-naming.unit.test.ts` fails the build on any unsuffixed `*.test.ts`. No allowlist —
  a suite that can't run belongs behind `it.skip`.
- **Every integration suite shares one server and must reset it in its own `beforeAll`**
  (`resetFakeMyChart`), because Bun runs files in directory-entry order, not alphabetically.
- **Scraper tests live under `scrapers/myChart/__tests__/` only** — next to the implementation, not
  in a client package that re-exports it.
- **Never assert against logic pasted into the test file.** Import the real function; if a module
  isn't importable because it runs at load time, guard it with `if (import.meta.main)` and export.

Details — the coverage gate, CI integration setup, known gaps: [`docs/testing.md`](docs/testing.md).

## Rules

- **NEVER modify or delete anything from the macOS Keychain or a browser keychain.** Read-only is OK.
- **NEVER make changes in AWS without explicit user direction.** No `create-*`/`delete-*`/`update-*`/
  `put-*`, ECS/ALB/IAM/Secrets/RDS/S3/CloudFront writes. Read-only calls (`describe-*`, `list-*`,
  `get-*`) are fine, as is running an official deploy script when asked to deploy. If a deploy fails
  partway and leaves orphan resources, **stop and ask** before cleaning up.
- **NEVER use `git stash`.** Ask first.
- **NEVER upload PII to git or GitHub.** Review staged changes before committing. Names, emails,
  phone numbers, addresses, dates of birth, record numbers, patient ids, credentials — and also
  **body parts, diagnoses, procedure names, series descriptions, and dates of medical events** taken
  from real patient data. That applies to commit messages, PR descriptions, docs, and code comments,
  not just code. Use generic examples.
- **NEVER use `dangerouslySetInnerHTML`.** External HTML must be sanitized (DOMPurify) or parsed into
  a typed tree and rendered as React elements. This is a health data app — XSS is unacceptable.
- **NEVER take over the user's mouse** to drive the simulator — see
  [`docs/ios-simulator.md`](docs/ios-simulator.md).

## Workflow

- **When the user asks for a code change, open a PR by default once the change is made** — commit,
  push the branch, and create the PR without waiting to be asked a second time. Never push directly
  to `main`; CI (lint, tests, build) must pass.
- **NEVER merge a PR or enable auto-merge without the user's explicit permission.**
- **Test what's reasonable, not everything.** Scraper and utility logic, parsing, anything with edge
  cases or a failure mode that would be silent — write the test. Docs, comments, config tweaks, and
  changes whose only assertion would restate the diff — don't. Name the file for the kind of test it
  is.
- **Every interactive element in the Expo app needs a `testID`**, added in the same diff — enforced
  by `expo-app/src/__tests__/testids.unit.test.ts`.
- `gh pr edit` fails on a GitHub Projects Classic deprecation error. Update PRs with the API instead:
  ```bash
  gh api repos/Fan-Pier-Labs/ryans-health-app/pulls/<PR_NUMBER> -X PATCH -f title="…" -f body="…"
  ```
  `gh pr create` works normally.

### Keeping this file small

Every session pays for this file in context, so length is a real cost. **Maintaining it means
adding, editing, *and deleting* — a PR that only ever appends is how it got out of hand.**

- **Leave it the same size or smaller.** If a change genuinely belongs here, look for something to
  shorten or delete in the same PR. It got to 65KB by only ever being appended to.
- **Write a line here only if getting it wrong breaks something and the code wouldn't tell you.**
  Everything else is discoverable by reading the repo.
- **Detail belongs in `docs/` or the package's README**; this file gets the one-line rule and the
  pointer. Rationale, history ("this replaced X"), endpoint lists, per-file inventories, and
  exhaustive flag lists all go there.
- **Prune on sight.** Stale, duplicated, or now-documented-elsewhere lines get deleted in whatever
  PR you're already writing — no permission needed.
- **Don't restate the code.** No signatures, no file-by-file listings, no enumerating tests by name.

## Reference docs

- [Architecture](docs/architecture.md) — the invariants above, with the reasoning
- [Testing](docs/testing.md) — suites, CI integration, the coverage gate
- [Infrastructure](docs/infrastructure.md) — AWS, deployments, splash + demo, lambdas, S3, secrets
- [iOS simulator](docs/ios-simulator.md) — `maestro-cli`, sim sessions, testID rules
- [CLI reference](docs/cli.md) — cookie caching, credential resolution, 2FA, actions, proxy flags
- [Imaging scraper](docs/imaging.md) — eUnity protocol, AMF3, instance-specific notes
- [Scraping guide](docs/scraping.md) — MyChart login, scraping tips, tooling
- [MyChart features](docs/MYCHART_FEATURES.md) — full feature inventory and scraper coverage
- [MyChart TOTP](docs/mychart-totp.md) — authenticator-app 2FA setup, endpoints, CLI flags
- Package READMEs: `fake-mychart/`, `claude-desktop-extension/`, `npm-package/`,
  `openrecord-demo-lambda/`, `newsletter-lambda/`, `openrecord-splash/`

## Memory

Persistent memory lives in markdown at `claude-memory/` (this replaces the built-in auto-memory,
which is disabled here). Read `claude-memory/MEMORY.md` at the start of a conversation; keep it
concise and put detail in topic files it references.

- **Save**: stable patterns confirmed across interactions, architectural decisions, user workflow
  preferences, solutions to recurring problems.
- **Never save**: PII of any kind, session-specific state, unverified conclusions, or anything that
  duplicates this file.
- Check existing files before writing, fix memories that turn out wrong, organize by topic rather
  than chronologically.
