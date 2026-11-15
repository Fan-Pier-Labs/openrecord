// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * OpenRecord's stdio MCP server — the same server for every host: the Claude
 * Desktop extension's `index.ts` and `mychart-cli mcp`. What differs between
 * them is the `McpHost` each passes in. Tools are in ./tools.ts, sessions in
 * ./session-manager.ts.
 *
 * No configuration is required: all auth happens in chat through the
 * setup_account tool (or the setup widget, on hosts that have it).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setLogSink } from '../../../shared/logger';
import { setTelemetryApp } from '../../../shared/telemetry';
import { registerAllTools } from './tools';
import { clearAllSessions } from './session-manager';
import { SETUP_UI_MIME_TYPE, SETUP_UI_RESOURCE_META } from './ui';
import { startDirectoryRefresh } from './directory-refresh';
import { startUpdateCheck } from './update-notice';
import { updateTarget, type McpHost } from './host';

/**
 * Stdio MCP transport requires stdout be ONLY JSON-RPC messages — anything else
 * corrupts the framing and the host reports "Unexpected token X is not valid
 * JSON". Every entry point calls this first, so the scraper logger singleton
 * writes to stderr. (The scrapers also avoid `console.*` directly; this is
 * belt-and-suspenders against any third-party module that doesn't.)
 */
export function routeLogsToStderr(): void {
  setLogSink((level, args) => {
    process.stderr.write(`[openrecord:${level}] ` + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\n');
  });
}

const SETUP_WIDGET_SECTION =
  '\n\n' +
  'Interactive Setup (Recommended for first-time setup):' +
  '\n  If the user has no configured account, call get_setup_widget() to display the ' +
  '  interactive login widget inline. This is the easiest way for users to enter ' +
  '  their MyChart hostname and sign in.';

function instructions(host: McpHost): string {
  return (
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
    (host.setupWidgetHtml ? SETUP_WIDGET_SECTION : '') +
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
    'user asks to include them. Never send one without their answer.'
  );
}

/** Serve OpenRecord over stdio until the client closes it. */
export async function startServer(host: McpHost): Promise<void> {
  setTelemetryApp(host.app, host.version);
  const server = new McpServer(
    { name: 'openrecord', version: host.version },
    { capabilities: { tools: {}, resources: {} }, instructions: instructions(host) },
  );

  const setupHtml = host.setupWidgetHtml;
  if (setupHtml) {
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
      }),
    );
  }

  registerAllTools(server, host);

  await server.connect(new StdioServerTransport());
  startDirectoryRefresh();
  void startUpdateCheck(updateTarget(host), host.version);

  // Clean up keepalive timers when the client closes stdio.
  const shutdown = () => {
    clearAllSessions();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('close', shutdown);
}
