# Tests

Test files live next to the code they cover, all over the repo. **What sorts
them into suites is the filename, not the folder** — every test file ends in one
of three kinds:

| Suffix | Needs | Runs in CI |
| --- | --- | --- |
| `*.unit.test.ts` | nothing — no network, no server, no credentials | yes (`bun run test`) |
| `*.integration.test.ts` | a fake-mychart server, or Docker Compose | yes (`bun run test:integration`) |
| `*.mychart.test.ts` | credentials for a **real** MyChart account | **never** (`bun run test:mychart`, by hand) |

Every `test*` script in every `package.json` selects on those suffixes and
nothing else — no script names a directory of tests, let alone an individual
file. Two consequences worth knowing:

- **The real-MyChart suite is out of CI by construction.** Nothing in the
  workflow globs `.mychart`, so a new real-account test cannot be swept into a
  CI run by someone adding a directory to a list.
- **A test file that forgets its suffix never runs**, and a suite that never
  runs looks exactly like one that passes. `tests/suite-naming.unit.test.ts`
  fails the build on any unsuffixed `*.test.ts`, so that mistake surfaces
  immediately.

`scrapers/myChart/clo-image-parser/generate_clo.test.ts` is the single
deliberate exception: it has no suffix because two of its assertions fail (see
the header in the file), and having no kind is how it stays out of every suite.

## This folder

```
tests/
├── suite-naming.unit.test.ts       # the guard described above
└── integration/
    └── ci/                         # CI integration suite (Docker Compose)
        ├── cli-passkey.integration.test.ts          # CLI passkey setup/removal
        ├── fake-mychart-passkey-ui.integration.test.ts  # Playwright passkey UI test
        └── package.json            # Local deps for this suite
```

## `tests/integration/ci/`

Runs against the fake-mychart service defined in `docker-compose.ci.yaml`
(served on `localhost:4000`). `cli-passkey.integration.test.ts` also needs the
CLI binary built first (`cd npm-package && bun run build`).

`bun run test:ci-integration` scopes a run to just this directory;
`bun run test:integration` runs it together with every other integration suite
in the repo, which needs the same services up.

### Running locally

```bash
# Start services
docker compose -f docker-compose.ci.yaml up -d --build --wait

# Build the CLI binary the passkey test spawns
cd npm-package && bun run build && cd ..

# Run the suite
bun run test:ci-integration

# Tear down
docker compose -f docker-compose.ci.yaml down -v
```

### Dependencies

`tests/integration/ci/package.json` pulls in:

- `playwright` — drives a real Chromium instance for the passkey UI test,
  which needs Playwright's WebAuthn virtual authenticator (a CDP feature) —
  plain `fetch` can't replicate it.
