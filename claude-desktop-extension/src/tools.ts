/**
 * Tool registry for the OpenRecord MCPB stdio MCP server.
 *
 * Two groups of tools:
 *   1. Meta tools — list_accounts, search_mycharts, setup_account, complete_2fa,
 *                   disconnect_account. These are MCPB-specific: they manage
 *                   the credentials stored on this machine, which is not
 *                   something the other clients share.
 *   2. Capability tools — one per entry in `shared/capabilities.ts`, which is
 *                   the single source of truth for what OpenRecord can do with
 *                   a MyChart account. Nothing in this file decides what the
 *                   extension supports; add a capability there and it appears
 *                   here, in the CLI, in the npm client and in the mobile app.
 *
 * Every capability tool takes a REQUIRED `account` parameter (the MyChart
 * hostname returned by list_accounts). Multiple accounts can be configured
 * and connected at once; there is no "active account" state.
 *
 * There IS an "active patient" per account, but it lives on MyChart's server
 * (proxy access — a parent reading a child's chart). Scraper tools take an
 * optional `patient` and assert the active record before running; only
 * switch_proxy_target changes it. See scrapers/myChart/proxyTools.ts.
 *
 * Setup is a sequence of explicit tool calls (no MCP elicitation):
 *   list_accounts                                  // see what's already set up
 *   search_mycharts(query="uchealth")              // find the hostname for a new account
 *   setup_account(hostname, username, password)    // attempt login
 *   complete_2fa(pending_id, code)                 // only if setup_account said need_2fa
 *   register_passkey(account)                      // optional: skip 2FA on future sessions
 */

import { z, type ZodRawShape, type ZodTypeAny } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type MyChartRequest } from '../../scrapers/myChart/myChartRequest';

import { myChartUserPassLogin, complete2faFlow } from '../../scrapers/myChart/login';
import { setupPasskey } from '../../scrapers/myChart/setupPasskey';
import { serializeCredential } from '../../scrapers/myChart/softwareAuthenticator';

import {
  ACCOUNT_PARAM,
  CAPABILITIES,
  PATIENT_PARAM,
  acceptsPatientParam,
  executeCapability,
  readAccountArg,
  type Capability,
  type CapabilityContext,
  type CapabilityParam,
  type StudyImagePayload,
} from '../../shared/capabilities';

import { searchInstances } from './instances';
import {
  resolveSession,
  isConnected,
  clearSession,
  adoptSession,
} from './session-manager';
import {
  readAccounts,
  readAccountPasskey,
  removeAccount,
  upsertAccount,
  saveAccountPasskey,
  saveAccountTotpSecret,
  normalizeHostname,
  findAccount,
} from './credential-store';
import { addPending, takePending } from './pending-logins';
import { encodeStudyJpegs } from './imaging/download-study';

// ── Result helpers ──────────────────────────────────────────────────────────

type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };
type ToolResult = { content: ToolContent[]; isError?: boolean };

function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ── Auto-register a passkey on first login ─────────────────────────────────

/**
 * Best-effort: register a passkey on the just-logged-in session so future
 * launches skip the password + 2FA prompt entirely. Silently no-ops if a
 * passkey is already saved, or if the instance disables passkey registration.
 * Returns { registered, reason } — reason explains why on failure so the
 * outcome is visible in the tool result (stderr from this process is not
 * captured by Claude Desktop's log).
 */
async function tryAutoRegisterPasskey(
  hostname: string,
  session: MyChartRequest,
): Promise<{ registered: boolean; reason?: string }> {
  const key = normalizeHostname(hostname);
  if (readAccountPasskey(key)) {
    return { registered: false, reason: 'already_saved' };
  }
  try {
    const credential = await setupPasskey(session);
    if (!credential) {
      return { registered: false, reason: 'instance_returned_no_credential' };
    }
    saveAccountPasskey(key, serializeCredential(credential));
    return { registered: true };
  } catch (err) {
    return { registered: false, reason: `error: ${(err as Error).message}` };
  }
}

// ── Capability → MCP tool ──────────────────────────────────────────────────

/**
 * The registry declares the account selector; this client makes it required.
 * Several accounts can be connected at once and the MCPB has no notion of a
 * "current" one, so every call has to name its account.
 */
const ACCOUNT_SCHEMA = z
  .string()
  .describe(`${ACCOUNT_PARAM.description} Get the exact value from list_accounts.`);

