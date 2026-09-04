/**
 * Tool registry for the OpenRecord MCPB stdio MCP server.
 *
 * Two groups of tools:
 *   1. Meta tools — list_accounts, get_setup_widget, get_hospital_info,
 *                   setup_account, import_browser_passwords,
 *                   connect_imported_account, complete_2fa,
 *                   disconnect_account. These are MCPB-specific: all but one
 *                   manage the credentials stored on this machine, which is
 *                   not something the other clients share, and get_setup_widget
 *                   returns a Claude Desktop UI resource no other client can
 *                   render. `search_mycharts` used to be one of them and is now
 *                   a `public` capability in the shared registry, so every
 *                   client has it; `get_hospital_info` is account-free in the
 *                   same way and is the obvious next one to move.
 *   2. Capability tools — one per entry in `shared/capabilities/`, which is
 *                   the single source of truth for what OpenRecord can do with
 *                   a MyChart account. Nothing in this file decides what the
 *                   extension supports; add a capability there and it appears
 *                   here, in the CLI, in the npm client and in the mobile app.
 *
 * Every capability tool that touches MyChart takes an `account` parameter (the
 * hostname returned by list_accounts). Multiple accounts can be configured and
 * connected at once; there is no "active account" state. `public` capabilities
 * (the NPI Registry, the MyChart directory) take no account and run with no
 * session at all.
 *
 * There IS an "active patient" per account, but it lives on MyChart's server
 * (proxy access — a parent reading a child's chart). Scraper tools take an
 * optional `patient` and assert the active record before running; only
 * switch_proxy_target changes it. See scrapers/myChart/proxyTools.ts.
 *
 * Setup is a sequence of explicit tool calls (no MCP elicitation):
 *   list_accounts                                  // see what's already set up
 *   import_browser_passwords()                     // optional: reuse a password the browser already has
 *   connect_imported_account(import_id)            //   …then connect the one the user picked
 *   search_mycharts(query="uchealth")              // otherwise, find the hostname for a new account
 *   setup_account(hostname, username, password)    // attempt login
 *   complete_2fa(pending_id, code)                 // only if the login said need_2fa
 *   register_passkey(account)                      // recommended, only if the user agrees:
 *                                                  //   skips password + 2FA on future sessions
 */

import { z, type ZodRawShape } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { myChartUserPassLogin, complete2faFlow } from '../../scrapers/myChart/auth/login';

import {
  ACCOUNT_PARAM,
  CAPABILITIES,
  MODE_PARAM,
  MODEL_FACING_OUTPUT_MODE,
  PATIENT_PARAM,
  acceptsAccountParam,
  acceptsModeParam,
  acceptsPatientParam,
  capabilityDescription,
  describeModeParam,
  isUnimplemented,
  executeCapability,
  isPublicCapability,
  readAccountArg,
  type Capability,
  type CapabilityContext,
  type CapabilityParam,
  type StudyImagePayload,
} from '../../shared/capabilities';

import { fetchHospitalNetworkProfile } from '../../scrapers/myChart/prelogin';
import { BACKEND_DESCRIPTION } from './secret-store';
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
  secretBackend,
  readAccountPasskey,
  removeAccount,
  upsertAccount,
  saveAccountPasskey,
  saveAccountTotpSecret,
  normalizeHostname,
} from './credential-store';
import { addPending, takePending } from './pending-logins';
import { releaseImportedCandidate, scanBrowserPasswords, takeImportedCandidate } from './browser-import';
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

// ── Tool metadata ───────────────────────────────────────────────────────────

/**
 * The `title` + `annotations` half of a tool's registration.
 *
 * MCP carries a tool's human-readable label in two places: `Tool.title`, and
 * the older `ToolAnnotations.title`. Which one a client reads is up to the
 * client, so a tool that fills in only one shows up under its snake_case id in
 * whichever client reads the other. Every tool here — hand-written or derived
 * from `shared/capabilities/` — goes through this so both are filled from one
 * string and neither can be forgotten. `tool-metadata.unit.test.ts` fails the
 * build if a registration skips it.
 */
