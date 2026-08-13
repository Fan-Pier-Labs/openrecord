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

import { z, type ZodRawShape } from 'zod';
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
  accountId,
  lookupAccount,
  readAccounts,
  readAccountPasskey,
  removeAccount,
  upsertAccount,
  saveAccountPasskey,
  saveAccountTotpSecret,
  normalizeHostname,
} from './credential-store';
import { addPending, takePending } from './pending-logins';
import { encodeStudyJpegs } from './imaging/download-study';
import { checkForUpdate, takeUpdateNotice, STABLE_DOWNLOAD_URL } from './update-check';

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
  username: string,
  session: MyChartRequest,
): Promise<{ registered: boolean; reason?: string }> {
  const key = normalizeHostname(hostname);
  // Passkeys are per (hostname, username): another user's passkey on the same
  // hostname must not suppress this one's registration.
  if (readAccountPasskey(key, username)) {
    return { registered: false, reason: 'already_saved' };
  }
  try {
    const credential = await setupPasskey(session);
    if (!credential) {
      return { registered: false, reason: 'instance_returned_no_credential' };
    }
    saveAccountPasskey(key, username, serializeCredential(credential));
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
  .describe(
    'Which connected MyChart account to use, as `username@hostname`. Get the exact value from the `account` field of list_accounts.',
  );

/** Translate one registry parameter into its zod equivalent. */
function zodForParam(param: CapabilityParam): z.ZodType {
  let schema: z.ZodType;
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
function contextFor(ref: string): CapabilityContext {
  const account = lookupAccount(ref);
  if (!account) return {};
  const { hostname, username } = account;
  return {
    password: account.password,
    totpSecret: account.totpSecret,
    saveTotpSecret: (secret: string) => { saveAccountTotpSecret(hostname, username, secret); },
    savePasskey: (serialized: string) => saveAccountPasskey(hostname, username, serialized),
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
  const shape: Record<string, z.ZodType> = { [ACCOUNT_PARAM.name]: ACCOUNT_SCHEMA };
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
    withUpdateNotice(async (args: Record<string, unknown>) => {
      try {
        const account = readAccountArg(args) ?? '';
        const session = await resolveSession(account);
        // executeCapability, not capability.run, for EVERY capability: the
        // active-patient assertion lives there. Branching to a direct
        // `capability.run` for the imaging tool is how that one tool ended up
        // returning a family member's X-rays.
        const payload = await executeCapability(session, capability.id, args, contextFor(account));
        // The flag, not the id — and it decides how to RENDER the payload,
        // never whether the guard ran.
        if (capability.rendersMedia) {
          return imagingResult(payload as StudyImagePayload);
        }
        return jsonResult(payload);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    }),
  );
}

/**
 * `download_imaging_study` is the one capability whose payload isn't JSON: it
 * returns raw CLO bytes that this client encodes itself. One image content
 * block per picture, so Claude Desktop renders the actual X-ray instead of a
 * base64 blob buried in JSON text.
 *
 * Takes the payload rather than running the capability, so it cannot become a
 * second path around the active-patient assertion.
 */
function imagingResult(
  payload: StudyImagePayload,
): ToolResult {
  const result = encodeStudyJpegs(payload);

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

// ── Update notice ───────────────────────────────────────────────────────────

/**
 * Wrap a tool handler so a pending update notice (see update-check.ts) is
 * appended to its successful result. The notice is one-shot, so it rides on
 * whichever wrapped tool the model happens to call first after the startup
 * check resolves. Every registration in this file wraps its handler —
 * capability tools get it via registerCapabilityTool, so only the
 * hand-written meta tools name it explicitly.
 */
function withUpdateNotice<Args extends unknown[]>(
  handler: (...args: Args) => ToolResult | Promise<ToolResult>,
): (...args: Args) => Promise<ToolResult> {
  return async (...args) => {
    const result = await handler(...args);
    const notice = takeUpdateNotice();
    if (notice && !result.isError) {
      result.content.push({ type: 'text', text: notice });
    }
    return result;
  };
}

// ── Public: register everything on the server ──────────────────────────────

export function registerAllTools(server: McpServer): void {
  // ── Meta tools ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_accounts',
    {
      title: 'List configured accounts',
      description: 'Returns every MyChart account whose credentials are already saved on this machine. Every entry in `accounts` is fully configured — pass its `account` id (`username@hostname`) as the `account` parameter to any data tool. NEVER ask the user for credentials again for an account that appears here, regardless of the `sessionActive` flag (sessions are created on-demand by the next tool call).',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    withUpdateNotice(() => {
      const accounts = readAccounts();
      const accountList = accounts.map(a => ({
        account: accountId(a),
        hostname: a.hostname,
        username: a.username,
        configured: true,
        sessionActive: isConnected(accountId(a)),
        hasPasskey: !!readAccountPasskey(a.hostname, a.username),
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
            'Call data tools directly with `account: <the account id above>`; login + 2FA happen automatically via the saved passkey or password. ' +
            'DO NOT re-prompt the user for username, password, or hostname. ' +
            '`sessionActive: false` just means no in-memory session yet; the next tool call will create one transparently.',
        });
      }

      return result;
    }),
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
    withUpdateNotice(() => ({
      content: [
        {
          type: 'text',
          text: 'Enter your MyChart hostname, username, and password in the widget to connect your account.',
        },
      ],
    })),
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
    withUpdateNotice(({ query, limit }) => {
      const matches = searchInstances(query, limit ?? 10);
      return jsonResult({
        query,
        count: matches.length,
        matches: matches.map(m => ({ hostname: m.hostname, name: m.name, logoUrl: m.logoUrl, loginUrl: m.url })),
      });
    }),
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
    withUpdateNotice(async ({ hostname, username, password }) => {
      try {
        const result = await myChartUserPassLogin({ hostname, user: username, pass: password });

        if (result.state === 'logged_in') {
          upsertAccount({ hostname: normalizeHostname(hostname), username, password });
          await adoptSession(hostname, username, result.mychartRequest);
          const passkey = await tryAutoRegisterPasskey(hostname, username, result.mychartRequest);
          return jsonResult({
            state: 'logged_in',
            account: accountId({ hostname, username }),
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
    }),
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
    withUpdateNotice(async ({ pending_id, code }) => {
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
          await adoptSession(pending.hostname, pending.username, twoFa.mychartRequest);
          const passkey = await tryAutoRegisterPasskey(pending.hostname, pending.username, twoFa.mychartRequest);
          return jsonResult({
            state: 'logged_in',
            account: accountId(pending),
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
    }),
  );

  // register_passkey is NOT declared here — it is a capability
  // (`shared/capabilities.ts`) so the CLI and the mobile app expose the same
  // thing, and it is registered by the loop at the bottom of this function.

  server.registerTool(
    'disconnect_account',
    {
      title: 'Forget a MyChart account',
      description: 'Forget a saved MyChart account. Deletes the local credentials, passkey, and cached session for this login only — other usernames saved for the same hostname are untouched.',
      inputSchema: {
        account: z.string().describe('Account id from list_accounts (`username@hostname`).'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    withUpdateNotice(({ account }) => {
      const match = lookupAccount(account);
      if (!match) return textResult(`No saved account for ${account}.`);
      const id = accountId(match);
      clearSession(id);
      removeAccount(match.hostname, match.username);
      return textResult(`Forgot ${id}. Credentials, passkey, and session cache have been deleted from disk.`);
    }),
  );

  server.registerTool(
    'check_for_updates',
    {
      title: 'Check for extension updates',
      description: 'Check whether a newer version of the OpenRecord extension has been released. Sideloaded .mcpb extensions do not auto-update; updating means downloading the new openrecord.mcpb and opening it — saved accounts, passkeys and sessions are kept.',
      inputSchema: {} satisfies ZodRawShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withUpdateNotice(async () => {
      const result = await checkForUpdate({ force: true });
      if (result.disabled) {
        return jsonResult({
          installed_version: result.installedVersion,
          update_checks: 'disabled',
          note: 'Update checks are turned off (the disable_update_check extension setting / OPENRECORD_DISABLE_UPDATE_CHECK). No network request was made. The user can always download the current bundle manually from ' + STABLE_DOWNLOAD_URL,
        });
      }
      return jsonResult({
        installed_version: result.installedVersion,
        latest_version: result.latestVersion,
        update_available: result.updateAvailable,
        download_url: result.downloadUrl,
        ...(result.checkFailed
          ? { check_failed: true, note: 'Could not reach the release manifest to check for updates. Tell the user the check failed; do not guess whether an update exists.' }
          : {}),
        ...(result.updateAvailable
          ? {
              how_to_update:
                'Download the new openrecord.mcpb and open it (double-click, or drag into Claude Desktop → Settings → Extensions). It upgrades in place; saved accounts, passkeys and sessions are kept.',
            }
          : {}),
      });
    }),
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
