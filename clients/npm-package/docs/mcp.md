# `mychart-cli mcp` — OpenRecord in any MCP client

`mychart-cli mcp` runs OpenRecord's MCP server over stdio: every capability in
[capabilities.md](capabilities.md) as a tool, plus sign-in, 2FA and passkeys from inside the chat.
It is the same server the Claude Desktop extension runs, so use it for every other MCP client —
Claude Code, Cursor, VS Code, Windsurf, Cline, and so on.

Requires Node 18 or later. Provided as-is and used at your own risk; not affiliated with Epic or
MyChart, and its use may violate Epic's terms of service.

## Add it to your client

**Claude Code**

```bash
claude mcp add openrecord -- npx -y mychart-cli mcp
```

**Cursor** — `~/.cursor/mcp.json`; **Claude Desktop** without the extension, Windsurf, Cline and
most others use the same shape:

```json
{
  "mcpServers": {
    "openrecord": { "command": "npx", "args": ["-y", "mychart-cli", "mcp"] }
  }
}
```

**VS Code** — `.vscode/mcp.json`:

```json
{
  "servers": {
    "openrecord": { "type": "stdio", "command": "npx", "args": ["-y", "mychart-cli", "mcp"] }
  }
}
```

## Sign in

Ask the assistant to "set up my MyChart". It finds your health system with `search_mycharts`, asks
for your username and password, signs in with `setup_account`, asks you for the 2FA code if MyChart
sends one, and then offers a passkey so later sessions sign in without a password or code. Nothing
is configured in the JSON above, and no credential ever goes in it.

## Where accounts are kept

In the OS keystore (macOS Keychain, Windows Credential Manager, or the Secret Service on Linux)
under `openrecord-mcpb`, with non-secret details in `~/.openrecord-mcpb/`. That is the same store
the Claude Desktop extension uses, so an account set up in one works in the other. Where no keystore
is available the secrets fall back to a private (0600) file there; `list_accounts` reports which
one is in use as `secretStorage`.

## Differences from the Claude Desktop extension

- No setup widget: sign-in happens in the chat.
- No Google Calendar sync (it installs a macOS menu-bar app that ships with the extension).
- The update notice points at the npm package rather than the `.mcpb`.

## Telemetry

The same as the CLI's — see the README's [Telemetry](../README.md#telemetry) section, including how
to turn it off with `MYCHART_CLI_TELEMETRY_DISABLED=1` in the server's `env`.
