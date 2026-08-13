#!/usr/bin/env node
// Stdio MCP transport requires stdout be ONLY JSON-RPC messages — anything
// else corrupts the framing and the host (Claude Desktop) reports
// "Unexpected token X is not valid JSON". Configure the scraper logger
// singleton to route every message to stderr BEFORE any scraper module is
// imported. (The scrapers also avoid using `console.*` directly; this is
// belt-and-suspenders against any third-party module that doesn't.)
import { setLogSink } from '../../shared/logger';
setLogSink((level, args) => {
  process.stderr.write(`[openrecord:${level}] ` + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n');
});

/**
 * OpenRecord MCPB — Claude Desktop Extension entry point.
 *
 * Stdio MCP server that speaks the 2025-06-18 protocol (so it can use
 * elicitation). Delegates all tool implementation to ./tools.ts; the
 * setup wizard is in ./setup-flow.ts; session management in ./session-manager.ts.
 *
 * The bundle is run by Claude Desktop as `node dist/server.cjs`. No
 * user_config is required — all auth happens via the in-chat setup_account
 * tool, which uses MCP elicitation to deterministically collect each field
 * (instance picker → username + password → 2FA → passkey opt-in).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools';
import { clearAllSessions } from './session-manager';
import { buildSetupUiHtml, SETUP_UI_MIME_TYPE } from './ui';

async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: 'openrecord',
      version: '0.1.0',
    },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        'OpenRecord connects this conversation to the user\'s MyChart patient portal. ' +
        '\n\n' +
        'EVERY data tool requires an `account` parameter — the MyChart hostname returned by ' +
        'list_accounts. If you do not already know which account to use, call list_accounts ' +
        'first. Multiple accounts can be active at once; just pass a different `account` per call.' +
        '\n\n' +
        'Family records (proxy access): some MyChart accounts can also read family members\' charts ' +
        '(e.g. a parent reading a child\'s). Data tools always read whichever patient record is ACTIVE ' +
        'on MyChart\'s server. Call list_proxy_targets to see every accessible record and which is ' +
        'active; call switch_proxy_target to change it before reading a family member\'s data, and ' +
        'switch back to patient "me" when done. Data tools accept an optional `patient` parameter to ' +
        'assert who a call is about — they refuse with instructions, rather than silently reading the ' +
        'wrong person\'s chart, if the active record doesn\'t match.' +
        '\n\n' +
        'CRITICAL: If list_accounts returns any entries, those accounts are ALREADY SET UP. ' +
        'Do NOT ask the user for hostname, username, or password again. Just call the relevant ' +
        'data tool (get_profile, get_medications, etc.) with `account: <hostname>` and the server ' +
        'will silently re-authenticate using the saved passkey or password — no user interaction ' +
        'required. The `sessionActive: false` flag means "no live in-memory session"; it does NOT ' +
        'mean the account needs to be reconfigured. Only run the setup flow below if list_accounts ' +
        'returns `count: 0` or if a data tool fails with "invalid_login" or "no passkey/TOTP saved".' +
        '\n\n' +
        'Interactive Setup (Recommended for first-time setup):' +
        '\n  If the user has no configured account, call get_setup_widget() to display the ' +
        '  interactive login widget inline. This is the easiest way for users to enter ' +
        '  their MyChart hostname and sign in.' +
        '\n\n' +
        'Manual Setup Flow (only when list_accounts returns count: 0):' +
        '\n  1. Ask the user for their health system name. Call search_mycharts(query) to find the hostname.' +
        '\n  2. Ask the user for their MyChart username and password.' +
        '\n  3. Call setup_account(hostname, username, password). On `need_2fa`, ask the user for the ' +
        '     6-digit code, then call complete_2fa(pending_id, code). On `invalid_login`, ask again.' +
        '\n  4. A passkey is auto-registered on success (`passkey_registered: true`) so future ' +
        '     sessions skip the password + 2FA prompts entirely.' +
        '\n  5. Use the data tools (get_medications, get_lab_results, send_message, etc.) with the ' +
        '     `account` from the previous step.',
    },
  );

  // ── Resources ─────────────────────────────────────────────────────────────

  // Serve the interactive setup widget HTML.
  const setupHtml = buildSetupUiHtml();
  server.registerResource(
    'setup-ui',
    'ui://openrecord/setup',
    { title: 'Connect MyChart (Setup Widget)', mimeType: SETUP_UI_MIME_TYPE },
    () => ({
      contents: [{
        uri: 'ui://openrecord/setup',
        mimeType: SETUP_UI_MIME_TYPE,
        text: setupHtml,
      }],
    })
  );

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean up keepalive timers when the parent (Claude Desktop) closes stdio.
  const shutdown = () => {
    clearAllSessions();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('close', shutdown);
}

main().catch((err: unknown) => {
  console.error('[openrecord] fatal:', err);
  process.exit(1);
});