function toolMeta(
  title: string,
  hints: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean },
): { title: string; annotations: { title: string; readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint: boolean } } {
  return { title, annotations: { title, ...hints } };
}

// ── Recommending a passkey after login ─────────────────────────────────────

const PASSKEY_ALREADY_SAVED_MESSAGE =
  'Account connected. A passkey for this login is already saved, so future sessions sign in ' +
  'without the password or a 2FA code.';

/**
 * What to say to a patient who has just logged in and has no passkey yet.
 *
 * `BACKEND_DESCRIPTION[secretBackend()]` is the live answer, not the ideal one:
 * a locked keychain or a native module that failed to load downgrades storage
 * to a 0600 file, and a recommendation that promises the Keychain in that case
 * is a lie about where a P-256 private key to a medical record ends up.
 */
function recommendPasskeyMessage(id: string): string {
  return (
    'Account connected — nothing further is required to read this chart. ' +
    'STRONGLY RECOMMENDED, but only with the user\'s explicit go-ahead: offer to set up a passkey now. ' +
    'Tell them, in your own words, what it does and what it costs: every later session signs in with no ' +
    `username, password or 2FA code; the key is stored in ${BACKEND_DESCRIPTION[secretBackend()]} and is ` +
    'never sent to Anthropic; and it registers a new sign-in credential on their MyChart account that stays ' +
    `valid on the portal until it is removed (\`delete_passkey\` with account "${id}", or ` +
    'disconnect_account, which deletes the local copy). ' +
    `If — and only if — they say yes, call register_passkey with account "${id}".`
  );
}

/**
 * The `logged_in` payload shared by both password routes.
 *
 * **No passkey is registered here.** Registering one writes a new
 * authentication factor onto the patient's MyChart account, and its whole
 * purpose is that future sign-ins stop asking for the password and the 2FA
 * code — a deliberate change to the security posture of a medical record that
 * outlives the session and stays valid on the portal until someone deletes it.
 * That is the patient's call, not a side effect of "log me in". The payload
 * recommends it instead, and `register_passkey` runs only once they agree.
 */
