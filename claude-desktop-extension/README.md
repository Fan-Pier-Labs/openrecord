# OpenRecord — Claude Desktop Extension

A Claude Desktop Extension (`.mcpb`) that gives Claude access to your Epic
MyChart patient portal. Read your medications, lab results, imaging, messages,
billing, and more — or send a message to your care team, request a refill,
and manage emergency contacts — all through a natural conversation.

## Install

```bash
cd claude-desktop-extension
bun install
bun run pack          # builds dist/server.cjs and produces openrecord.mcpb
```

Then double-click `openrecord.mcpb` (or drag it into Claude Desktop → Settings → Extensions).

## Use

After installing, open a new Claude chat and say:

> Set up my MyChart.

### Interactive widget (recommended)

In Claude Desktop, Claude shows an inline **step-based setup widget**
(`get_setup_widget`):

1. **Pick a health system** — an autocomplete dropdown over the full MyChart
   directory. Results appear only once you type (no default list); each shows
   the system's banner logo. You must choose an entry from the list (free-text
   hostnames aren't accepted). Search **test**, **springfield**, or
   **fake-mychart** to find the **Springfield General Hospital (test)** entry,
   which points at the `fake-mychart.fanpierlabs.com` sandbox (Homer Simpson
   fake data, no real credentials needed — sign in with `homer` / `donuts123`).
2. **Sign in** — the chosen system's logo sits above username + password
   fields. Submitting runs the real login scrapers via `setup_account`.
   Validation/login errors show inline beneath the button.
3. **Two-step verification** — shown only if `setup_account` reports the portal
   requires a code; entering it calls `complete_2fa`.

> **Logos.** MyChart's only per-instance brand asset is the wide banner logo
> (`ichart2.epic.com`, ~640×230), so the widget uses it everywhere — a
> banner-shaped slot in the dropdown and a banner above the inputs on the
> sign-in / 2FA steps. Square favicons aren't used: ~half of instances are
> multi-tenant (many orgs share one host, e.g. 200+ on `mychart.ochin.org`) and
> favicons are per-host, so they can't distinguish those orgs; most are also
> just the generic Epic icon.

### Tool-call fallback

Without the widget (Claude.ai web, other MCP clients), Claude walks through the
same setup sequence using ordinary tool calls:

1. **`search_mycharts`** — Claude asks you for your health system name (e.g.
   "uchealth", "mass general") and looks up the hostname.
2. **`setup_account(hostname, username, password)`** — Claude asks you for
   your credentials in chat, then logs in. Credentials are stored locally in
   `~/.openrecord-mcpb/` on your machine. Never sent to Anthropic.

Or skip typing a password entirely, if your browser already has one saved:

- **`import_browser_passwords`** — scans this machine's browser password stores
  (Chrome, Arc, Brave, Edge, Firefox) for MyChart logins. Read-only; on macOS it
  raises the system keychain prompt, which is where you consent. Only accounts it
  can confirm are offered — a known Epic instance, or one whose login page it
  verified. **No passwords are returned** — each entry carries an opaque
  `import_id`, and the credential stays on your machine.
- **`connect_imported_account(import_id)`** — connects the one you picked, using
  the password already in your browser. Same 2FA and passkey flow as
  `setup_account`.

Anything it cannot confirm is left out rather than guessed at — use
`setup_account` for those, or run the import again later if a portal was
temporarily unreachable. See
[`read-local-passwords/README.md`](../read-local-passwords/README.md) for what is
read and how confirmation works.
3. **`complete_2fa(pending_id, code)`** — if MyChart requires 2FA, Claude
   asks you for the 6-digit code.