/** Translate one registry parameter into its zod equivalent. */
function zodForParam(param: CapabilityParam): ZodTypeAny {
  let schema: ZodTypeAny;
  switch (param.type) {
    case 'number': {
      let n = z.number();
      if (param.min !== undefined) n = n.min(param.min);
      if (param.max !== undefined) n = n.max(param.max);
      schema = n;
      break;
    }
    case 'boolean':
      schema = z.boolean();
      break;
    case 'object':
      schema = z.unknown();
      break;
    default:
      schema = z.string();
  }
  schema = schema.describe(param.description);
  return param.required ? schema : schema.optional();
}

/**
 * Per-account context for the capabilities that touch stored credentials
 * (TOTP setup/disable, passkey registration). Reads the MCPB's own credential
 * store; the registry never knows where any of it lives.
 */
function contextFor(hostname: string): CapabilityContext {
  const key = normalizeHostname(hostname);
  const account = findAccount(key);
  return {
    password: account?.password,
    totpSecret: account?.totpSecret,
    saveTotpSecret: (secret: string) => { saveAccountTotpSecret(key, secret); },
    savePasskey: (serialized: string) => saveAccountPasskey(key, serialized),
  };
}

/**
 * Register one capability as an MCP tool. `kind` controls the annotations
 * Claude Desktop uses for grouping:
 *   - 'read'             → readOnlyHint: true
 *   - 'write' | 'account'→ readOnlyHint: false, destructiveHint: true
 *
 * `account`-kind capabilities change how the patient signs in. The MCPB's only
 * surface is tools, so they are registered — but flagged destructive, the way
 * disconnect_account already is.
 */