function loggedInResult(hostname: string, username: string): ToolResult {
  const id = accountId({ hostname, username });
  // Per (hostname, username): another user's passkey on the same hostname says
  // nothing about this login.
  const hasPasskey = !!readAccountPasskey(normalizeHostname(hostname), username);

  return jsonResult({
    state: 'logged_in',
    account: id,
    passkey_saved: hasPasskey,
    passkey_recommended: !hasPasskey,
    passkey_storage: secretBackend(),
    message: hasPasskey ? PASSKEY_ALREADY_SAVED_MESSAGE : recommendPasskeyMessage(id),
  });
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
 *
 * A capability with no scraper is annotated read-only whatever its `kind` says,
 * because it changes nothing: `kind` describes the write it will be once
 * implemented, and warning a patient that a no-op is destructive is a warning
 * they learn to ignore.
 */
function registerCapabilityTool(server: McpServer, capability: Capability): void {
  const shape: Record<string, z.ZodType> = {};
  // Everything that touches MyChart needs to be told which account. The
  // `public` capabilities — the NPI Registry, the MyChart directory — do not,
  // and asking for one would stop the model looking a provider up until the
  // user had connected a chart it has nothing to do with.
  if (acceptsAccountParam(capability)) shape[ACCOUNT_PARAM.name] = ACCOUNT_SCHEMA;
  // Which patient the call is about, for accounts with proxy access to family
  // members' charts. executeCapability asserts it — or the account holder,
  // when omitted — before the capability runs, so a read refuses rather than
  // silently returning the wrong family member's chart.
  if (acceptsPatientParam(capability)) shape.patient = zodForParam(PATIENT_PARAM);
  // How the payload is rendered. This client talks to a model, so the default
  // is the concise projection; the model asks for `standard`, `json` or `raw`
  // by name when it needs more.
  if (acceptsModeParam(capability)) {
    shape[MODE_PARAM.name] = z.string().describe(describeModeParam(MODEL_FACING_OUTPUT_MODE)).optional();
  }
  for (const param of capability.params) shape[param.name] = zodForParam(param);

  const hints =
    capability.kind === 'read' || capability.kind === 'public' || isUnimplemented(capability)
      ? { readOnlyHint: true, openWorldHint: true }
      : { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

  server.registerTool(
    capability.id,
    {
      ...toolMeta(capability.title, hints),
      description: capabilityDescription(capability),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: shape as any,
    },
    async (args: Record<string, unknown>) => {
      try {
        // A public capability has no account to resolve and no credentials to
        // read: `executeCapability` runs it with a null session.
        const account = isPublicCapability(capability) ? '' : readAccountArg(args) ?? '';
        const session = isPublicCapability(capability) ? null : await resolveSession(account);
        // executeCapability, not capability.run, for EVERY capability: the
        // active-patient assertion lives there. Branching to a direct
        // `capability.run` for the imaging tool is how that one tool ended up
        // returning a family member's X-rays.
        const withMode =
          acceptsModeParam(capability) && !args[MODE_PARAM.name]
            ? { ...args, [MODE_PARAM.name]: MODEL_FACING_OUTPUT_MODE }
            : args;
        const payload = await executeCapability(
          session,
          capability.id,
          withMode,
          isPublicCapability(capability) ? undefined : contextFor(account),
        );
        // The flag, not the id — and it decides how to RENDER the payload,
        // never whether the guard ran.
        if (capability.rendersMedia) {
          return imagingResult(payload as StudyImagePayload);
        }
        // The markdown modes come back as a string and go out as text; the
        // data modes go out as JSON.
        return typeof payload === 'string' ? textResult(payload) : jsonResult(payload);
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

// ── Shared login path ───────────────────────────────────────────────────────

/**
 * Log in with a password and save the account.
 *
 * Shared by `setup_account` (password typed in chat) and
 * `connect_imported_account` (password read from the browser store) so both
 * routes get identical 2FA handling, session adoption and the same
 * passkey recommendation — and so a fix to one is a fix to both.
 */
async function connectWithPassword(hostname: string, username: string, password: string): Promise<ToolResult> {
  try {
    const result = await myChartUserPassLogin({ hostname, user: username, pass: password });

    if (result.state === 'logged_in') {
      upsertAccount({ hostname: normalizeHostname(hostname), username, password });
      await adoptSession(hostname, username, result.mychartRequest);
      return loggedInResult(hostname, username);
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
}

// ── Public: register everything on the server ──────────────────────────────

export function registerAllTools(server: McpServer): void {
  // ── Meta tools ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_accounts',
    {
      description: 'Returns every MyChart account whose credentials are already saved on this machine. Every entry in `accounts` is fully configured — pass its `account` id (`username@hostname`) as the `account` parameter to any data tool. NEVER ask the user for credentials again for an account that appears here, regardless of the `sessionActive` flag (sessions are created on-demand by the next tool call).',
      inputSchema: {},
      ...toolMeta('List configured accounts', { readOnlyHint: true, openWorldHint: false }),
    },
    () => {
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
            // secretStorage says whether passwords, TOTP secrets and passkeys
            // reached the OS keystore or fell back to a plaintext file —
            // otherwise a locked keychain downgrades storage silently and
            // nobody ever finds out.
            text: JSON.stringify(
              { count: accounts.length, secretStorage: secretBackend(), accounts: accountList },
              null,
              2,
            ),
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
    },
  );

  server.registerTool(
    'get_setup_widget',
    {
      description: 'Display an interactive widget for connecting a MyChart account. Use this if the user wants a GUI instead of chat-based setup.',
      inputSchema: {} satisfies ZodRawShape,
      ...toolMeta('Get interactive setup widget', { readOnlyHint: true, openWorldHint: false }),
      _meta: { 'openai/outputTemplate': 'ui://openrecord/setup', ui: { resourceUri: 'ui://openrecord/setup' } },
    },
    () => ({
      content: [
        {
          type: 'text',
          text: 'Enter your MyChart hostname, username, and password in the widget to connect your account.',
        },
      ],
    }),
  );

  server.registerTool(
    'get_hospital_info',
    {
      description:
        'What a MyChart instance publishes about its health system to anyone, with no account: the ' +
        "organization's support, scheduling and billing phone lines and support email; the \"Find a Doctor\" " +
        'directory of bookable providers (name, credentials, specialties, languages, photo) with every clinic ' +
        'they work at (street address, phone, coordinates, hours); billing entities and their facilities; and ' +
        'which portal features are switched on. Pass the `hostname` from search_mycharts. Slow on large ' +
        'systems — one specialty is 0.6–2 MB and some list twenty — so narrow with `specialties` or skip the ' +
        'crawl with `include_providers: false`. Never returns a fax number or an accepted-insurance list: ' +
        'MyChart publishes neither (the payer list sits behind a reCAPTCHA-protected disclaimer).',
      inputSchema: {
        hostname: z.string().min(1).describe('The MyChart hostname, e.g. mychart.example.org. A full login URL also works.'),
        specialties: z.array(z.string()).optional().describe('Only crawl these "Find a Doctor" specialties (by name). Default: all of them.'),
        max_specialties: z.number().int().min(0).optional().describe('Stop after this many specialties.'),
        include_providers: z.boolean().optional().describe('Crawl the provider and clinic directory (default true).'),
        include_billing: z.boolean().optional().describe('Read the billing entities (default true).'),
      } satisfies ZodRawShape,
      ...toolMeta('Public profile of a health system', { readOnlyHint: true, openWorldHint: true }),
    },
    async ({ hostname, specialties, max_specialties, include_providers, include_billing }) => {
      try {
        const profile = await fetchHospitalNetworkProfile(hostname, {
          ...(specialties ? { specialties } : {}),
          ...(max_specialties !== undefined ? { maxSpecialties: max_specialties } : {}),
          ...(include_providers !== undefined ? { includeProviders: include_providers } : {}),
          ...(include_billing !== undefined ? { includeBilling: include_billing } : {}),
        });
        return jsonResult(profile);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.registerTool(
    'setup_account',
    {
      description: "Attempt to log into MyChart and save the account for future calls. The model should first ask the user for their MyChart hostname (use search_mycharts to look it up) and credentials in chat, then call this tool. Returns one of: `{state:\"logged_in\", account}`, `{state:\"need_2fa\", pending_id, delivery, target}` (call complete_2fa next with the user-supplied code), or `{state:\"invalid_login\"}`. This tool logs in and nothing else — it never changes the account's sign-in settings. On `logged_in`, do what the `message` field says.",
      inputSchema: {
        hostname: z.string().describe('MyChart hostname, e.g. "mychart.example.org". From search_mycharts or the user.'),
        username: z.string().describe('MyChart username (ask the user).'),
        password: z.string().describe('MyChart password (ask the user). Stored locally on disk, never transmitted to Anthropic.'),
      } satisfies ZodRawShape,
      ...toolMeta('Set up a MyChart account (step 1)', { readOnlyHint: false, destructiveHint: false, openWorldHint: true }),
    },
    ({ hostname, username, password }) => connectWithPassword(hostname, username, password),
  );

  server.registerTool(
    'import_browser_passwords',
    {
      description:
        "Scan this machine's browser password stores (Chrome, Arc, Brave, Edge, Firefox) for MyChart logins the user has already saved, so they do not have to type a password. " +
        'Read-only, and it may raise the OS keychain permission prompt. ' +
        'Returns only accounts confirmed to be MyChart portals — a known Epic instance, or one whose login page was verified. ' +
        'Passwords are NEVER returned: each entry carries an opaque `import_id`. Show the list to the user, let them choose, then call connect_imported_account with the chosen id.',
      inputSchema: {
        check_unknown_hosts: z
          .boolean()
          .optional()
          .describe('Default true. When false, no network requests are made and only hostnames already in the bundled MyChart directory are returned.'),
      } satisfies ZodRawShape,
      ...toolMeta('Find MyChart logins saved in the browser', { readOnlyHint: true, openWorldHint: true }),
    },
    async ({ check_unknown_hosts }) => {
      try {
        const scan = await scanBrowserPasswords({ probeUnknownHosts: check_unknown_hosts ?? true });

        if (!scan.supported) {
          return jsonResult({ supported: false, message: 'Reading browser password stores is only supported on macOS and Windows.' });
        }
        if (scan.accounts.length === 0) {
          return jsonResult({
            supported: true,
            accounts: [],
            message:
              "No saved MyChart logins were confirmed in this machine's browsers. Set the account up with setup_account instead. " +
              'If the user believes they have one saved, their portal may have been unreachable just now — this tool can be run again later.',
          });
        }

        return jsonResult({
          ...scan,
          message:
            'Show the user these accounts and ask which to connect. Call connect_imported_account with the chosen import_id. ' +
            'Ids expire 10 minutes after the scan; run this tool again if that happens.',
        });
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.registerTool(
    'connect_imported_account',
    {
      description:
        'Log into a MyChart account discovered by import_browser_passwords, using the password already saved in the browser, and save it for future calls. ' +
        'Only call this for an entry the user explicitly chose. Same outcomes as setup_account: `logged_in`, `need_2fa` (call complete_2fa next), or `invalid_login` (the saved password is stale — ask the user for the current one and use setup_account).',
      inputSchema: {
        import_id: z.string().describe('The import_id of the chosen entry from import_browser_passwords.'),
      } satisfies ZodRawShape,
      ...toolMeta('Connect an account found in the browser', { readOnlyHint: false, destructiveHint: false, openWorldHint: true }),
    },
    async ({ import_id }) => {
      const candidate = takeImportedCandidate(import_id);
      if (!candidate) {
        return errorResult('That import_id is unknown or has expired (10-minute TTL). Call import_browser_passwords again.');
      }
      if (!candidate.user) {
        return errorResult(`The saved credential for ${candidate.hostname} has no username. Ask the user for it and call setup_account.`);
      }

      const result = await connectWithPassword(candidate.hostname, candidate.user, candidate.pass!);
      // Keep the credential only while it is still needed: a 2FA flow has
      // already copied it into the pending-login record.
      releaseImportedCandidate(import_id);
      return result;
    },
  );

  server.registerTool(
    'complete_2fa',
    {
      description: 'Finish a setup_account flow that returned `need_2fa`. Pass the `pending_id` from that response and the 6-digit code the user gave you. On success the account is saved and immediately usable. Like setup_account it changes no sign-in settings; on `logged_in`, do what the `message` field says.',
      inputSchema: {
        pending_id: z.string().describe('The pending_id returned by setup_account when state was need_2fa.'),
        code: z.string().describe('6-digit code the user read from email/SMS/authenticator.'),
      } satisfies ZodRawShape,
      ...toolMeta('Finish 2FA (step 2)', { readOnlyHint: false, destructiveHint: false, openWorldHint: true }),
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
          await adoptSession(pending.hostname, pending.username, twoFa.mychartRequest);
          return loggedInResult(pending.hostname, pending.username);
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
  // (`shared/capabilities/`) so the CLI and the mobile app expose the same
  // thing, and it is registered by the loop at the bottom of this function.

  server.registerTool(
    'disconnect_account',
    {
      description: 'Forget a saved MyChart account. Deletes the local credentials, passkey, and cached session for this login only — other usernames saved for the same hostname are untouched.',
      inputSchema: {
        account: z.string().describe('Account id from list_accounts (`username@hostname`).'),
      } satisfies ZodRawShape,
      ...toolMeta('Forget a MyChart account', { readOnlyHint: false, destructiveHint: true, openWorldHint: false }),
    },
    ({ account }) => {
      const match = lookupAccount(account);
      if (!match) return textResult(`No saved account for ${account}.`);
      const id = accountId(match);
      clearSession(id);
      removeAccount(match.hostname, match.username);
      return textResult(`Forgot ${id}. Credentials, passkey, and session cache have been deleted from disk.`);
    },
  );

  // ── Capability tools ──────────────────────────────────────────────────────
  //
  // Derived, not listed. `shared/capabilities/` is the single source of
  // truth for what OpenRecord can do with a MyChart account; every entry there
  // becomes a tool here automatically, so this extension can never quietly
  // support less than the CLI or the mobile app does.

  for (const capability of CAPABILITIES) {
    registerCapabilityTool(server, capability);
  }
}
