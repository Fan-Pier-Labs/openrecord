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

## Updates

Sideloaded `.mcpb` extensions have no auto-update channel — Claude Desktop only
auto-updates extensions installed from the Anthropic directory, and the manifest
spec has no update-feed field. So this extension checks for updates itself:

- **Releasing**: pushing a `mcpb-v<version>` tag runs
  `.github/workflows/release-mcpb.yml`, which verifies the tag matches
  `manifest.json`, builds the bundle, and publishes a GitHub Release with
  `openrecord.mcpb` attached. Bump the version first with
  `bun dev-scripts/bump-mcpb-version.ts <version>` (syncs `manifest.json` +
  `package.json`; `version-sync.unit.test.ts` fails the build if they drift).
- **Noticing**: on startup the server checks the repo's GitHub Releases for the
  newest `mcpb-v*` tag (at most one live check per 24h, state in
  `~/.openrecord-mcpb/update-check.json`). When a newer release exists, a
  one-line notice is appended to the next tool result, so Claude tells the user
  where to download the new bundle. The `check_for_updates` tool does an
  immediate, throttle-free check on demand.
- **Installing an update**: download the new `openrecord.mcpb` and open it —
  Claude Desktop upgrades the extension in place. Credentials, passkeys and
  sessions live in `~/.openrecord-mcpb/`, outside the bundle, so they survive
  every upgrade (and uninstall/reinstall too).
- **Opting out**: the check is notify-only — nothing is ever downloaded or
  executed automatically — but it is also the one outbound connection this
  server makes on its own (`api.github.com`, at most once per day), so it has
  an off switch: the **Disable update checks** toggle in the extension's
  settings in Claude Desktop (or the `OPENRECORD_DISABLE_UPDATE_CHECK` env
  var directly). Disabled means no update traffic at all; `check_for_updates`
  then reports that checks are off instead of fetching.

The check is deliberately failure-silent: no network, a rate-limited API, or a
garbage response all degrade to "no notice" — an update check must never break
a health-data tool call.

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
- **Pure JS** — no `sharp`, no `keytar`, no `sqlite3`. CLO → JPEG imaging
  conversion uses [`jpeg-js`](https://www.npmjs.com/package/jpeg-js).
- **Local storage** — credentials and sessions live at `~/.openrecord-mcpb/`,
  keyed by (hostname, username) so several logins on one hostname never share
  or overwrite each other's identity:
  - `accounts.json` — username/password rows (file mode 0600)
  - `passkeys/<hostname>/<username>.json` — WebAuthn credentials
  - `sessions/<hostname>/<username>.json` — serialized cookie jars for fast resume

## File layout

```
claude-desktop-extension/
├── manifest.json           # MCPB manifest (see https://github.com/modelcontextprotocol/mcpb)
├── package.json
├── tsup.config.ts          # single-file CJS bundle for Claude Desktop's Node
├── icon.png                # 256×256 extension icon
└── src/
    ├── index.ts            # stdio entry
    ├── tools.ts            # account meta tools + one tool per shared capability
    ├── setup-flow.ts       # elicitation-driven setup wizard
    ├── session-manager.ts  # per-account session cache with keepalive + passkey auto-login
    ├── credential-store.ts # ~/.openrecord-mcpb/ persistence
    ├── instances.ts        # picker data (sourced from scrapers/list-all-mycharts/)
    └── imaging/            # pure-JS CLO → JPEG encoder
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
