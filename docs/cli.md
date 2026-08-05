# CLI Reference

Headless CLI entry point at `npm-package/cli/cli.ts`. Run with `bun run cli` or `bun npm-package/cli/cli.ts`.

## Global install

`npm i -g mychart-cli` installs the CLI as `mychart-cli` on PATH. After install, run e.g. `mychart-cli --host <hostname>`.

## Cookie Caching

The CLI caches serialized MyChart sessions to `.cookie-cache/<hostname>.json` after a successful login. On subsequent runs it loads the cache and validates cookies with `areCookiesValid()` — if still valid, login and 2FA are skipped entirely.

- Cache dir: `.cookie-cache/` (gitignored, project root)
- `--no-cache` flag: skips loading cached cookies (still saves after login)
- Implementation: `tryLoadCachedSession()` / `saveCachedSession()` in `npm-package/cli/cli.ts`
- Uses `MyChartRequest.serialize()` / `unserialize()` from `scrapers/myChart/myChartRequest.ts`

## Credential Resolution

- `--host <hostname>` — auto-discovers credentials from browser password stores (Chrome, Arc, Firefox)
- `--host <hostname> --user <u> --pass <p>` — uses provided credentials
- `--read-login-from-browser` — explicitly scan browser password stores for credentials (works with or without `--host`)
- `--2fa <code>` — provides a 2FA code for non-interactive use; otherwise the CLI prompts interactively for the 6-digit code

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
- `--action list-proxies` — List the patient records this account can reach (its own, plus any it has proxy access to)
- `--action switch-proxy --proxy-id <id>` — Switch which patient record subsequent requests read from
- `--action switch-proxy --proxy-name "<name>"` — Same, selecting by display name instead of id
- `--action switch-proxy --proxy-self` — Switch back to the account holder's own record

## Proxy (Multi-Patient) Records

Some MyChart accounts can see more than one patient's chart — a parent reading a
child's record, for example. `--action list-proxies` shows what's reachable:

```
  * Homer Jay Simpson  (self)
    Bart Simpson  PROXY-BART
    Lisa Simpson  PROXY-LISA
```

`*` marks the active record, and `?` means the portal did not say which record is
active (some instances don't report it). The account holder's own record always
has the empty-string id, which is why `--proxy-self` exists — it's easier to type
than `--proxy-id ""`, which some shells and `bun run` swallow.

Switching changes the session, so every subsequent scrape reads the record you
switched to. The switch is verified against the profile page before it returns:
if the portal ends up showing a different patient than the one you asked for, the
command fails rather than handing back the wrong person's chart.

## Passkey Authentication

The CLI supports WebAuthn passkey authentication for passwordless login to MyChart portals.

- `--set-up-passkey` — Register a new passkey on the MyChart account (requires username/password for initial setup)
- `--use-passkey` — Log in using a saved passkey (no password needed)
- `--list-passkeys` — List all passkeys registered on the MyChart account
- `--delete-passkey` — Delete all passkeys registered on the MyChart account
- Auto-discovery: when `--host` is provided without credentials, the CLI checks for a saved passkey before falling back to browser password stores

Passkey credentials are stored in `.passkey-credentials/<hostname>.json` (gitignored). Each file contains the credential ID, private key, RP ID, user handle, and sign count.

### Sign Count

The WebAuthn sign count is critical for passkey authentication. The server tracks how many times a passkey has been used and rejects assertions with a sign count lower than or equal to its stored value. If a passkey is used from multiple sessions without the credential file being updated (e.g., copied to a different machine), the server-side counter will be higher than the local file's `signCount`, causing login to fail.

**If passkey login fails unexpectedly**, check the `signCount` in the credential file. If it's lower than the actual number of times the passkey has been used, manually increment it to a value higher than the server's counter (e.g., set it to 100). The CLI automatically increments and saves the updated sign count after each successful login.

## TOTP Management

- `--set-up-totp` — Enable TOTP authenticator app on the MyChart account. Saves secret to `.totp-secrets/<hostname>.txt`
- `--use-saved-totp` — Use saved TOTP secret for login (no email 2FA needed)
- `--disable-totp` — Disable TOTP authenticator app (requires saved TOTP secret + password)

## Other Flags

- `--local` — Use HTTP instead of HTTPS (for local development with fake-mychart)