4. **`register_passkey(account)`** — recommended, and never automatic. Logging
   in changes nothing about how your account signs in; Claude offers you a
   passkey afterwards and registers one only if you say yes. With one, future
   logins skip the password and the 2FA prompt entirely. The private key is
   stored in your OS keystore (the Keychain on macOS — see
   [Architecture](#architecture)) and never sent to Anthropic; the
   credential itself lives on your MyChart account until you remove it with
   `delete_passkey` or `disconnect_account`.

After setup, every data tool takes a required `account` parameter — the
account id returned by `list_accounts`, `username@hostname`. Multiple
accounts can be active at the same time — just pass a different `account`
per call. That includes several logins on the *same* hostname (a household
sharing one health system): each keeps its own credentials, passkey, and
session. An id resolves only on a perfect hostname + username match; there
is no hostname-only shorthand, so a call can never land on the wrong login.

The data tools are not listed anywhere in this package. They are generated
from the shared capability registry (`shared/capabilities.ts`), which is also
what the CLI and the mobile app derive their surfaces from — so this extension
cannot quietly support less than they do. `registerAllTools` hand-writes only
the five account-management tools above, which manage credentials on this
machine and have no counterpart in the other clients.

> What's my next appointment at uchealth?
> Refill my lisinopril (use my mass general account).
> Send a message to Dr. Smith asking about my latest blood pressure reading.
> Show me my last imaging study.

### Family records (proxy access)

Accounts with MyChart proxy access (a parent reading a child's chart) can list
and switch the active patient. **`list_proxy_targets`** shows every record the
account can reach and which is active; **`switch_proxy_target`** changes it —
verified against the profile page, so a switch that lands on the wrong patient
fails instead of returning the wrong chart. MyChart's active patient is
server-side session state, so every data tool also takes an optional `patient`
parameter and refuses (with instructions) rather than silently reading a
different family member's record than the one the call is about.

> Ask my uchealth account which records I can access.
> Switch to Bart's record and show his immunizations.
> Switch back to my own record.

## Architecture

- **stdio MCP server** — speaks the 2025-06-18 MCP protocol with elicitation
  support. Claude Desktop ships its own Node runtime; no Node install needed
  on the user's machine.
- **Pure JS, with one exception** — no `sharp`, no `sqlite3`. CLO → JPEG imaging
  conversion calls the shared pure-JS exporter (`convertCloToJpgPureJs` in
  `scrapers/myChart/clo-image-parser/exporters/`), which is
  [`jpeg-js`](https://www.npmjs.com/package/jpeg-js) end to end and is the same
  code path the mobile app uses. The exception is
  [`@napi-rs/keyring`](https://www.npmjs.com/package/@napi-rs/keyring), the
  native binding used to reach the OS credential store — see below.
- **Secrets live in the OS keystore** — the macOS Keychain, Windows Credential
  Manager, or the Secret Service on Linux, under service `openrecord-mcpb`,
  three items per identity:
  - `password:<hostname>:<username>`
  - `totp:<hostname>:<username>`
  - `passkey:<hostname>:<username>` — a raw P-256 private key that logs in with
    neither password nor 2FA

  If the keystore is unavailable the store falls back to the 0600 files below
  and says so in `list_accounts`'s `secretStorage` field, so a downgrade to
  plaintext is visible rather than silent. `OPENRECORD_SECRET_BACKEND` overrides
  the choice: `file` to opt out, `os` to fail rather than fall back.

  **Migration happens on read.** The first read after upgrading moves a secret
  out of its old file location into the keystore and deletes the plaintext copy,
  so nobody has to log in again — and `accounts.json` loses its inline
  `password`/`totpSecret` the first time the account is touched.
- **What stays on disk** at `~/.openrecord-mcpb/`, keyed by (hostname, username)
  so several logins on one hostname never share or overwrite each other's
  identity:
  - `accounts.json` — the index of which logins exist (mode 0600). Also holds
    `password`/`totpSecret` inline when there is no keystore, which is where
    every pre-keystore install left them
  - `passkeys/<hostname>/<username>.json` — keystore fallback only
  - `sessions/<hostname>/<username>.json` — serialized cookie jars for fast
    resume. Cookies are bearer credentials too, but they expire and the
    silent-login ladder just re-mints them
- **Not a single-file bundle any more** — a `.node` binary cannot be inlined
  into a CJS file, so `dist/server.cjs` ships alongside
  `node_modules/@napi-rs/`. The `.mcpb` went from 1.0 MB to 2.8 MB.

  **It is still one download that works everywhere.** The artifact carries all
  four platform binaries — macOS arm64/x64, Windows x64/arm64 — and
  `@napi-rs/keyring`'s loader is a `process.platform`/`process.arch` switch that
  requires the matching one at startup. There is no per-platform build and
  nothing for a user to choose.

  Getting all four onto one machine is the only wrinkle. They are twelve
  separate packages `@napi-rs/keyring` lists in its own `optionalDependencies`,
  gated on `os`/`cpu` — the standard way prebuilt-binary packages ship (esbuild
  has 26, rollup 27) — so a normal `bun install` resolves only the slice
  matching the machine doing the install. `bun run pack` therefore overrides
  with `bun install --os='*' --cpu='*'`, `.mcpbignore` picks the four to keep
  out of the twelve that pulls, and `scripts/verify-native-binaries.mjs`
  **refuses to pack** if one is missing. That last check matters because the
  failure is otherwise invisible: a `.mcpb` packed after a plain `bun install`
  looks fine, installs fine, and silently stores credentials in plaintext for
  everyone not on the packer's platform.

  Linux is not included (Claude Desktop has no Linux build, and the file
  fallback covers the raw server). Adding it is two lines in `.mcpbignore`, at
  about +9 MB.

## File layout

```
claude-desktop-extension/
├── manifest.json           # MCPB manifest (see https://github.com/modelcontextprotocol/mcpb)
├── package.json
├── tsup.config.ts          # CJS bundle for Claude Desktop's Node (@napi-rs/keyring stays external)
├── smoke.mjs               # boots the built bundle and speaks MCP to it
├── icon.png                # 256×256 extension icon
├── scripts/
│   ├── verify-native-binaries.mjs # refuses to pack without every platform's keyring binary
│   └── sign-mcpb.mjs              # signs a release with the Developer ID (see below)
└── src/
    ├── index.ts            # stdio entry
    ├── tools.ts            # account meta tools + one tool per shared capability
    ├── setup-flow.ts       # elicitation-driven setup wizard
    ├── session-manager.ts  # per-account session cache with keepalive + passkey auto-login
    ├── credential-store.ts # ~/.openrecord-mcpb/ persistence
    ├── secret-store.ts     # OS keystore for passkeys, with the file as fallback
    ├── instances.ts        # picker data (sourced from scrapers/list-all-mycharts/)
    └── imaging/            # MCPB glue around the shared pure-JS CLO → JPEG exporter
```

## Development

```bash
bun run typecheck  # tsc --noEmit — catches type errors esbuild silently skips
bun run build      # tsc --noEmit, then tsup → dist/server.cjs
bun run dev        # tsup watch mode — rebuilds dist/server.cjs on every save
bun run smoke      # build, then boot the bundle and speak MCP to it (see below)
bun run pack       # build + run `mcpb pack` → openrecord.mcpb
bun run pack:signed # pack, then sign with the Developer ID (see below)
```

> **Smoke test.** Everything else in this package tests the TypeScript sources
> in-process; `bun run smoke` is the only check that runs the *bundle* the way
> Claude Desktop does — `node dist/server.cjs`, then a real `initialize` /
> `tools/list` / `tools/call` exchange over stdio. It runs from a staged copy
> containing only what `.mcpbignore` ships (the manifest and `dist/`), so a
> dependency left external to the bundle fails here instead of on a patient's
> machine; run in place, the repo's `node_modules` would quietly satisfy it. It
> also parses every line the server writes to stdout, which is where the
> "stdout carries JSON-RPC and nothing else" rule gets enforced. CI runs it in
> place of a bare `bun run build`.

> **Type checking.** tsup bundles with esbuild, which strips types without
> checking them — so type errors (wrong function arguments, missing fields)
> compile clean and only blow up at runtime. `bun run build` now runs
> `tsc --noEmit` first so those are caught at build time and in CI. Tests are
> type-checked too (`@types/bun` provides the `bun:test` types).

### Hot-reload dev loop (recommended)

Claude Desktop spawns `dist/server.cjs` once and does **not** pick up rebuilds on
its own — you'd otherwise have to toggle the extension off/on after every change.
[`mcpmon`](https://www.npmjs.com/package/mcpmon) is a transparent stdio proxy
(think `nodemon` for MCP) that restarts the server when `dist/` changes while
keeping the client connected, and fires `notifications/tools/list_changed` so the
tool list refreshes automatically.

```bash
bun run dev:reload   # build once, then tsup --watch + MCP Inspector via mcpmon
```

This opens the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
in a browser where you can list/call tools, see logs, and render the `ui://`
setup widget interactively (the Inspector acts as the MCP Apps host). Edit a file
in `src/` → tsup rebuilds `dist/server.cjs` → mcpmon restarts the server → the
Inspector stays connected. This is a faster loop than round-tripping through
Claude Desktop.

**Ports / parallel worktrees.** Only the Inspector binds TCP ports — two of them:
the browser UI (`CLIENT_PORT`, default 6274) and the proxy (`SERVER_PORT`, default
6277). `tsup` and `mcpmon` don't bind ports (mcpmon is a stdio proxy), and each
worktree's `node dist/server.cjs` is an independent stdio child. So `dev:reload`
grabs two **free OS-assigned ports** on each run and prints the UI URL — multiple
worktrees / Claude sessions can each run their own loop without colliding. Pin
them by exporting `CLIENT_PORT` / `SERVER_PORT` before running.

**Running many at once.** Ports won't collide, but each `dev:reload` is ~7
processes, loads the full server bundle, and opens a browser tab — so a dozen of
them is heavy. The Inspector is the expensive part; you rarely need its UI in
*every* worktree. Prefer `bun run dev:proxy` (just `mcpmon` — no ports, no
browser) in the worktrees that only need the server to hot-reload, and run the
full `dev:reload` only where you're actively inspecting. If you do want several
Inspectors, set `MCP_AUTO_OPEN_ENABLED=false` to skip the auto-opened tabs and
use the URL each run prints.

To auto-reload the **installed** extension inside Claude Desktop (instead of the
Inspector), point its launch command at the proxy:

```bash
bun run dev:proxy    # mcpmon --watch dist --ext cjs -- node dist/server.cjs
```

Use this as the server command in a dev build of `manifest.json` (the shipped
manifest launches `node dist/server.cjs` directly — don't ship `mcpmon`). Keep
`bun run dev` running alongside it so `dist/` stays current.

### Test in Claude Desktop (packaged)

1. `bun run pack`
2. Drag the resulting `openrecord.mcpb` into Claude Desktop → Settings → Extensions.
3. Open a new chat and ask Claude to "set up MyChart".

### Signing a release

```bash
bun run pack:signed   # pack, then sign with the Fan Pier Labs Developer ID
```

`scripts/sign-mcpb.mjs` appends a PKCS#7 signature made with
`Developer ID Application: Fan Pier Labs LLC (CA25MAKF9Z)`, then checks its own
work: `openssl cms -verify` over the exact bytes that were signed, and
`security verify-cert -p codeSign` over the chain — a policy that also rejects
an expired certificate, or one not valid for code signing.

**One-time setup.** `mcpb sign` wants the private key as a PEM file, and the
Developer ID key lives in the login keychain, which will not hand one out.
Export the identity once — Keychain Access → **login** → **My Certificates** →
right-click the Developer ID → **Export…** — save it as
`~/.config/fan-pier-labs/mcpb-signing.p12`, then store the passphrase it asked
for:

```bash
security add-generic-password -s mcpb-signing-p12 -a "$USER" -w
```

The script unpacks that bundle into a 0700 temp directory it deletes on the way
out, and passes the passphrase through the environment rather than argv.
`MCPB_SIGNING_P12` and `MCPB_SIGNING_P12_PASSWORD` (for CI) override the
defaults. Sign a freshly packed bundle — signing appends, so signing twice
nests one signature inside the next.

**What a signature buys today: nothing a user can see.** Both the `mcpb verify`
CLI (2.1.2) and the copy of that code bundled in Claude Desktop (1.34493.1)
verify a bundle by calling node-forge's `pkcs7.verify()`, which is a stub that
throws `PKCS#7 signature verification not yet implemented`; the caller catches
that and returns `status: "unsigned"`. **Every `.mcpb` reads as unsigned, signed
or not** — including one signed by `mcpb sign` itself. Nothing downstream can
tell the difference: the install preview, the `certificateFingerprint` recorded
in `extensions-installations.json`, and the `signature_info` sent to the
`can_install` API all see `unsigned`.

Signing anyway is cheap insurance for when that is fixed, and it is what the
**Require signed extensions** setting (`isDxtSignatureRequired`, off by default,
and enforceable by enterprise policy — "Reject desktop extensions that are not
signed by a trusted publisher") will gate on. Two things to know when it starts
to matter:

- **A Developer ID is a macOS-only credential here.** Verification runs against
  the OS trust store, so Windows would build the chain against the Windows root
  store, which does not carry Apple's roots — a Developer ID signature would
  read as untrusted there even once the verifier works. Windows users need a
  certificate from a CA in the Microsoft root program.
- **The verifier takes `certificates[0]` as the signer** rather than following
  the `SignerInfo`, which is why the chain is passed to `mcpb sign` via `-i`
  (leaf first) instead of being folded into the certificate file.
