/**
 * Tool registry for the OpenRecord MCPB stdio MCP server.
 *
 * Two groups of tools:
 *   1. Meta tools — list_accounts, search_mycharts, setup_account, complete_2fa,
 *                   register_passkey, disconnect_account.
 *   2. Scraper tools — one per MyChart data category + write actions.
 *
 * Every scraper tool takes a REQUIRED `account` parameter (the MyChart
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
import { MyChartRequest } from '../../scrapers/myChart/myChartRequest';

import { myChartUserPassLogin, complete2faFlow } from '../../scrapers/myChart/login';
import { setupPasskey } from '../../scrapers/myChart/setupPasskey';
import { serializeCredential } from '../../scrapers/myChart/softwareAuthenticator';

import { getMyChartProfile, getEmail } from '../../scrapers/myChart/profile';
import { getHealthSummary } from '../../scrapers/myChart/healthSummary';
import { getMedications } from '../../scrapers/myChart/medications';
import { getAllergies } from '../../scrapers/myChart/allergies';
import { getHealthIssues } from '../../scrapers/myChart/healthIssues';
import { getVitals } from '../../scrapers/myChart/vitals';
import { upcomingVisits, pastVisits } from '../../scrapers/myChart/visits/visits';
import { getVisitNotes, getNoteContent, getVisitAVS } from '../../scrapers/myChart/notes/notes';
import { listLabResults, getImagingResults } from '../../scrapers/myChart/labs_and_procedure_results/labResults';
import { listConversations } from '../../scrapers/myChart/messages/conversations';
import { getConversationMessages } from '../../scrapers/myChart/messages/messageThreads';
import {
  sendNewMessage,
  getMessageRecipients,
  getMessageTopics,
  getVerificationToken,
} from '../../scrapers/myChart/messages/sendMessage';
import { sendReply } from '../../scrapers/myChart/messages/sendReply';
import { deleteMessage } from '../../scrapers/myChart/messages/deleteMessage';
import { getBillingHistory } from '../../scrapers/myChart/bills/bills';
import { getCareTeam } from '../../scrapers/myChart/careTeam';
import { getInsurance } from '../../scrapers/myChart/insurance';
import { getImmunizations } from '../../scrapers/myChart/immunizations';
import { getPreventiveCare } from '../../scrapers/myChart/preventiveCare';
import { getReferrals } from '../../scrapers/myChart/referrals';
import { getMedicalHistory } from '../../scrapers/myChart/medicalHistory';
import { getLetters } from '../../scrapers/myChart/letters';
import { getDocuments } from '../../scrapers/myChart/documents';
import {
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
} from '../../scrapers/myChart/emergencyContacts';
import { getGoals } from '../../scrapers/myChart/goals';
import { getUpcomingOrders } from '../../scrapers/myChart/upcomingOrders';
import { getQuestionnaires } from '../../scrapers/myChart/questionnaires';
import { getCareJourneys } from '../../scrapers/myChart/careJourneys';
import { getActivityFeed } from '../../scrapers/myChart/activityFeed';
import { getEducationMaterials } from '../../scrapers/myChart/educationMaterials';
import { getEhiExportTemplates } from '../../scrapers/myChart/ehiExport';
import { getLinkedMyChartAccounts } from '../../scrapers/myChart/other_mycharts/other_mycharts';
import { requestMedicationRefill } from '../../scrapers/myChart/medicationRefill';
import {
  assertProxyReadContext,
  runListProxyTargets,
  runSwitchProxyTarget,
} from '../../scrapers/myChart/proxyTools';

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
  normalizeHostname,
  findAccount,
} from './credential-store';
import { addPending, takePending } from './pending-logins';
import { downloadStudyJpegs, encodeImageId, decodeImageId } from './imaging/download-study';

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

// ── Scraper tool registration helper ───────────────────────────────────────

type ScraperHandler<Args> = (req: MyChartRequest, args: Args) => Promise<unknown>;

/**
 * Optional on every scraper tool: which patient the call is about, for
 * accounts with proxy access to family members' charts. The guard below
 * asserts it (or the account holder, when omitted) before the handler runs.
 */
