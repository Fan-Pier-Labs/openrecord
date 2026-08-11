# Tests

End-to-end and integration tests for the mychart-connector project. Unit
tests live alongside their source files (`*.test.ts`); this folder is for
larger integration suites that need real services running.

## Layout

```
tests/
└── integration/
    └── ci/                         # CI integration suite (Docker Compose)
        ├── cli-passkey.test.ts         # CLI passkey setup/removal against fake-mychart
        ├── fake-mychart-passkey-ui.test.ts  # Browser-driven passkey UI test (Playwright)
        └── package.json                # Local deps for this suite
```

## `tests/integration/ci/`

Runs against the fake-mychart service defined in `docker-compose.ci.yaml`
(served on `localhost:4000`). `cli-passkey.test.ts` also needs the CLI
binary built first (`cd npm-package && bun run build`).

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
