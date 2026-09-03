# CLI Reference

Headless CLI entry point at `npm-package/cli/cli.ts`. Run with `bun run cli` or `bun npm-package/cli/cli.ts`.

## Global install

`npm i -g mychart-cli` installs the CLI as `mychart-cli` on PATH. After install, run e.g. `mychart-cli --host <hostname>`.

## Cookie Caching

The CLI caches serialized MyChart sessions to `.cookie-cache/<hostname>.json` after a successful login. On subsequent runs it loads the cache and validates cookies with `areCookiesValid()` — if still valid, login and 2FA are skipped entirely.

- Cache dir: `.cookie-cache/` (gitignored, project root)
- `--no-cache` flag: skips loading cached cookies (still saves after login)
- Implementation: `tryLoadCachedSession()` / `saveCachedSession()` in `npm-package/cli/cli.ts`
- Uses `MyChartRequest.serialize()` / `unserialize()` from `scrapers/myChart/core/myChartRequest.ts`

## Credential Resolution

- `--host <hostname>` — auto-discovers credentials from browser password stores (Chrome, Arc, Brave, Edge, Firefox)
- `--host <hostname> --user <u> --pass <p>` — uses provided credentials
- `--read-login-from-browser` — explicitly scan browser password stores for credentials (works with or without `--host`)

Browser discovery is read-only and macOS/Windows only. It reads the OS-held master key
(macOS Keychain, or DPAPI on Windows) — on macOS that raises the system's own permission
prompt, which is the consent gate. Only **confirmed** matches are used: a hostname in the
bundled MyChart directory, or one whose redirect chain lands on an Epic login page. Anything
else is dropped rather than guessed at — pass `--user`/`--pass` for those. See
[`read-local-passwords/README.md`](../read-local-passwords/README.md).
- `--2fa <code>` — provides a 2FA code for non-interactive use; otherwise the CLI prompts interactively for the 6-digit code

## Subcommands

The CLI supports subcommands for different health portals:

- `bun run cli mychart [flags]` — MyChart scraper (default if no subcommand)

When no subcommand is given, the CLI defaults to MyChart behavior.

## CLI Actions (MyChart)

By default (no `--action` flag), the CLI scrapes every argument-free read
capability in the registry and prints each result as JSON under its own
header. The set is `FULL_SCRAPE_CAPABILITIES` in
`npm-package/cli/capabilityActions.ts` — derived from `shared/capabilities/`,
never hand-listed, so a read capability added to the registry is part of the
default scrape the same day. Every category dispatches through
`executeCapability`, so the full scrape gets the same active-patient guard as
any single `--action`.

Three actions are hand-written because they prompt interactively for their
inputs:

- `--action send-message` — Send a new message to a care team provider (prompts for topic and recipient; `--subject` / `--message` pre-fill those prompts)
- `--action send-reply --conversation-id <id> --message <text>` — Reply to an existing conversation (prompts for whatever is omitted)
- `--action keep-alive-test` — Ping KeepAlive every 30s to keep the session alive; runs until Ctrl+C

The older dashed action names still work. Each resolves to the registry
capability that replaced its hand-written handler and prints that capability's
JSON:

- `--action get-imaging` — Every imaging study, downloaded and decoded to JPEGs. A composite of `get_imaging_results` plus one `download_imaging_study` per study; images and the full metadata dump (`all-imaging.json`, reports included) land in `./imaging-output/<hostname>/`. `--output <dir>` overrides the base directory; `--save-clo` keeps the raw CLO bytes alongside the JPEGs
- `--action get-thread --conversation-id <id>` — `get_message_thread`
- `--action delete-message --conversation-id <id>` — `delete_message`
- `--action request-refill --arg medication_name=<name>` — `request_refill`
- `--action list-proxies` — `list_proxy_targets`

## Capabilities (`--action <capability-id>`)

Beyond the hand-written actions above, `--action` accepts **any id from the
shared capability registry** (`shared/capabilities/`) and prints the result as
JSON. That registry is the single source of truth for what OpenRecord can do
with a MyChart account — the Claude Desktop extension registers one MCP tool per
entry, the mobile app offers one agent tool per entry, and the CLI gets one
`--action` per entry. Nothing is hand-listed in any of the four clients, so a
capability cannot exist in one and be missing from another.

```bash
mychart-cli --help
```

```bash
mychart-cli --list-capabilities
```

`--help` prints usage and every flag, then the capability listing;
`--list-capabilities` prints the listing on its own. Capabilities are grouped by
area, with the arguments each takes. A `!` marks a command that changes
something — a write to the chart, or the account's own sign-in settings.

### `--mode`

Every read capability renders its payload in one of four modes (see
[`processor-layer-proposal.md`](processor-layer-proposal.md)):

| Mode | What you get |
| --- | --- |
| `json` | The standard object as JSON — every useful field, MyChart's own names. **The CLI default.** |
| `standard` | The same object as markdown |
| `concise` | The interesting subset, as markdown — what the desktop extension and the app show a model by default |
| `raw` | Exactly what MyChart sent, untouched. Large; HTML and Epic's UI flags included |

```bash
mychart-cli --host mychart.example.org --action get_medications --mode concise
```

`--arg mode=<mode>` means the same thing and wins when both are given. Writes
and `download_imaging_study` ignore it.

### `--show-all`

MyChart's surface is not evenly valuable. Labs, medications, visit notes and
messages are the reason to connect an account; goals, education materials, care
journeys, letters, the emergency-contact writes and the account's own sign-in
settings are endpoints most charts leave empty and most callers never reach
for. Listing all of them at equal weight buries the useful ones — a person
skims past them, and a model picks a plausible-looking wrong tool out of the
noise.

So both listings show the commonly-used capabilities by default and name the
count they held back:

```
  20 less-frequently-used capabilities are hidden. Show them with:
      mychart-cli --list-capabilities --show-all
```

```bash
mychart-cli --help --show-all
```

appends them under a **Less frequently used** heading rather than mixing them
back in, so the default listing keeps its shape.

**This is presentation only.** `lessFrequentlyUsed` in `shared/capabilities/`
decides what a listing leads with and nothing else: a hidden capability is
still registered in every client, still runs as `--action <id>`, and still
takes the same arguments. Moving one in or out of the hidden set is a judgment
call about usefulness, never a change to what the CLI can do.

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

Capabilities that produce images (`rendersMedia` in the registry — today
`download_imaging_study`) never print image bytes to the terminal.
`download_imaging_study` downloads **every** image in the study; the CLI
decodes each raw CLO image and writes it as a quality-100 JPEG into
`./imaging-output` (override the directory with `--output <dir>`), and prints
a JSON summary with each file's path and dimensions so the images can be
opened straight from Finder:

```bash
mychart-cli --host mychart.example.org --action download_imaging_study \
  --arg image_id=<id from get_imaging_results> --output ~/Desktop/my-scan
```

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
child's record. `--action list-proxies` (the `list_proxy_targets` capability)
shows what's reachable as JSON: a `patients` list with each record's `name`,
`is_self` and `is_active`, plus `active_patient` naming the record data reads
currently return. `is_active: null` means the portal does not report which
record is active.

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
