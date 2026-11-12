#!/usr/bin/env node
// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

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
 * Claude Desktop runs `dist/launcher.cjs`, which runs this bundle (`server.cjs`,
 * or a newer download of it) as a child — see src/launcher/. No
 * user_config is required — all auth happens via the in-chat setup_account
 * tool, which uses MCP elicitation to deterministically collect each field
 * (instance picker → username + password → 2FA → passkey opt-in).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools';
import { clearAllSessions } from './session-manager';
import setupWidget from 'virtual:setup-widget';
import { buildSetupUiHtml, SETUP_UI_MIME_TYPE, SETUP_UI_RESOURCE_META } from './ui';
import { startDirectoryRefresh } from './directory-refresh';
import { setTelemetryApp } from '../../shared/telemetry';
import { version as MCPB_VERSION } from '../manifest.json';
import { updateInstalledBinary } from './google-calendar/applet';

async function main(): Promise<void> {
  setTelemetryApp('mcpb', MCPB_VERSION);
  const server = new McpServer(
    {
      name: 'openrecord',
      version: '2.1.0',
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
        'returns `count: 0` or if a data tool says the saved password was rejected.' +
        '\n\n' +
        'If a data tool returns `state: "need_2fa"`, signing in made MyChart text or email the user a ' +
        'verification code. Ask the user for it, call complete_2fa(pending_id, code), then repeat the ' +
        'data tool call. Do not call setup_account for this — the account is already saved.' +
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
        '\n  4. On `logged_in`, do what that result\'s `message` field says — it recommends a passkey ' +
        '     and explains what one changes. NEVER call register_passkey (or any other tool that ' +
        '     alters how an account signs in) unless the user has explicitly said yes to it.' +
        '\n  5. Use the data tools (get_medications, get_lab_results, send_message, etc.) with the ' +
        '     `account` from the previous step.' +
        '\n\n' +
        'Long tool calls: a call that has not answered after 2.5 minutes keeps running in the background ' +
        'and returns a note carrying an id instead of its result; collect the result with ' +
        'check_pending_call(id). Never repeat that call with the same arguments while it is pending — it ' +
        'is already running and would be refused, and a tool that sends something would send it twice. ' +
        'Other tools are unaffected, except switch_proxy_target on that account, which waits for the read.' +
        '\n\n' +
        'Public information (no account): get_hospital_info(hostname) returns what a MyChart ' +
        'instance publishes about its health system to anyone — support phone lines, the bookable ' +
        'provider directory with clinic addresses, and billing entities. Use search_mycharts to find ' +
        'the hostname first. It never returns a fax number or an accepted-insurance list; MyChart ' +
        'does not publish those.' +
        '\n\n' +
        'Missing features: if the user asks for something about their health records or MyChart that no ' +
        'OpenRecord tool can do, say OpenRecord can\'t do that yet, say the developers would love to hear ' +
        'what they\'re trying to do, and offer to send them a short description with send_feature_request. ' +
        'Give three choices: (1) send it with their name, email and health system so the developers can ' +
        'reply, the default; (2) send it without their name, email or health system; (3) send nothing. For ' +
        'choice 1, ask the user for their name and email rather than reading them from MyChart, and use the ' +
        'health system of the account they are using; for choice 2, pass only `request`. Describe the ' +
        'feature, not their chart: leave out diagnoses, medications, results and dates of care unless the ' +
        'user asks to include them. Never send one without their answer.',
    },
  );

  // ── Resources ─────────────────────────────────────────────────────────────

  // Serve the interactive setup widget HTML.
  const setupHtml = buildSetupUiHtml(setupWidget);
  // The CSP goes on both the listing (what the host reviews when it connects)
  // and the content item (what it applies when it renders); the content item wins.
  server.registerResource(
    'setup-ui',
    'ui://openrecord/setup',
    {
      title: 'Connect MyChart (Setup Widget)',
      mimeType: SETUP_UI_MIME_TYPE,
      _meta: SETUP_UI_RESOURCE_META,
    },
    () => ({
      contents: [{
        uri: 'ui://openrecord/setup',
        mimeType: SETUP_UI_MIME_TYPE,
        text: setupHtml,
        _meta: SETUP_UI_RESOURCE_META,
      }],
    })
  );

  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  startDirectoryRefresh();
  updateInstalledBinary().catch((err: unknown) => {
    console.error('[openrecord] calendar sync app update failed:', err instanceof Error ? err.message : err);
  });

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
