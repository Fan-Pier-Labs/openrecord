# CLI — contributor notes

**The user-facing reference is [`npm-package/docs/cli.md`](../npm-package/docs/cli.md)**. It
covers every flag, sign-in, output, family records, files and exit codes. Capabilities are in
[`npm-package/docs/capabilities.md`](../npm-package/docs/capabilities.md). This page only covers
what you need when working on the CLI itself.

## Running from a checkout

```bash
bun run cli mychart --host <hostname> [flags]
```

`npm-package/cli/entry.ts` strips the optional `mychart` subcommand and imports
`npm-package/cli/cli.ts`, which is also what the published binary is built from
(`cd npm-package && bun run build` → `dist/cli.cjs`). Against a local fake-mychart, add `--local`
(HTTP) and sign in as `homer` / `donuts123`:

```bash
PORT=4000 bun run fake-mychart
```

```bash
bun run cli mychart --local --host localhost:4000 --user homer --pass donuts123 --action get_medications
```

## Where things live

| Concern | File |
| --- | --- |
| Argument parsing, credential resolution, login, the patient guard, dispatch | `npm-package/cli/cli.ts` |
| `--action <id>` dispatch, `--arg` coercion, the default full-scrape set, file/image writing | `npm-package/cli/capabilityActions.ts` |
| `--help` text | `npm-package/cli/help.ts` |
| Passkey / TOTP stores (`MYCHART_PASSKEY_DIR`, `MYCHART_TOTP_DIR`) | `npm-package/cli/passkeyStore.ts`, `totpStore.ts` |
| Session (de)serialization | `MyChartRequest.serialize()` / `unserialize()` in `scrapers/myChart/core/myChartRequest.ts` |

The cookie cache is `tryLoadCachedSession()` / `saveCachedSession()` in `cli.ts`. It is
validated with `areCookiesValid()` on load, and `--no-cache` skips the load but still saves.

**The CLI never hand-lists a capability.** `--action` resolves any registry id (plus the dashed
aliases in `CLI_ACTION_ALIASES`), and the default scrape is `FULL_SCRAPE_CAPABILITIES`, which is
derived from `shared/capabilities/`. Adding a registry entry makes it a CLI command, part of the
default scrape if it is an argument-free read, and part of `--help`. All dispatch goes through
`executeCapability`, which is where the active-patient assertion lives. The only hand-written
actions are the interactive `send-message` / `send-reply` / `keep-alive-test`, the `get-imaging`
composite, `hospital-info`, which is not a registry entry yet, and `list-mycharts`, a
minutes-long crawl of the whole directory that no client should offer as a tool. How it checks
each login URL: [`scrapers/list-all-mycharts/`](../scrapers/list-all-mycharts/README.md#checking-login-urls).

`lessFrequentlyUsed` on a registry entry only controls whether `--help` shows it without
`--show-all`. It never changes what runs.

## Sign Count

The WebAuthn sign count is critical for passkey authentication. The server tracks how many times
a passkey has been used, and it rejects any assertion whose sign count is not higher than its
stored value. A passkey used from multiple sessions without the credential file being updated
(for example, copied to a different machine) ends up with a server-side counter higher than the
local file's `signCount`, and login fails.

**If passkey login fails unexpectedly**, the local `signCount` is behind the server's. Raise it
by **one** and retry. The file is meant to hold the count the server last accepted, and the
authenticator increments it again before it signs. Don't jump it to a round number like 100 or
500. That authenticates once and leaves the file no closer to the truth, so the same failure
returns later looking brand new. If several single steps in a row are all rejected, the drift is
not the problem. Check that the passkey still exists on the account with `--list-passkeys`.

The CLI increments and saves the count after each successful login, and
`passkeyLoginWithCounterRetry` bumps one step at a time (up to 10) on a rejection. **Anything that
calls `myChartPasskeyLogin` directly does not.** A probe or a one-off script desyncs the file on
its first use, and the next CLI login then fails. Either write the new count back, or bump the
file by one afterwards.
