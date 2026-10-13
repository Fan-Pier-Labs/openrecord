# `mychart-cli` — command-line reference

`mychart-cli` signs in to an Epic MyChart patient portal from your terminal, reads any part of the
chart, and acts on it. You can send messages, download statements and imaging, and manage
family-member records. Everything runs on your machine. Your credentials and the chart data never
pass through a Fan Pier Labs server.

- [Install](#install)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Signing in](#signing-in)
- [Running capabilities](#running-capabilities)
- [Output](#output)
- [Family records](#family-records---patient-and---switch)
- [Account sign-in settings](#account-sign-in-settings)
- [Every flag](#every-flag)
- [Files the CLI writes](#files-the-cli-writes)
- [Environment variables](#environment-variables)
- [Exit codes](#exit-codes)

Related: [capabilities](capabilities.md) (every `--action` id) · [authentication](authentication.md)
· [recipes](recipes.md) · [troubleshooting](troubleshooting.md)

## Install

```bash
npm install -g mychart-cli
```

This puts `mychart-cli` on your `PATH`. Node 18 or newer is required. To run it without a global
install, use `npx mychart-cli …`. From a checkout of this repository, `bun run cli mychart [flags]`
runs the same CLI from source.

## Quick start

Find your health system's MyChart hostname. This needs no account:

```bash
mychart-cli --action search_mycharts --arg query="mass general"
```

Sign in and dump your whole chart. The CLI prompts for whatever it can't find, including the 2FA
code:

```bash
mychart-cli --host mychart.example.org
```

Read one thing:

```bash
mychart-cli --host mychart.example.org --action get_lab_results --mode concise
```

Set up a passkey once, so later runs need no password and no 2FA code:

```bash
mychart-cli --host mychart.example.org --set-up-passkey
```

**Try it without a real account.** `fake-mychart.fanpierlabs.com` is a sandbox that behaves like
MyChart and holds made-up data. Sign in as `homer` / `donuts123`, and use 2FA code `123456`:

```bash
mychart-cli --host fake-mychart.fanpierlabs.com --user homer --pass donuts123 --2fa 123456 --action get_medications
```

## Usage

```
mychart-cli --host <hostname>                         Scrape every category and print it
mychart-cli --host <hostname> --action <capability>   Run one capability
mychart-cli --action <public-capability> --arg …      A lookup that needs no account
mychart-cli --help [--show-all]                       Usage, flags, and the capability listing
mychart-cli --list-capabilities [--show-all]          Just the capability listing
```

`--host` is the portal's bare hostname, such as `mychart.example.org`, with no `https://` and no
path. `central.mychart.org` is refused: it is an aggregator, not a portal, so use your health
system's own MyChart host.

With no `--action`, the CLI runs every chart-reading capability that takes no arguments, one after
another, and prints each result. That's 33 categories, including profile, medications, labs,
visits, messages, billing and insurance. It's a good smoke test and a full export in one go. The
set is derived from the capability registry, so it grows when the registry does. Writes, account
settings, downloads, and reads that need an id are never part of it.

## Signing in

### How the CLI finds credentials

For each run the CLI tries these sources in order and uses the first one that works:

1. **Cached session.** If `.cookie-cache/<host>.json` holds a session that MyChart still accepts,
   the CLI skips login and 2FA entirely. `--no-cache` skips this step, but the new session is
   still cached afterwards.
2. **`--use-passkey`**, or a saved passkey at `.passkey-credentials/<host>.json`. A saved
   passkey is used automatically when you pass `--host` without `--user`/`--pass`. No password
   and no 2FA prompt are needed.
3. **`--user` and `--pass`** on the command line.
4. **Your browser's saved passwords.** With `--host` and no other credentials, the CLI looks for
   a saved login for that host in Chrome, Arc, Brave, Edge, Vivaldi, Opera and Firefox. `--read-login-from-browser`
   forces this lookup. Without `--host`, it picks the first MyChart login it finds.
5. **Interactive.** With nothing else to go on, the CLI asks whether to scan your browsers or
   prompts for hostname, username and password. Browser scanning can select several accounts at
   once, and the CLI then runs against each.

Browser lookup is read-only and works on macOS and Windows. On macOS it reads the browser's key
from the Keychain, which raises the system's own permission prompt. Only logins on a confirmed
MyChart host are used. That means a host in the bundled MyChart directory, or one whose redirects
land on an Epic login page. Details are in
[`read-local-passwords/README.md`](../../read-local-passwords/README.md).

### Two-factor authentication

If MyChart asks for a code after the password:

| You have | What happens |
| --- | --- |
| A saved TOTP secret and `--use-saved-totp` | The CLI generates the code itself. MyChart sends no email or text |
| `--2fa <code>` | That code is submitted |
| An interactive terminal | You're prompted. A rejected code re-prompts, up to 3 attempts, and **never** triggers a new code |
| No TTY (piped, cron, CI) and no code | Nothing can answer the prompt. Pass `--2fa`, or use a passkey or saved TOTP secret instead |

After a successful emailed or texted code, the CLI offers to set up an authenticator (TOTP) so
later runs can sign in unattended. Answer `n` to skip. You can always run `--set-up-totp` later.

For unattended use, **set up a passkey**. It is the only method that needs no code at all. See
[authentication](authentication.md).

### Sessions stay alive

A session that expires mid-run is renewed silently with whatever non-interactive credentials
exist: the saved passkey, the password plus a saved TOTP secret, or the password alone on an
account that doesn't ask for a code. The call is then retried and the cookie cache refreshed. If
none of those works, the call fails with a session-expired error, and running the command again
signs in fresh.

## Running capabilities

Any id from the [capability list](capabilities.md) is an `--action`. Arguments are repeated
`--arg name=value` pairs:

```bash
mychart-cli --host mychart.example.org --action get_past_visits
```

```bash
mychart-cli --host mychart.example.org --action get_visit_notes --arg csn=123456789
```

```bash
mychart-cli --host mychart.example.org --action send_message \
  --arg recipient_name="Dr. Example" --arg subject="Question about my prescription" \
  --arg message="Is it OK to take this with food?"
```

How `--arg` values are read:

| Parameter type | Format |
| --- | --- |
| string | as typed. Quote values with spaces |
| number | parsed and range-checked, e.g. `--arg limit=25` |
| boolean | anything except `false` or `0` is true |
| list | comma-separated, e.g. `--arg attachments=./scan.pdf,./photo.jpg` |

An unknown argument name, a missing required argument, or an out-of-range number is an error that
lists what the capability accepts. A typo is never silently ignored.

`mychart-cli --help` lists the capabilities most people want, and `--show-all` adds the
less-used ones. A `!` in the listing marks a capability that changes something.

### Public lookups: no account

Three capabilities read public data, so they run without `--host`, without credentials, and
before any login:

```bash
mychart-cli --action search_mycharts --arg query=uchealth
```

```bash
mychart-cli --action lookup_npi --arg npi=1234567893
```

```bash
mychart-cli --action search_npi_registry --arg last_name=Smith --arg state=MA --arg specialty=Cardiology
```

`--host --action hospital-info` is the fourth account-free action. It describes the health system
behind a portal; see [capabilities](capabilities.md#not-in-the-registry-yet-hospital-info).

`--action list-mycharts` prints the whole directory rather than a search, as JSON, with every
login URL checked and corrected where Epic's points somewhere other than the portal. It crawls
~1,400 sites and takes a few minutes. Progress and a summary go to stderr; `--output <file>`
writes the JSON to a file instead of stdout:

```bash
mychart-cli --action list-mycharts --output mycharts.json
```

### Interactive actions

These prompt for anything you leave out, so they're meant for a person at a keyboard. For
scripts, use the registry capabilities `send_message` and `send_reply`, which take everything as
`--arg`.

| Action | What it does |
| --- | --- |
| `--action send-message [--subject <s>] [--message <m>]` | Pick a topic and a recipient from numbered lists, then send |
| `--action send-reply [--conversation-id <id>] [--message <m>]` | Without an id, pick from your 10 most recent conversations |
| `--action keep-alive-test` | Hold the session open, pinging MyChart's keepalive every 30 s until Ctrl+C |

### Older dashed names

These still work, and each is an alias for a registry capability:

| Dashed action | Same as |
| --- | --- |
| `list-proxies` | `list_proxy_targets` |
| `get-thread --conversation-id <id>` | `get_message_thread` |
| `delete-message --conversation-id <id>` | `delete_message` |
| `request-refill --arg medication_name=…` | `request_refill`, which is **not implemented** and returns a notice |
| `get-imaging` | `get_imaging_results`, then `download_imaging_study` for every study with pictures, written to `<output>/<host>/` with an `all-imaging.json` metadata dump |

## Output

Each result is printed under a banner line naming the capability and host:

```
============================================================
  Medications: mychart.example.org
============================================================
{
  "prescriptions": [ … ]
}
```

The banners and progress messages ("Connecting to…", "Using cached session") go to **stdout**
along with the data, because the CLI is built for reading. For machine-readable output, use the
[library](api.md), which returns plain objects. Or strip everything before the first `{` or `[`.

`--mode` picks the format of a read capability's payload:

| `--mode` | Output |
| --- | --- |
| `json` (default) | The standard object as indented JSON |
| `standard` | The same data as markdown |
| `concise` | Only the useful fields, as markdown. Good for pasting into an AI chat |
| `raw` | Exactly what MyChart sent. Large |

`--arg mode=…` does the same and wins if both are given. Writes, downloads and account settings
ignore it. More detail is in [capabilities](capabilities.md#output-modes).

**Files.** `get_message_attachment`, `download_billing_statement` and `download_document` write
the file into `--output <dir>` (default: the current directory) and print a JSON summary with its
`filePath`. An existing file is never overwritten; the new one gets a `-2`, `-3`… suffix.
`download_imaging_study` decodes each image to a quality-100 JPEG in `--output` (default
`./imaging-output`). `--save-clo` also keeps the raw CLO bytes.

## Family records: `--patient` and `--switch`

On an account that can open a family member's chart, MyChart returns whichever record is active
on the server, and that choice persists between runs through the cookie cache. So every command
states whose chart it's about, and the CLI checks before reading:

```bash
mychart-cli --host mychart.example.org --action list-proxies
```

```bash
mychart-cli --host mychart.example.org --switch "Bart"
```

```bash
mychart-cli --host mychart.example.org --patient "Bart" --action get_immunizations
```

```bash
mychart-cli --host mychart.example.org --switch me
```

- `--patient "<name>"` takes a full name, an unambiguous part of one, or `me`. It works with every
  action, including the full scrape. **Leaving it out means the account holder.**
- If MyChart is on a different record, the command **refuses** and prints the `--switch` that
  fixes it. Reads never switch on their own.
- `--switch` is the only command that changes the active record. It confirms the switch against
  the profile page before reporting success.
- On an account with only one record, `--patient` is an error.

Why it works this way is covered in [authentication](authentication.md#family-records).

## Account sign-in settings

These change how the MyChart account itself signs in. Each is sugar for an account-settings
capability.

| Flag | What it does |
| --- | --- |
| `--set-up-passkey` | Register a new passkey on the account and save it to `.passkey-credentials/<host>.json`. An existing file is archived, not overwritten |
| `--use-passkey` | Sign in with the saved passkey |
| `--list-passkeys` | List the passkeys registered on the account |
| `--delete-passkey` | Remove **every** passkey from the account. To remove one, use `--action delete_passkey --arg raw_id=<rawId>` |
| `--set-up-totp` | Turn on authenticator-app 2FA and save the secret to `.totp-secrets/<host>.txt` |
| `--use-saved-totp` | Generate 2FA codes from the saved secret |
| `--disable-totp` | Turn authenticator-app 2FA off. Needs the saved secret and the password |

## Every flag

| Flag | Meaning |
| --- | --- |
| `--host <hostname>` | The MyChart portal, e.g. `mychart.example.org` |
| `--user <username>` | Username. Skips the prompt and the browser lookup |
| `--pass <password>` | Password |
| `--2fa <code>` | Use this 2FA code instead of prompting. Used once; a rejection re-prompts when interactive |
| `--read-login-from-browser` | Force a browser password-store lookup, with or without `--host` |
| `--no-cache` | Ignore the cached session and sign in fresh |
| `--use-passkey` | Sign in with the saved passkey |
| `--use-saved-totp` | Generate the 2FA code from the saved TOTP secret |
| `--action <id>` | Run one capability, public lookup, or interactive action |
| `--arg name=value` | A capability argument. Repeat for each one |
| `--mode <mode>` | `json` (default), `standard`, `concise` or `raw` |
| `--patient "<name>"` | Assert whose record this command reads. Defaults to the account holder |
| `--switch "<name>"` | Change MyChart's active record, then exit |
| `--output <dir>` | Where downloaded files and images go. For `list-mycharts`, the file to write |
| `--save-clo` | Also keep raw CLO bytes for downloaded images |
| `--conversation-id <id>` | For `send-reply`, `get-thread`, `delete-message` and any capability with a `conversation_id` argument |
| `--subject <text>`, `--message <text>` | Pre-fill the prompts of `send-message` / `send-reply` |
| `--set-up-passkey`, `--list-passkeys`, `--delete-passkey` | Passkey management. See above |
| `--set-up-totp`, `--disable-totp` | Authenticator-app management. See above |
| `--local` | Use HTTP instead of HTTPS, for a fake-mychart running on your machine |
| `--help`, `-h` | Usage, every flag, and the capability listing |
| `--list-capabilities` | Just the capability listing |
| `--show-all` | With `--help` or `--list-capabilities`, include the less-used capabilities |

## Files the CLI writes

All paths are relative to the **current directory**, so credentials live in your project, not in
`node_modules`. **Add the credential directories to `.gitignore`.** They hold a live session, a
private key and a 2FA secret.

| Path | Contents | Sensitive |
| --- | --- | --- |
| `.cookie-cache/<host>.json` | The signed-in session | yes |
| `.passkey-credentials/<host>.json` | The passkey's private key and signature counter. Older ones are archived as `<host>.<timestamp>.json` | **yes** |
| `.totp-secrets/<host>.txt` | The authenticator secret | **yes** |
| `./imaging-output/` | Decoded images, when you download imaging | medical data |
| `--output` dir / current dir | Downloaded attachments, statements, documents | medical data |

```bash
printf '.cookie-cache/\n.passkey-credentials/\n.totp-secrets/\n' >> .gitignore
```

## Environment variables

| Variable | Effect |
| --- | --- |
| `MYCHART_PASSKEY_DIR` | Where passkeys are stored, instead of `./.passkey-credentials` |
| `MYCHART_TOTP_DIR` | Where TOTP secrets are stored, instead of `./.totp-secrets` |
| `MYCHART_CLI_TELEMETRY_DISABLED=1` | Turn off anonymous usage events **and** the update check |
| `MYCHART_MAX_CONCURRENT_REQUESTS_PER_HOST` | Requests in flight to one portal at once. Default 10. Raise it only with good reason, because a portal that sees too many can block your IP |

## Exit codes

| Code | When |
| --- | --- |
| `0` | Success, or `--help` / `--list-capabilities` |
| `1` | Sign-in failed on every account, an `--action` failed on any account, a refused patient check, bad arguments, or a fatal error |

A full scrape with no `--action` prints each failing category's error and keeps going. It
reports how many failed at the end, but **still exits `0`**. When a script depends on the result,
run the categories you need as separate `--action`s.

## Telemetry and update check

The CLI sends anonymous usage events: the event name, the portal hostname, OS and runtime
version, and a random per-install id. Chart data, credentials, usernames and your machine's
hostname are never sent. On start it also fetches a small version manifest from
`openrecord.fanpierlabs.com` to tell you about new releases. That request reveals your IP address
to the CDN, and nothing else. `MYCHART_CLI_TELEMETRY_DISABLED=1` turns both off. Details are in the
[package README](../README.md#telemetry).
