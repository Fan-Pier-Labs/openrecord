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

## Capabilities (`--action <capability-id>`)

Beyond the hand-written actions above, `--action` accepts **any id from the
shared capability registry** (`shared/capabilities.ts`) and prints the result as
JSON. That registry is the single source of truth for what OpenRecord can do
with a MyChart account — the Claude Desktop extension registers one MCP tool per
entry, the mobile app offers one agent tool per entry, and the CLI gets one
`--action` per entry. Nothing is hand-listed in any of the four clients, so a
capability cannot exist in one and be missing from another.

```bash
mychart-cli --list-capabilities
```

Prints every capability grouped by area, with the arguments it takes. A `!`
marks a command that changes something — a write to the chart, or the account's
own sign-in settings.

Arguments are supplied with repeated `--arg name=value`:

```bash
mychart-cli --host mychart.example.org --action get_visit_notes --arg csn=CSN-12345
```

```bash
mychart-cli --host mychart.example.org --action get_past_visits --arg years_back=5
```

An unrecognized `--arg` is an error listing the ones the capability accepts,
rather than a silent no-op — a typo'd parameter name would otherwise look like
the capability ignoring the request. Missing required arguments and
out-of-range numbers are rejected the same way. The process exits non-zero if
the capability fails on any account.

Every chart-touching capability also accepts `--arg patient="<name>"`, the same
assertion `--patient` applies to the rest of the CLI: the call refuses if
MyChart is on a different record rather than reading the wrong chart. The
patient-record capabilities themselves (`list_proxy_targets`,
`switch_proxy_target`) are exempt, since they are how you inspect and change
which record is active.

Capabilities that mutate the account's sign-in settings (`register_passkey`,
`list_passkeys`, `delete_passkey`, `setup_totp`, `disable_totp`) are also
reachable this way; they are the same operations the dedicated flags below
perform, and they read and write the CLI's own TOTP and passkey stores.

## Proxy (Multi-Patient) Records

Some MyChart accounts can see more than one patient's chart — a parent reading a
child's record. `--action list-proxies` shows what's reachable:

```
  * Homer Jay Simpson  (your own record)
      --patient "Homer Jay Simpson"
    Bart Simpson
      --patient "Bart Simpson"
```

`*` marks the record the portal currently has active; `?` means the portal does
not report which one is active.

### Reading a chart: `--patient`

`--patient` works with **every** action, including the default full scrape. It
takes a patient **name** — never a record id:

```bash
mychart-cli --host mychart.example.org --patient "Bart Simpson"
```

A full name, or an unambiguous partial one (`--patient bart`), or `me` / `self`
for the account holder. If a query matches more than one record it fails and
lists them rather than guessing.

**Omitting `--patient` means the account holder, explicitly.**

### Changing which chart MyChart is on: `--switch`

Reads never change anything. If MyChart is pointed at a different patient than
the command is about, the CLI **stops and tells you**, rather than switching
behind your back:

```
  Refusing to read: mychart.example.org is currently on Bart Simpson,
  but this command is about Homer Jay Simpson.

  The active patient is stored on MyChart's server, so it has to be changed
  deliberately — reading never changes it. Run:

    mychart-cli --host mychart.example.org --action list-proxies     # every patient name on this account
    mychart-cli --host mychart.example.org --switch "Homer Jay Simpson"

  then re-run this command.
```

`--switch` is the only command that mutates anything, and it confirms against
the profile page before reporting success.

### Why it works this way

MyChart's active patient is *server-side session state*. There is no
per-request patient parameter — the portal simply returns whoever the session is
pointed at. The CLI also caches session cookies to disk, so that state outlives
a single invocation and can silently follow you into the next one.

So every command states the patient it is about and verifies it before reading
anything. Two runs with the same flags always mean the same thing, and a read
can never quietly change what a later read returns. Where an instance does not
report which record is active, the check falls back to comparing the profile
page against the requested patient; if neither can settle it, the CLI refuses
rather than guessing.

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
