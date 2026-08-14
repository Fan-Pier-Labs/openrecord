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
3. **`complete_2fa(pending_id, code)`** — if MyChart requires 2FA, Claude
   asks you for the 6-digit code.
4. **`register_passkey(account)`** — (optional, recommended) future logins
   skip the password and 2FA prompts entirely.

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
  `node_modules/@napi-rs/`.

  `@napi-rs/keyring` is a normal `dependencies` entry. Its *binaries* are
  twelve separate packages it lists in its own `optionalDependencies`, gated on
  `os`/`cpu` — the standard way prebuilt-binary packages ship (esbuild has 26,
  rollup 27). A normal `bun install` resolves just the slice matching your
  machine, which is what you want day to day.

  Packing needs four at once, so `bun run pack` runs
  `bun install --os='*' --cpu='*'` first. That resolves *every* slice including
  ~9 MB of Linux and FreeBSD builds, so `.mcpbignore` names the four that ship
  (macOS arm64/x64, Windows x64/arm64) and `scripts/verify-native-binaries.mjs`
  refuses to pack if one is missing — a missing binary means plaintext
  credentials on that platform with no other symptom. Linux is not bundled:
  Claude Desktop has no Linux build, and the fallback covers it.

## File layout

```
claude-desktop-extension/
├── manifest.json           # MCPB manifest (see https://github.com/modelcontextprotocol/mcpb)
├── package.json
├── tsup.config.ts          # CJS bundle for Claude Desktop's Node (@napi-rs/keyring stays external)
├── icon.png                # 256×256 extension icon
├── scripts/
│   └── fetch-native-binaries.mjs  # pulls every platform's keyring binary before packing
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
bun run pack       # build + run `mcpb pack` → openrecord.mcpb
```

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