function registerCapabilityTool(server: McpServer, capability: Capability): void {
  const shape: Record<string, ZodTypeAny> = { [ACCOUNT_PARAM.name]: ACCOUNT_SCHEMA };
  // Which patient the call is about, for accounts with proxy access to family
  // members' charts. executeCapability asserts it — or the account holder,
  // when omitted — before the capability runs, so a read refuses rather than
  // silently returning the wrong family member's chart.
  if (acceptsPatientParam(capability)) shape.patient = zodForParam(PATIENT_PARAM);
  for (const param of capability.params) shape[param.name] = zodForParam(param);

  const annotations =
    capability.kind === 'read'
      ? { title: capability.title, readOnlyHint: true, openWorldHint: true }
      : { title: capability.title, readOnlyHint: false, destructiveHint: true, openWorldHint: true };

  server.registerTool(
    capability.id,
    {
      description: capability.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: shape as any,
      annotations,
    },
    async (args: Record<string, unknown>) => {
      try {
        const account = readAccountArg(args) ?? '';
        const session = await resolveSession(account);
        // The flag, not the id: a second media capability must not need this
        // branch edited. `run` hands back raw bytes; this client encodes them.
        if (capability.rendersMedia) {
          return await imagingResult(capability, session, args);
        }
        // executeCapability, not capability.run: the active-patient assertion
        // lives there, so every client gets it without remembering to.
        return jsonResult(await executeCapability(session, capability.id, args, contextFor(account)));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}

/**
 * `download_imaging_study` is the one capability whose payload isn't JSON: it
 * returns raw CLO bytes that this client encodes itself. One image content
 * block per picture, so Claude Desktop renders the actual X-ray instead of a
 * base64 blob buried in JSON text.
 */
async function imagingResult(
  capability: Capability,
  session: MyChartRequest,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const payload = (await capability.run(session, args)) as StudyImagePayload;
  const maxImages = typeof args.max_images === 'number' ? args.max_images : undefined;
  const jpegQuality = typeof args.jpeg_quality === 'number' ? args.jpeg_quality : undefined;
  const result = encodeStudyJpegs(payload, { maxImages, jpegQuality });

  const content: ToolContent[] = [
    {
      type: 'text',
      text: JSON.stringify(
        {
          study_name: result.studyName,
          total_images: result.totalImages,
          returned: result.returned,
          ...(result.errors.length ? { errors: result.errors } : {}),
        },
        null,
        2,
      ),
    },
  ];

  for (const img of result.images) {
    content.push({ type: 'image', data: img.jpegBase64, mimeType: 'image/jpeg' });
  }

  if (result.returned === 0) {
    content.push({
      type: 'text',
      text:
        'No images could be downloaded for this study. ' +
        (result.errors.length
          ? 'See the errors above.'
          : 'The study may not expose viewable image data, or the viewer session expired — try get_imaging_results again for a fresh image_id.'),
    });
  }

  return { content };
}

// ── Public: register everything on the server ──────────────────────────────

export function registerAllTools(server: McpServer): void {
  // ── Meta tools ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_accounts',
    {
      title: 'List configured accounts',
      description: 'Returns every MyChart account whose credentials are already saved on this machine. Every entry in `accounts` is fully configured — pass its `hostname` as the `account` parameter to any data tool. NEVER ask the user for credentials again for an account that appears here, regardless of the `sessionActive` flag (sessions are created on-demand by the next tool call).',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const accounts = readAccounts();
      const accountList = accounts.map(a => ({
        account: a.hostname,
        hostname: a.hostname,
        username: a.username,
        configured: true,
        sessionActive: isConnected(a.hostname),
        hasPasskey: !!readAccountPasskey(a.hostname),
        hasTotpSecret: !!a.totpSecret,
      }));

      const result: ToolResult = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: accounts.length, accounts: accountList }, null, 2),
          },
        ],
      };

      if (accounts.length === 0) {
        result.content.push({
          type: 'text',
          text: '\nNo MyChart accounts are configured yet. Call get_setup_widget to display the interactive connection widget.',
        });
      } else {
        result.content.push({
          type: 'text',
          text:
            '\nThese accounts are already configured — credentials are stored on disk. ' +
            'Call data tools directly with `account: <hostname>`; login + 2FA happen automatically via the saved passkey or password. ' +
            'DO NOT re-prompt the user for username, password, or hostname. ' +
            '`sessionActive: false` just means no in-memory session yet; the next tool call will create one transparently.',
        });
      }

      return result;
    },
  );

  server.registerTool(
    'get_setup_widget',
    {
      title: 'Get interactive setup widget',
      description: 'Display an interactive widget for connecting a MyChart account. Use this if the user wants a GUI instead of chat-based setup.',
      inputSchema: {} satisfies ZodRawShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { 'openai/outputTemplate': 'ui://openrecord/setup', ui: { resourceUri: 'ui://openrecord/setup' } },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text: 'Enter your MyChart hostname, username, and password in the widget to connect your account.',
        },
      ],
    }),
  );

  server.registerTool(
    'search_mycharts',
    {
      title: 'Search the MyChart directory',
      description: "Look up a MyChart hostname for setup. Type a few letters of the user's health system name (e.g. \"uchealth\", \"mass general\"). Returns matching entries with their hostname, display name, and logo URL. Pass the chosen `hostname` to setup_account.",
      inputSchema: {
        query: z.string().min(1).describe('Substring of the health system name to search for (case-insensitive).'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum results to return (default 10).'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      const matches = searchInstances(query, limit ?? 10);
      return jsonResult({
        query,
        count: matches.length,
        matches: matches.map(m => ({ hostname: m.hostname, name: m.name, logoUrl: m.logoUrl, loginUrl: m.url })),
      });
    },
  );

  server.registerTool(
    'setup_account',
    {
      title: 'Set up a MyChart account (step 1)',
      description: "Attempt to log into MyChart and save the account for future calls. The model should first ask the user for their MyChart hostname (use search_mycharts to look it up) and credentials in chat, then call this tool. Returns one of: `{state:\"logged_in\", account}`, `{state:\"need_2fa\", pending_id, delivery, target}` (call complete_2fa next with the user-supplied code), or `{state:\"invalid_login\"}`.",
      inputSchema: {
        hostname: z.string().describe('MyChart hostname, e.g. "mychart.example.org". From search_mycharts or the user.'),
        username: z.string().describe('MyChart username (ask the user).'),
        password: z.string().describe('MyChart password (ask the user). Stored locally on disk, never transmitted to Anthropic.'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ hostname, username, password }) => {
      try {
        const result = await myChartUserPassLogin({ hostname, user: username, pass: password });

        if (result.state === 'logged_in') {
          upsertAccount({ hostname: normalizeHostname(hostname), username, password });
          await adoptSession(hostname, result.mychartRequest);
          const passkey = await tryAutoRegisterPasskey(hostname, result.mychartRequest);
          return jsonResult({
            state: 'logged_in',
            account: normalizeHostname(hostname),
            passkey_registered: passkey.registered,
            passkey_reason: passkey.reason ?? null,
            message: passkey.registered
              ? 'Account connected and passkey saved — future sessions will skip the password and 2FA prompts.'
              : `Account connected. Passkey auto-registration outcome: ${passkey.reason ?? 'unknown'}.`,
          });
        }

        if (result.state === 'invalid_login') {
          return jsonResult({
            state: 'invalid_login',
            account: normalizeHostname(hostname),
            message: 'MyChart rejected those credentials. Double-check the username + password with the user and call setup_account again.',
          });
        }

        if (result.state === 'need_2fa') {
          const pending_id = addPending({
            hostname: normalizeHostname(hostname),
            username,
            password,
            mychartRequest: result.mychartRequest,
          });
          return jsonResult({
            state: 'need_2fa',
            pending_id,
            account: normalizeHostname(hostname),
            delivery: result.twoFaDelivery ?? null,
            message: 'MyChart sent a 6-digit verification code. Ask the user for it, then call complete_2fa with this pending_id and the code.',
          });
        }

        return jsonResult({
          state: result.state,
          account: normalizeHostname(hostname),
          error: result.error ?? null,
          message: `Login ended in unexpected state: ${result.state}. Tell the user and try again.`,
        });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.registerTool(
    'complete_2fa',
    {
      title: 'Finish 2FA (step 2)',
      description: 'Finish a setup_account flow that returned `need_2fa`. Pass the `pending_id` from that response and the 6-digit code the user gave you. On success the account is saved and immediately usable.',
      inputSchema: {
        pending_id: z.string().describe('The pending_id returned by setup_account when state was need_2fa.'),
        code: z.string().describe('6-digit code the user read from email/SMS/authenticator.'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ pending_id, code }) => {
      const pending = takePending(pending_id);
      if (!pending) {
        return errorResult('pending_id is unknown or has expired (10-minute TTL). Call setup_account again to start over.');
      }
      try {
        const trimmed = code.trim();
        const twoFa = await complete2faFlow({
          mychartRequest: pending.mychartRequest,
          code: trimmed,
          isTOTP: false,
        });
        if (twoFa.state === 'logged_in') {
          upsertAccount({ hostname: pending.hostname, username: pending.username, password: pending.password });
          await adoptSession(pending.hostname, twoFa.mychartRequest);
          const passkey = await tryAutoRegisterPasskey(pending.hostname, twoFa.mychartRequest);
          return jsonResult({
            state: 'logged_in',
            account: pending.hostname,
            passkey_registered: passkey.registered,
            passkey_reason: passkey.reason ?? null,
            message: passkey.registered
              ? 'Account connected and passkey saved — future sessions will skip the password and 2FA prompts.'
              : `Account connected. Passkey auto-registration outcome: ${passkey.reason ?? 'unknown'}.`,
          });
        }
        if (twoFa.state === 'invalid_2fa') {
          // Re-stash so the agent can ask the user again without restarting.
          const newPendingId = addPending({
            hostname: pending.hostname,
            username: pending.username,
            password: pending.password,
            mychartRequest: pending.mychartRequest,
          });
          return jsonResult({
            state: 'invalid_2fa',
            pending_id: newPendingId,
            account: pending.hostname,
            message: 'That code was rejected. Ask the user for the code again and call complete_2fa with this new pending_id.',
          });
        }
        return jsonResult({
          state: twoFa.state,
          account: pending.hostname,
          message: `Unexpected 2FA result: ${twoFa.state}. Tell the user and call setup_account again.`,
        });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  // register_passkey is NOT declared here — it is a capability
  // (`shared/capabilities.ts`) so the CLI and the mobile app expose the same
  // thing, and it is registered by the loop at the bottom of this function.

  server.registerTool(
    'disconnect_account',
    {
      title: 'Forget a MyChart account',
      description: 'Forget a saved MyChart account. Deletes the local credentials, passkey, and cached session for this hostname.',
      inputSchema: {
        account: z.string().describe('MyChart hostname (the account from list_accounts).'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ account }) => {
      clearSession(account);
      const removed = removeAccount(account);
      const known = findAccount(account);
      if (!removed && !known) return textResult(`No saved account for ${account}.`);
      return textResult(`Forgot ${normalizeHostname(account)}. Credentials, passkey, and session cache have been deleted from disk.`);
    },
  );

  // ── Capability tools ──────────────────────────────────────────────────────
  //
  // Derived, not listed. `shared/capabilities.ts` is the single source of
  // truth for what OpenRecord can do with a MyChart account; every entry there
  // becomes a tool here automatically, so this extension can never quietly
  // support less than the CLI or the mobile app does.

  for (const capability of CAPABILITIES) {
    registerCapabilityTool(server, capability);
  }
}
