# Tests

Test files live next to the code they cover, all over the repo. **What sorts
them into suites is the filename, not the folder** — every test file ends in one
of three kinds:

| Suffix | Needs | Runs in CI |
| --- | --- | --- |
| `*.unit.test.ts` | nothing — no network, no server, no credentials | yes (`bun run test`) |
| `*.integration.test.ts` | nothing — `test:integration` starts its own fake-mychart | yes (`bun run test:integration`) |
| `*.real-mychart.test.ts` | credentials for a **real** MyChart account | **never** (`bun run test:real-mychart`, by hand) |

Every `test*` script in every `package.json` selects on those suffixes and
nothing else — no script names a directory of tests, let alone an individual
file. Two consequences worth knowing:

- **The real-MyChart suite is out of CI by construction.** Nothing in the
  workflow globs `.real-mychart`, and `suite-naming.unit.test.ts` reads the
  workflow files and fails if that ever changes.
- **A test file that forgets its suffix never runs**, and a suite that never
  runs looks exactly like one that passes. `tests/suite-naming.unit.test.ts`
  fails the build on any unsuffixed `*.test.ts`, so that mistake surfaces
  immediately.

There is no allowlist and no exception. A suite that genuinely cannot run
belongs behind `it.skip`, where the reporter still counts it, never behind a
filename that makes it invisible.

## This folder

```
tests/
├── suite-naming.unit.test.ts       # the guard described above
└── integration/
    └── ci/                         # CI integration suite (Docker Compose)
        ├── cli-passkey.integration.test.ts          # CLI passkey setup/removal
        └── fake-mychart-passkey-ui.integration.test.ts  # Playwright passkey UI test
```

## `tests/integration/ci/`

Runs against the same fake-mychart every other integration suite uses: in CI
the `docker-compose.ci.yaml` service on `localhost:4000`, locally one that
`bun run test:integration` starts on a free port of its own.
`cli-passkey.integration.test.ts` also needs the CLI binary built first
(`cd npm-package && bun run build`).

There is no script scoped to this directory. `bun run test:integration` runs it
with everything else; that was the point of merging the two suites, and the
compose service dropped `FAKE_MYCHART_ACCEPT_ANY=true` — which nothing needed,
and which the suites asserting a bad password is rejected would have failed
against — so one server can serve them all.

**Every suite sharing that server resets it in its own `beforeAll`.** Bun runs
test files in directory-entry order, which shifts whenever a file is added or
renamed, so anything that depends on a neighbour having run first breaks for
reasons that look nothing like the cause.

### Running locally

```bash
# Build the CLI binary the passkey test spawns
cd npm-package && bun run build && cd ..

# Chromium for the passkey UI test — without it that one suite skips
bunx playwright install chromium

# Run every integration suite. This builds fake-mychart, starts it on a free
# port, and stops it again on the way out — no Docker, and no fixed port for a
# server in another worktree to be squatting on.
bun run test:integration
```

To run one suite by hand instead, start a server yourself and tell the suite
where it is — the test files still fall back to `localhost:4000`, which is
whatever happens to be on that port:

```bash
bun run fake-mychart   # prints the port it picked
FAKE_MYCHART_HOST=localhost:<port> bun test path/to/one.integration.test.ts
```

### Dependencies

`playwright` is a root devDependency, so `bun install` at the repo root covers
it — there is no per-directory `package.json` here. It drives a real Chromium
instance for the passkey UI test, which needs Playwright's WebAuthn virtual
authenticator (a CDP feature) — plain `fetch` can't replicate it.

The **browser binary** is a separate ~150MB download (`bunx playwright install
chromium`) that no other suite needs, so it stays out of the default setup: the
passkey UI suite skips, naming that command, when Chromium is missing. `$CI`
overrides the skip so the workflow can never quietly stop covering it.
