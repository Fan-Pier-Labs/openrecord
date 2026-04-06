# CLI Reference

Headless CLI entry point at `cli/cli.ts`. Run with `bun run cli` or `NODE_ENV=development bun cli/cli.ts`.

## Cookie Caching

The CLI caches serialized MyChart sessions to `.cookie-cache/<hostname>.json` after a successful login. On subsequent runs it loads the cache and validates cookies with `areCookiesValid()` — if still valid, login and 2FA are skipped entirely.

- Cache dir: `.cookie-cache/` (gitignored, project root)
- `--no-cache` flag: skips loading cached cookies (still saves after login)
- Implementation: `tryLoadCachedSession()` / `saveCachedSession()` in `cli/cli.ts`
- Uses `MyChartRequest.serialize()` / `unserialize()` from `scrapers/myChart/myChartRequest.ts`

## Credential Resolution

- `--host <hostname>` — auto-discovers credentials from browser password stores (Chrome, Arc, Firefox)
- `--host <hostname> --user <u> --pass <p>` — uses provided credentials
- `--read-login-from-browser` — explicitly scan browser password stores for credentials (works with or without `--host`)
- `--2fa <code>` — provides a 2FA code for non-interactive use

## Automatic 2FA via Resend

When 2FA is required and no `--2fa` code is provided, the CLI automatically retrieves the 2FA code from Resend's inbound email API. The user's MyChart verification emails are forwarded to `healthapp@bocuedpo.resend.app`, and the CLI polls Resend's inbound email API (`resend.emails.receiving.list()` / `.get()`) for up to 60 seconds to find a 6-digit code.

**How it works** (`cli/resend/resend.ts`):
1. Fetches the Resend API key from AWS Secrets Manager (`RESEND_API_KEY` ARN)
2. Lists inbound emails via `resend.emails.receiving.list()`
3. For each email newer than the cutoff time, fetches full body via `.get(id)`
4. Extracts 6-digit codes with regex, scores them by domain match to the MyChart hostname
5. Returns highest-scoring codes sorted by score then recency

**Important**: The AWS Secrets Manager client uses the `fanpierlabs` profile only when `NODE_ENV=development`. When running the CLI locally, always set:
```bash
NODE_ENV=development bun cli/cli.ts --host <hostname> --read-login-from-browser --action get-imaging
```

Implementation files: `cli/resend/resend.ts` (new, used by CLI) and `cli/resend/get2fa.ts` (legacy).

## Subcommands

The CLI supports subcommands for different health portals:

- `bun run cli mychart [flags]` — MyChart scraper (default if no subcommand)

When no subcommand is given, the CLI defaults to MyChart behavior.

## CLI Actions (MyChart)

By default (no `--action` flag), the CLI scrapes all 30+ data categories in parallel. Specific actions:

- `--action send-message` — Send a new message to a care team provider
- `--action send-reply --conversation-id <id> --message <text>` — Reply to an existing conversation
- `--action delete-message --conversation-id <id>` — Delete a message/conversation
- `--action request-refill` — Request a medication refill
- `--action get-imaging` — Download imaging results (X-ray, MRI, CT, etc.) with report text, FDI context, and SAML viewer URLs
- `--action get-thread --conversation-id <id>` — Get full message thread details
- `--action keep-alive-test` — Ping /Home every 5 minutes to keep session alive; runs forever, prints status each ping

## Passkey & TOTP Management

- `--set-up-passkey` — Register a new passkey (WebAuthn) on the MyChart account using a software authenticator. Saves credential to `.passkey-credentials/<hostname>.json`
- `--use-passkey` — Login using a saved passkey credential instead of username/password
- `--list-passkeys` — List all passkeys registered on the MyChart account
- `--delete-passkey` — Delete all passkeys registered on the MyChart account
- `--set-up-totp` — Enable TOTP authenticator app on the MyChart account. Saves secret to `.totp-secrets/<hostname>.txt`
- `--use-saved-totp` — Use saved TOTP secret for login (no email 2FA needed)
- `--disable-totp` — Disable TOTP authenticator app (requires saved TOTP secret + password)
- `--local` — Use HTTP instead of HTTPS (for local development with fake-mychart)