const patientParam = z
  .string()
  .optional()
  .describe(
    "Which patient's record this call is about, for accounts with MyChart proxy access to family " +
      "members' charts — a name from list_proxy_targets. Omit for the account holder's own record. " +
      'If MyChart is currently on a different patient the call fails (with instructions) rather than ' +
      'switching silently.',
  );

/**
 * Registers a scraper tool that requires an `account` (MyChart hostname).
 * `kind` controls the MCP annotations Claude Desktop uses for grouping:
 *   - 'read'  → readOnlyHint: true
 *   - 'write' → readOnlyHint: false, destructiveHint: true (mutates MyChart)
 *
 * Every scraper tool also takes an optional `patient` and asserts the active
 * patient before running — reads (and writes) refuse rather than touch the
 * wrong family member's chart. Only switch_proxy_target changes the active
 * patient.
 */
function registerScraperTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputShape: Shape,
  handler: ScraperHandler<z.infer<z.ZodObject<Shape>> & { account: string }>,
  opts: { kind: 'read' | 'write'; title?: string } = { kind: 'read' },
): void {
  const fullShape = {
    account: z.string().describe('MyChart hostname (the "account" / "account_id" — get the exact value from list_accounts).'),
    patient: patientParam,
    ...inputShape,
  };
  const annotations =
    opts.kind === 'read'
      ? { readOnlyHint: true, openWorldHint: true, ...(opts.title ? { title: opts.title } : {}) }
      : { readOnlyHint: false, destructiveHint: true, openWorldHint: true, ...(opts.title ? { title: opts.title } : {}) };
  server.registerTool(
    name,
    {
      description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: fullShape as any,
      annotations,
    },
    async (args: Record<string, unknown>) => {
      try {
        const acct = typeof args.account === 'string' ? args.account : '';
        const session = await resolveSession(acct);
        await assertProxyReadContext(session, typeof args.patient === 'string' ? args.patient : undefined);
        const data = await handler(session, args as z.infer<z.ZodObject<Shape>> & { account: string });
        return jsonResult(data);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );
}

// ── Public: register everything on the server ──────────────────────────────

export function registerAllTools(server: McpServer): void {
  // ── Meta tools ────────────────────────────────────────────────────────────

  server.registerTool(
    'list_accounts',
    {
      title: 'List configured accounts',
      description: 'Returns every MyChart account whose credentials are already saved on this machine. Every entry in `accounts` is fully configured — pass its `hostname` as the `account` parameter to any data tool. NEVER ask the user for credentials again for an account that appears here, regardless of the `sessionActive` flag (sessions are created on-demand by the next tool call).',
      inputSchema: {} as ZodRawShape,
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

  server.registerTool(
    'register_passkey',
    {
      title: 'Register a passkey on an account (optional, recommended)',
      description: 'Register a passkey on an already-connected MyChart account so future logins skip the password and 2FA prompts entirely. Idempotent — calling it again just adds another passkey.',
      inputSchema: {
        account: z.string().describe('MyChart hostname (the account from list_accounts).'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ account }) => {
      try {
        const session = await resolveSession(account);
        const credential = await setupPasskey(session);
        if (!credential) {
          return errorResult('Passkey registration failed: MyChart did not return a credential. Some instances disable passkey registration via the patient portal.');
        }
        saveAccountPasskey(account, serializeCredential(credential));
        return textResult(`Passkey saved for ${normalizeHostname(account)}. Future sessions will skip the password and 2FA prompts.`);
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

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

  // ── Proxy (family member) records ─────────────────────────────────────────

  server.registerTool(
    'list_proxy_targets',
    {
      title: 'List accessible patient records',
      description:
        'List every patient record this MyChart account can access — the account holder plus any ' +
        "family members reachable via proxy access (e.g. a parent viewing a child's chart) — and " +
        'which one is currently active. Data tools always read the ACTIVE record; use ' +
        'switch_proxy_target to change it. Accounts without proxy access return count: 0.',
      inputSchema: {
        account: z.string().describe('MyChart hostname (the account from list_accounts).'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ account }) => {
      try {
        const session = await resolveSession(account);
        return jsonResult(await runListProxyTargets(session));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  server.registerTool(
    'switch_proxy_target',
    {
      title: 'Switch the active patient record',
      description:
        "Switch which patient's record MyChart is showing (e.g. from the account holder's own chart " +
        "to a child's). This changes server-side MyChart state: EVERY data tool on this account reads " +
        'the newly active record afterwards. The switch is verified against the profile page and fails ' +
        'rather than landing on the wrong patient. Pass patient: "me" to return to the account ' +
        "holder's own record when done.",
      inputSchema: {
        account: z.string().describe('MyChart hostname (the account from list_accounts).'),
        patient: z
          .string()
          .describe('Patient to switch to: a name (or record id) from list_proxy_targets, or "me" / "self" for the account holder\'s own record.'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ account, patient }) => {
      try {
        const session = await resolveSession(account);
        return jsonResult(await runSwitchProxyTarget(session, patient));
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  // ── Profile / overview ────────────────────────────────────────────────────

  registerScraperTool(server, 'get_profile', 'Patient profile (name, DOB, MRN, PCP) + email address.', {}, async (req) => {
    const profile = await getMyChartProfile(req);
    let email: string | undefined;
    try { email = (await getEmail(req)) ?? undefined; } catch { /* ignore */ }
    return { ...profile, email };
  });

  registerScraperTool(server, 'get_health_summary', 'Health summary (vitals, blood type, smoking status, etc.).', {}, (req) => getHealthSummary(req));
  registerScraperTool(server, 'get_medications', 'Current medications list with dosage, sig, and pharmacy info.', {}, (req) => getMedications(req));
  registerScraperTool(server, 'get_allergies', 'Known allergies with reaction and severity.', {}, (req) => getAllergies(req));
  registerScraperTool(server, 'get_health_issues', 'Active health issues / problem list.', {}, (req) => getHealthIssues(req));
  registerScraperTool(server, 'get_vitals', 'Vitals + tracked flowsheet readings (weight, BP, heart rate, etc.).', {}, (req) => getVitals(req));
  registerScraperTool(server, 'get_immunizations', 'Vaccination history.', {}, (req) => getImmunizations(req));
  registerScraperTool(server, 'get_preventive_care', 'Preventive care recommendations (overdue / upcoming screenings).', {}, (req) => getPreventiveCare(req));
  registerScraperTool(server, 'get_medical_history', 'Past medical, surgical, family, social history.', {}, (req) => getMedicalHistory(req));
  registerScraperTool(server, 'get_goals', 'Care team + patient goals.', {}, (req) => getGoals(req));

  // ── Visits + notes ────────────────────────────────────────────────────────

  registerScraperTool(server, 'get_upcoming_visits', 'Upcoming appointments.', {}, (req) => upcomingVisits(req));
  registerScraperTool(server, 'get_past_visits', 'Past visits within the last `years_back` years (default 2).', {
    years_back: z.number().int().min(1).max(20).optional().describe('How many years back to fetch (default 2).'),
  }, async (req, { years_back }) => {
    const oldest = new Date();
    oldest.setFullYear(oldest.getFullYear() - (years_back ?? 2));
    return pastVisits(req, oldest);
  });
  registerScraperTool(server, 'get_visit_notes', 'List clinical notes (operative, progress, anesthesia, etc.) for a past visit. Returns hnoId, hnoDat, lrpId — pass these into get_note_content.', {
    csn: z.string().describe('Visit CSN (encounter ID) from get_past_visits.'),
  }, (req, { csn }) => getVisitNotes(req, csn));
  registerScraperTool(server, 'get_note_content', 'Fetch the rendered HTML content of a single clinical note.', {
    csn: z.string(),
    lrp_id: z.string(),
    hno_id: z.string(),
    hno_dat: z.string(),
  }, (req, { csn, lrp_id, hno_id, hno_dat }) => getNoteContent(req, { csn, lrpId: lrp_id, hnoId: hno_id, hnoDat: hno_dat }));
  registerScraperTool(server, 'get_visit_avs', 'After Visit Summary (AVS) HTML for a past visit.', {
    csn: z.string().describe('Visit CSN from get_past_visits.'),
  }, (req, { csn }) => getVisitAVS(req, csn));

  // ── Results ───────────────────────────────────────────────────────────────

  registerScraperTool(server, 'get_lab_results', 'Lab results with reference ranges and trending.', {}, (req) => listLabResults(req));
  registerScraperTool(server, 'get_imaging_results', 'Imaging results metadata (X-ray, MRI, CT, US, etc.). Each entry that has viewable images carries an `image_id` — pass that single value to download_imaging_study to get the actual images.', {}, async (req) => {
    const results = await getImagingResults(req);
    // Expose a single opaque `image_id` per study instead of the raw
    // { fdi, ord } pair — one copy-paste token is easier for the model to
    // hand to download_imaging_study without mixing the two fields up.
    return results.map((r) => {
      if (!r.fdiContext) return r;
      const { fdiContext, ...rest } = r;
      return { ...rest, image_id: encodeImageId(fdiContext) };
    });
  });

  server.registerTool(
    'download_imaging_study',
    {
      title: 'Download imaging study',
      description:
        'Download a single imaging study (X-ray, CT, MRI, ultrasound, etc.) and return the actual images as JPEGs that render inline in the conversation. ' +
        'Pass the `image_id` from the chosen get_imaging_results entry. ' +
        'Images are downloaded and encoded locally on the user’s machine (pure-JS CLO→JPEG, no native dependency).',
      inputSchema: {
        account: z.string().describe('MyChart hostname (the "account" / "account_id" — get the exact value from list_accounts).'),
        patient: patientParam,
        image_id: z.string().describe('The `image_id` value from the chosen get_imaging_results entry. Copy it verbatim.'),
        study_name: z.string().optional().describe('Human-readable study name for labeling (e.g. the orderName). Optional.'),
        max_images: z.number().int().min(1).max(20).optional().describe('Maximum number of images to download and return (default 3).'),
        jpeg_quality: z.number().int().min(1).max(100).optional().describe('JPEG quality 1-100 (default 85).'),
      } satisfies ZodRawShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const account = typeof args.account === 'string' ? args.account : '';
        const imageId = typeof args.image_id === 'string' ? args.image_id : '';
        const studyName = typeof args.study_name === 'string' ? args.study_name : undefined;
        const maxImages = typeof args.max_images === 'number' ? args.max_images : undefined;
        const jpegQuality = typeof args.jpeg_quality === 'number' ? args.jpeg_quality : undefined;

        const fdiContext = decodeImageId(imageId);
        const session = await resolveSession(account);
        await assertProxyReadContext(session, typeof args.patient === 'string' ? args.patient : undefined);
        const result = await downloadStudyJpegs(session, fdiContext, {
          studyName,
          maxImages,
          jpegQuality,
        });

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

        // Emit one image content block per encoded image so Claude Desktop
        // renders the actual X-ray instead of a base64 blob inside JSON text.
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
                : 'The study may not expose viewable image data, or the viewer session expired — try get_imaging_results again for a fresh fdiContext.'),
          });
        }

        return { content };
      } catch (err) {
        return errorResult((err as Error).message);
      }
    },
  );

  // ── Messages ──────────────────────────────────────────────────────────────

  registerScraperTool(server, 'get_messages', 'Inbox message conversations.', {}, (req) => listConversations(req));
  registerScraperTool(server, 'get_message_thread', 'Full message thread by conversation ID.', {
    conversation_id: z.string(),
  }, (req, { conversation_id }) => getConversationMessages(req, conversation_id));
  registerScraperTool(server, 'get_message_recipients', 'List providers who can receive new messages.', {}, async (req) => {
    const token = await getVerificationToken(req);
    if (!token) throw new Error('Could not get verification token for message recipients.');
    return getMessageRecipients(req, token);
  });
  registerScraperTool(server, 'get_message_topics', 'List available message topics/categories.', {}, async (req) => {
    const token = await getVerificationToken(req);
    if (!token) throw new Error('Could not get verification token for message topics.');
    return getMessageTopics(req, token);
  });
  registerScraperTool(server, 'send_message',
    'Send a new message to a care team provider. Get `recipient` from get_message_recipients and `topic` from get_message_topics.',
    {
      recipient: z.unknown().describe('Recipient object from get_message_recipients.'),
      topic: z.unknown().describe('Topic object from get_message_topics.'),
      subject: z.string(),
      message: z.string(),
    },
    (req, { recipient, topic, subject, message }) => sendNewMessage(req, {
      recipient: recipient as Parameters<typeof sendNewMessage>[1]['recipient'],
      topic: topic as Parameters<typeof sendNewMessage>[1]['topic'],
      subject,
      messageBody: message,
    }),
    { kind: 'write' },
  );
  registerScraperTool(server, 'send_reply', 'Reply to an existing message conversation.', {
    conversation_id: z.string(),
    message: z.string(),
  }, (req, { conversation_id, message }) => sendReply(req, { conversationId: conversation_id, messageBody: message }), { kind: 'write' });
  registerScraperTool(server, 'delete_message', 'Delete a message conversation.', {
    conversation_id: z.string(),
  }, (req, { conversation_id }) => deleteMessage(req, conversation_id), { kind: 'write' });

  // ── Billing / coverage ────────────────────────────────────────────────────

  registerScraperTool(server, 'get_billing', 'Billing history and account balance.', {}, (req) => getBillingHistory(req));
  registerScraperTool(server, 'get_insurance', 'Insurance coverage info.', {}, (req) => getInsurance(req));

  // ── Care team / coordination ──────────────────────────────────────────────

  registerScraperTool(server, 'get_care_team', 'Members of the care team.', {}, (req) => getCareTeam(req));
  registerScraperTool(server, 'get_referrals', 'Active and past referrals.', {}, (req) => getReferrals(req));
  registerScraperTool(server, 'get_letters', 'Letters: after-visit summaries, clinical letters.', {}, (req) => getLetters(req));
  registerScraperTool(server, 'get_documents', 'Clinical documents and visit records.', {}, (req) => getDocuments(req));
  registerScraperTool(server, 'get_upcoming_orders', 'Upcoming orders (labs, imaging, procedures).', {}, (req) => getUpcomingOrders(req));
  registerScraperTool(server, 'get_questionnaires', 'Open questionnaires / health assessments.', {}, (req) => getQuestionnaires(req));
  registerScraperTool(server, 'get_care_journeys', 'Care journeys / care plans.', {}, (req) => getCareJourneys(req));
  registerScraperTool(server, 'get_activity_feed', 'Recent activity feed items.', {}, (req) => getActivityFeed(req));
  registerScraperTool(server, 'get_education_materials', 'Assigned education materials.', {}, (req) => getEducationMaterials(req));
  registerScraperTool(server, 'get_ehi_export', 'Electronic Health Information (EHI) export templates.', {}, (req) => getEhiExportTemplates(req));
  registerScraperTool(server, 'get_linked_accounts', 'Linked MyChart accounts at other organizations.', {}, (req) => getLinkedMyChartAccounts(req));

  // ── Emergency contacts ────────────────────────────────────────────────────

  registerScraperTool(server, 'get_emergency_contacts', 'List configured emergency contacts.', {}, (req) => getEmergencyContacts(req));
  registerScraperTool(server, 'add_emergency_contact', 'Add a new emergency contact.', {
    name: z.string(),
    relationship_type: z.string().describe('e.g. "Spouse", "Parent", "Sibling", "Friend".'),
    phone_number: z.string(),
  }, (req, { name, relationship_type, phone_number }) => addEmergencyContact(req, {
    name,
    relationshipType: relationship_type,
    phoneNumber: phone_number,
  }), { kind: 'write' });
  registerScraperTool(server, 'update_emergency_contact', 'Update an existing emergency contact (only the fields you pass are changed).', {
    id: z.string().describe('Contact ID from get_emergency_contacts.'),
    name: z.string().optional(),
    relationship_type: z.string().optional(),
    phone_number: z.string().optional(),
  }, (req, { id, name, relationship_type, phone_number }) => updateEmergencyContact(req, {
    id,
    name,
    relationshipType: relationship_type,
    phoneNumber: phone_number,
  }), { kind: 'write' });
  registerScraperTool(server, 'remove_emergency_contact', 'Remove an emergency contact by ID.', {
    id: z.string(),
  }, (req, { id }) => removeEmergencyContact(req, id), { kind: 'write' });

  // ── Prescriptions ─────────────────────────────────────────────────────────

  registerScraperTool(server, 'request_refill', 'Request a refill for a current medication.', {
    medication_key: z.string().describe('Medication key from get_medications.'),
  }, (req, { medication_key }) => requestMedicationRefill(req, medication_key), { kind: 'write' });
}
