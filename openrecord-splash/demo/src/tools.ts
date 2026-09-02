/**
 * The demo's MyChart tool layer.
 *
 * Mirrors the tool surface of the real product — the MCP server in
 * `web/src/lib/mcp/`, the Claude Desktop extension, and the on-device
 * scrapers the iOS app calls — but every tool reads and writes the
 * fictional record in `data.ts` instead of a live Epic portal.
 *
 * Write tools genuinely mutate session state: a sent message shows up in
 * get_messages, a refill decrements refillsRemaining, a booked slot moves
 * into get_upcoming_visits. That's what makes the demo worth clicking
 * through instead of watching a canned script.
 */

import * as data from './data';
import { PATIENT_SEEDS, SELF_PATIENT_ID, type PatientSeed } from './patients';
import type {
  AppointmentOffer,
  Conversation,
  EmergencyContact,
  Medication,
  MessageTopic,
  PatientRecord,
  PatientState,
  Session,
  ToolArgs,
  ToolError,
  ToolResult,
  ToolSpec,
} from './types';

/** Deep clone so tool results can never be mutated back into the seed data. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** One patient's session state: the static chart plus this visitor's edits. */
function seedPatient(seed: PatientSeed): PatientState {
  return {
    id: seed.id,
    name: seed.name,
    isSelf: seed.isSelf,
    relationship: seed.relationship,
    dateOfBirth: seed.dateOfBirth,
    record: seed.record,
    medications: clone(seed.record.medications),
    messages: clone(seed.record.messages),
    emergencyContacts: clone(seed.record.emergencyContacts),
    upcomingVisits: clone(seed.record.upcomingVisits),
    availableAppointments: clone(seed.record.availableAppointments),
  };
}

/**
 * Fresh, isolated copy of the record. One per demo session — hitting "reset"
 * throws this away and makes a new one.
 *
 * Both charts the account can reach are seeded, and the session starts on the
 * account holder's own — the state a real login lands in.
 */
export function createSession(): Session {
  const patients = PATIENT_SEEDS.map(seedPatient);
  const session: Session = {
    hostname: data.DEMO_HOSTNAME,
    username: data.DEMO_USERNAME,
    connected: false,
    configured: true,
    pendingLogin: null,
    activePatientId: SELF_PATIENT_ID,
    patients,
    activityLog: [],
    // Live arrays, resolved on every read, so a proxy switch moves the phone's
    // settings screen and the alerts panel along with the tools.
    get medications() {
      return activePatient(session).medications;
    },
    get messages() {
      return activePatient(session).messages;
    },
    get emergencyContacts() {
      return activePatient(session).emergencyContacts;
    },
    get upcomingVisits() {
      return activePatient(session).upcomingVisits;
    },
    get availableAppointments() {
      return activePatient(session).availableAppointments;
    },
  };
  return session;
}

/** The record MyChart is currently serving. Every data tool goes through here. */
export function activePatient(session: Session): PatientState {
  // The roster is never empty and activePatientId is only ever set from it, so
  // the fallback is unreachable — it exists so a read can't be `undefined`.
  return session.patients.find((p) => p.id === session.activePatientId) ?? session.patients[0]!;
}

/** The active patient's static chart. */
function record(session: Session): PatientRecord {
  return activePatient(session).record;
}

/** The account holder's own record — what "me", and an omitted `patient`, mean. */
function selfPatient(session: Session): PatientState {
  return session.patients.find((p) => p.isSelf) ?? session.patients[0]!;
}

function logActivity(session: Session, kind: string, summary: string): void {
  session.activityLog.push({ kind, summary, at: new Date().toISOString() });
}

/**
 * Tool catalogue. `args` is a name → description map used both to build the
 * model's system prompt and to render the tool browser in the UI.
 *
 * A `write` block marks the tools that change something in the portal and
 * carries the copy for the dialog that gates them. The agent must call them
 * alone and confirm with the user first, exactly like production. A spec with
 * no `write` block is a read and runs unattended.
 */
export const TOOL_SPECS: ToolSpec[] = [
  // ── Session / account ──
  //
  // These mirror the Claude Desktop extension's meta tools
  // (`claude-desktop-extension/src/tools.ts`), which manage the credentials
  // saved on the machine rather than anything inside a chart.
  { name: 'list_accounts', group: 'Account', description: 'List MyChart accounts configured on this device', args: {} },
  {
    name: 'search_mycharts',
    group: 'Account',
    description:
      'Look up a MyChart hostname for setup. Type a few letters of the health system name; pass the chosen hostname to setup_account.',
    args: { query: 'part of the health system name', limit: 'number (default 10)' },
  },
  {
    name: 'setup_account',
    group: 'Account',
    write: {
      title: 'Connect MyChart Account',
      description: 'Logs into MyChart and saves the account on this device.',
      verb: 'Connect',
    },
    description:
      'Log into MyChart and save the account. Returns state: logged_in, need_2fa (call complete_2fa with the pending_id), or invalid_login.',
    args: { hostname: 'MyChart hostname', username: 'MyChart username', password: 'MyChart password' },
  },
  { name: 'connect_instance', group: 'Account', description: 'Open a session on an account whose credentials are already saved', args: { instance: 'MyChart hostname' } },
  { name: 'check_session', group: 'Account', description: 'Check whether the current MyChart session is still valid', args: { instance: 'optional' } },
  {
    name: 'complete_2fa',
    group: 'Account',
    description: 'Finish a setup_account flow that returned need_2fa',
    args: { pending_id: 'pending_id from setup_account', code: '6-digit code', instance: 'optional' },
  },
  {
    name: 'disconnect_account',
    group: 'Account',
    write: {
      title: 'Forget MyChart Account',
      description: 'Deletes the saved credentials and session for this account.',
      verb: 'Forget',
    },
    description:
      'Forget a saved MyChart account — deletes the stored credentials and session. Data tools stop working until it is set up again.',
    args: { account: 'account id from list_accounts' },
  },

  // ── Patients (proxy access) ──
  {
    name: 'list_proxy_targets',
    group: 'Patients',
    description:
      "Every patient record this account can reach — the account holder plus family members reachable by proxy access — and which one is active. Data tools always read the ACTIVE record.",
    args: { instance: 'optional' },
  },
  {
    name: 'switch_proxy_target',
    group: 'Patients',
    write: {
      title: 'Switch Patient Record',
      description: 'Changes which patient record every tool reads from here on.',
      verb: 'Switch',
    },
    description:
      'Switch which patient record MyChart is showing. Changes server-side state: every data tool reads the new record afterwards. Pass patient: "me" to go back to the account holder.',
    args: { patient: 'patient name from list_proxy_targets, or "me"', instance: 'optional' },
  },

  // ── Record ──
  { name: 'get_profile', group: 'Record', description: 'Patient profile — name, date of birth, MRN, primary care provider', args: { instance: 'optional' } },
  { name: 'get_health_summary', group: 'Record', description: 'Health summary — blood type, height, weight, BMI, latest vitals', args: { instance: 'optional' } },
  { name: 'get_medications', group: 'Record', description: 'Current medication list with directions, refills, and pharmacy', args: { instance: 'optional' } },
  { name: 'get_allergies', group: 'Record', description: 'Allergies and reactions', args: { instance: 'optional' } },
  { name: 'get_health_issues', group: 'Record', description: 'Problem list — active and resolved conditions', args: { instance: 'optional' } },
  { name: 'get_medical_history', group: 'Record', description: 'Past conditions, surgical history, and family history', args: { instance: 'optional' } },
  { name: 'get_vitals', group: 'Record', description: 'Vitals history — blood pressure, heart rate, weight, BMI', args: { instance: 'optional' } },
  { name: 'get_immunizations', group: 'Record', description: 'Immunization records', args: { instance: 'optional' } },
  { name: 'get_care_team', group: 'Record', description: 'Care team members and their contact numbers', args: { instance: 'optional' } },
  { name: 'get_emergency_contacts', group: 'Record', description: 'Emergency contacts on file', args: { instance: 'optional' } },
  { name: 'get_goals', group: 'Record', description: 'Care team and patient goals', args: { instance: 'optional' } },
  { name: 'get_preventive_care', group: 'Record', description: 'Preventive care items — what is due, overdue, or complete', args: { instance: 'optional' } },

  // ── Results ──
  {
    name: 'get_lab_results',
    group: 'Results',
    description:
      'Lab results with components, units, reference ranges, and flags. Paginated — pass limit: 50 to get the full history in one call',
    args: { instance: 'optional', limit: 'number (default 10)', offset: 'number' },
  },
  {
    name: 'get_imaging_results',
    group: 'Results',
    description:
      'Imaging and radiology studies with the full narrative impression. Studies that have viewable pictures carry an image_id — pass it to download_imaging_study',
    args: { instance: 'optional', limit: 'number', offset: 'number' },
  },
  {
    name: 'download_imaging_study',
    group: 'Results',
    description:
      'Download every picture in one imaging study and attach them to the reply. Identify the study with its image_id from get_imaging_results, or its 0-based imaging_index',
    args: { image_id: 'image_id from get_imaging_results', imaging_index: 'alternative: 0-based index', study_name: 'optional label', instance: 'optional' },
  },
  { name: 'get_upcoming_orders', group: 'Results', description: 'Orders placed but not yet completed — labs, imaging, procedures', args: { instance: 'optional' } },

  // ── Visits ──
  { name: 'get_upcoming_visits', group: 'Visits', description: 'Scheduled upcoming appointments', args: { instance: 'optional' } },
  { name: 'get_past_visits', group: 'Visits', description: 'Past visit history with reasons and diagnoses', args: { instance: 'optional', years_back: 'number' } },
  { name: 'get_visit_notes', group: 'Visits', description: 'Clinical notes attached to a past visit', args: { csn: 'visit id from get_past_visits', instance: 'optional' } },
  {
    name: 'get_note_content',
    group: 'Visits',
    description: 'Rendered text of one clinical note. Every id comes from the get_visit_notes entry you picked',
    args: { csn: 'visit id', lrp_id: 'lrpId from get_visit_notes', hno_id: 'hnoId of the chosen note', hno_dat: 'hnoDat of the chosen note', instance: 'optional' },
  },
  { name: 'get_visit_avs', group: 'Visits', description: 'After Visit Summary for a past visit', args: { csn: 'visit id', instance: 'optional' } },
  { name: 'get_care_journeys', group: 'Visits', description: 'Care journeys and longitudinal care plans', args: { instance: 'optional' } },
  { name: 'get_referrals', group: 'Visits', description: 'Referrals, their status, and expiry dates', args: { instance: 'optional' } },

  // ── Documents ──
  { name: 'get_letters', group: 'Documents', description: 'Letters and after-visit summaries. Each entry carries the hno_id and csn get_letter_details needs', args: { instance: 'optional' } },
  {
    name: 'get_letter_details',
    group: 'Documents',
    description: 'The full contents of one letter listed by get_letters',
    args: { hno_id: 'hnoId from the chosen get_letters entry', csn: 'csn from the same entry', instance: 'optional' },
  },
  { name: 'get_documents', group: 'Documents', description: 'Clinical documents on file', args: { instance: 'optional' } },
  { name: 'get_questionnaires', group: 'Documents', description: 'Assigned questionnaires and health assessments', args: { instance: 'optional' } },
  { name: 'get_education_materials', group: 'Documents', description: 'Patient education materials assigned by the care team', args: { instance: 'optional' } },
  { name: 'get_activity_feed', group: 'Documents', description: 'Recent portal activity feed', args: { instance: 'optional' } },
  { name: 'get_ehi_export', group: 'Documents', description: 'Electronic Health Information export formats (Cures Act)', args: { instance: 'optional' } },
  { name: 'get_linked_accounts', group: 'Documents', description: 'Linked MyChart accounts at other health systems', args: { instance: 'optional' } },

  // ── Money ──
  {
    name: 'get_billing',
    group: 'Billing',
    description: 'Billing history — charges, insurance paid, patient responsibility. Paginated — pass limit: 50 to get everything',
    args: { instance: 'optional', limit: 'number (default 10)', offset: 'number' },
  },
  { name: 'get_insurance', group: 'Billing', description: 'Insurance plan, member id, copays, deductible', args: { instance: 'optional' } },

  // ── Messaging ──
  {
    name: 'get_messages',
    group: 'Messaging',
    description: 'Message threads with the care team, including every message in each thread. Paginated — pass limit: 50 to get everything',
    args: { instance: 'optional', limit: 'number (default 10)', offset: 'number' },
  },
  {
    name: 'get_message_thread',
    group: 'Messaging',
    description: 'Every message in one conversation',
    args: { conversation_id: 'thread id from get_messages', instance: 'optional' },
  },
  { name: 'get_message_recipients', group: 'Messaging', description: 'Providers and departments that can receive a new message', args: { instance: 'optional' } },
  { name: 'get_message_topics', group: 'Messaging', description: 'Topics a new message can be filed under. send_message resolves the topic itself, so this is rarely needed', args: { instance: 'optional' } },
  {
    name: 'delete_message',
    group: 'Messaging',
    write: {
      title: 'Delete Conversation',
      description: 'Deletes this conversation from your MyChart inbox.',
      verb: 'Delete',
    },
    description: 'Delete a conversation from the inbox. Confirm with the user before deleting.',
    args: { conversation_id: 'thread id from get_messages', instance: 'optional' },
  },
  {
    name: 'send_message',
    group: 'Messaging',
    write: {
      title: 'Send Message',
      description: 'Sends a new message to your care team.',
      verb: 'Send',
    },
    description: 'Send a new message to the care team. Confirm with the user before sending.',
    args: { recipient_name: 'provider name (fuzzy match)', topic: 'topic name', subject: 'subject line', message: 'body text', instance: 'optional' },
  },
  {
    name: 'send_reply',
    group: 'Messaging',
    write: {
      title: 'Send Reply',
      description: 'Replies to an existing conversation.',
      verb: 'Send',
    },
    description: 'Reply to an existing message thread. Confirm with the user before sending.',
    args: { conversation_id: 'thread id from get_messages', message: 'reply text', instance: 'optional' },
  },

  // ── Actions ──
  {
    name: 'request_refill',
    group: 'Actions',
    write: {
      title: 'Request Refill',
      description: 'Submits a medication refill request.',
      verb: 'Request',
    },
    description: 'Request a medication refill. Confirm with the user before submitting.',
    args: { medication_name: 'medication name (fuzzy match)', instance: 'optional' },
  },
  { name: 'get_available_appointments', group: 'Actions', description: 'Open appointment slots by provider and visit type', args: { provider_name: 'optional filter', visit_type: 'optional filter', instance: 'optional' } },
  {
    name: 'book_appointment',
    group: 'Actions',
    write: {
      title: 'Book Appointment',
      description: 'Books this appointment slot.',
      verb: 'Book',
    },
    description: 'Book an open appointment slot. Confirm with the user before booking.',
    args: { slot_id: 'slot id from get_available_appointments', reason: 'reason for visit', instance: 'optional' },
  },
  {
    name: 'add_emergency_contact',
    group: 'Actions',
    write: {
      title: 'Add Emergency Contact',
      description: 'Adds a new emergency contact to your record.',
      verb: 'Add',
    },
    description: 'Add an emergency contact. Confirm with the user first.',
    args: { name: 'contact name', relationship_type: 'relationship', phone_number: 'phone number', instance: 'optional' },
  },
  {
    name: 'update_emergency_contact',
    group: 'Actions',
    write: {
      title: 'Update Emergency Contact',
      description: 'Changes an emergency contact on your record.',
      verb: 'Update',
    },
    description: 'Update an emergency contact. Confirm with the user first.',
    args: { id: 'contact id', name: 'optional', relationship_type: 'optional', phone_number: 'optional', instance: 'optional' },
  },
  {
    name: 'remove_emergency_contact',
    group: 'Actions',
    write: {
      title: 'Remove Emergency Contact',
      description: 'Removes an emergency contact from your record.',
      verb: 'Remove',
    },
    description: 'Remove an emergency contact. Confirm with the user first.',
    args: { id: 'contact id', instance: 'optional' },
  },
];

export const TOOL_NAMES: string[] = TOOL_SPECS.map((t) => t.name);
const SPEC_BY_NAME = new Map(TOOL_SPECS.map((t) => [t.name, t]));

/**
 * Old names that still resolve, exactly as the registry keeps `aliases` on the
 * capabilities it has renamed. A model working from a stale prompt — or a
 * visitor's bookmarked transcript — should not hit "unknown tool".
 */
const TOOL_ALIASES: Record<string, string> = {
  get_xray_image: 'download_imaging_study',
  get_linked_mychart_accounts: 'get_linked_accounts',
  list_patients: 'list_proxy_targets',
  get_active_patient: 'list_proxy_targets',
  switch_patient: 'switch_proxy_target',
};

/** Canonical name for a tool, resolving any alias. */
export function resolveToolName(name: string): string {
  return TOOL_ALIASES[name] ?? name;
}

/**
 * The write half of the catalogue, derived rather than listed.
 *
 * Everything downstream of write-ness — the exclusivity rule, the system
 * prompt's list of tools that open a dialog, the dialog copy itself — reads
 * from here, so a tool declared with `write` is gated from the first render
 * and a tool declared without it is a plain read. There is no second list to
 * forget to update.
 */
export const WRITE_TOOL_SPECS: ToolSpec[] = TOOL_SPECS.filter((t) => t.write);

export const WRITE_TOOL_NAMES: string[] = WRITE_TOOL_SPECS.map((t) => t.name);

/**
 * The half of the catalogue the model is actually offered.
 *
 * Account tools manage credentials on the device rather than anything in a
 * chart, and the demo drops the visitor into a connected account — so they are
 * implemented and callable, but never named in the prompt. Deriving the
 * prompt's lists from here keeps it from advertising a tool it doesn't list.
 */
export const AGENT_TOOL_SPECS: ToolSpec[] = TOOL_SPECS.filter((t) => t.group !== 'Account');

export const AGENT_WRITE_TOOL_NAMES: string[] = AGENT_TOOL_SPECS.filter((t) => t.write).map((t) => t.name);

export function isWriteTool(name: string): boolean {
  return Boolean(SPEC_BY_NAME.get(resolveToolName(name))?.write);
}

export function getToolSpec(name: string): ToolSpec | undefined {
  return SPEC_BY_NAME.get(resolveToolName(name));
}

/* ── Argument helpers ───────────────────────────────────────────────── */

/**
 * Read a string argument out of a model-emitted tool call.
 *
 * The demo declares every tool's args in TOOL_SPECS, so what a field *should*
 * be is known; what arrives is whatever the model emitted, which is why the
 * value is `unknown` rather than typed. Numbers and booleans convert, since
 * that is lossless and a model answering `5` for a numeric field is ordinary.
 *
 * Anything structural is treated as absent rather than rendered: bare
 * `String(value)`, which this replaces, put the literal "[object Object]" into
 * a message body the demo then displayed as if the visitor had typed it. The
 * demo has no way to raise this to a person mid-turn — unlike the real client,
 * which throws by name — so absent is the honest reading.
 */
function str(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function num(args: ToolArgs, key: string, fallback: number): number {
  const value = Number(args[key]);
  return Number.isFinite(value) ? value : fallback;
}

type Page<T> = { total: number; offset: number; count: number; page: T[] };

function paginate<T>(list: T[], args: ToolArgs): Page<T> {
  const offset = num(args, 'offset', 0);
  const limit = num(args, 'limit', 10);
  return {
    total: list.length,
    offset,
    count: Math.min(limit, Math.max(0, list.length - offset)),
    page: list.slice(offset, offset + limit),
  };
}

/**
 * Does `candidate` match what a person typed?
 *
 * Substring matching alone is not enough. Patients say "Dr. Hibbert"; the
 * record says "Dr. Julius Hibbert"; and `"dr. julius hibbert".includes("dr.
 * hibbert")` is false, so the middle name silently loses the match. Fall back
 * to tokens: every word typed has to appear somewhere, in any order.
 */
export function matchesName(candidate: string, query: string): boolean {
  const c = candidate.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (c === q || c.includes(q)) return true;
  return q.split(/\s+/).every((token) => c.includes(token));
}

function fuzzyFind<T>(list: T[], query: string, key: (item: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = list.filter((item) => key(item).toLowerCase() === q);
  if (exact.length) return exact;
  return list.filter((item) => matchesName(key(item), q));
}

function fail(message: string): ToolError {
  return { error: message };
}

/**
 * Resolve a patient the way the real proxy tools do: "me"/"self"/"myself" mean
 * the account holder, anything else is matched against the switcher's names
 * and then against the full name on the profile page.
 */
export function findPatient(session: Session, query: string): PatientState | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  if (q === 'me' || q === 'self' || q === 'myself') return selfPatient(session);
  return (
    session.patients.find((p) => p.name.toLowerCase() === q) ??
    session.patients.find((p) => matchesName(p.name, q)) ??
    session.patients.find((p) => matchesName(p.record.profile.name, q))
  );
}

/**
 * The active-patient assertion, mirroring `executeCapability` in the registry.
 *
 * MyChart's active patient is server-side state, so a read never follows the
 * `patient` argument — it checks it. An omitted `patient` means the account
 * holder explicitly, not "whatever record we happen to be on", which is why a
 * plain get_medications refuses while the session sits on a child's chart
 * instead of quietly answering about the wrong person.
 */
function assertActivePatient(session: Session, args: ToolArgs): ToolError | null {
  const active = activePatient(session);
  const query = str(args, 'patient').trim();
  const wanted = query ? findPatient(session, query) : selfPatient(session);
  if (!wanted) {
    return fail(
      `No patient matching "${query}". list_proxy_targets shows every record this account can access.`,
    );
  }
  if (wanted.id === active.id) return null;
  return fail(
    `Refusing to read: MyChart is currently on ${active.name}, but this call is about ` +
      `'${wanted.name}'. The active patient is server-side MyChart state and reading never changes it. ` +
      `Call switch_proxy_target with patient: ${JSON.stringify(wanted.name)} to switch deliberately, then ` +
      'retry. list_proxy_targets shows every record this account can access.',
  );
}

/**
 * Pick the topic a new message is filed under.
 *
 * Mirrors the registry: an unmatched topic is substituted rather than rejected,
 * and the substitution is reported back so the patient is never told a message
 * went out under a category it didn't.
 */
function resolveTopic(topics: MessageTopic[], requested: string): { topic: MessageTopic; substituted: boolean } {
  // Every record seeds at least one topic, so the fallback is unreachable.
  const first = topics[0] ?? { displayName: 'Medical Question', value: 'TOPIC-001' };
  if (!requested.trim()) return { topic: first, substituted: false };
  const matched = topics.find((t) => t.displayName.toLowerCase() === requested.trim().toLowerCase())
    ?? topics.find((t) => matchesName(t.displayName, requested));
  return matched ? { topic: matched, substituted: false } : { topic: first, substituted: true };
}

/**
 * Fixed "today" so the fictional record stays internally consistent no matter
 * when someone opens the demo.
 */
function today(): string {
  return '2026-03-21';
}

/* ── Handlers ───────────────────────────────────────────────────────── */

type Handler = (session: Session, args: ToolArgs) => ToolResult;

const HANDLERS: Record<string, Handler> = {
  // ── Session / account ──
  list_accounts: (s) =>
    s.configured
      ? [
          {
            account: `${s.username}@${s.hostname}`,
            hostname: s.hostname,
            username: s.username,
            configured: true,
            connected: s.connected,
            hasTotpSecret: true,
            hasPasskeyCredential: true,
          },
        ]
      : [],

  search_mycharts: (_s, args) => {
    const query = str(args, 'query').trim().toLowerCase();
    if (!query) return fail('Pass a query — a few letters of the health system name.');
    const limit = num(args, 'limit', 10);
    const matches = data.directory
      .filter((entry) => entry.name.toLowerCase().includes(query) || entry.hostname.toLowerCase().includes(query))
      .slice(0, limit)
      .map((entry) => ({
        hostname: entry.hostname,
        name: entry.name,
        logoUrl: `https://${entry.hostname}/en-US/assets/logo.png`,
        loginUrl: `https://${entry.hostname}/MyChart/`,
      }));
    return { query: str(args, 'query'), count: matches.length, matches };
  },

  /**
   * The real setup flow: hostname + credentials in, one of three states out.
   * The demo picks the state off the username the way fake-mychart does —
   * anything starting with "marge" has two-factor turned on — so the 2FA
   * branch is reachable without a real portal.
   *
   * Whatever credentials go in, the chart that comes out is the same fictional
   * one. Nothing typed here leaves the browser, and there is nothing to check
   * it against.
   */
  setup_account: (s, args) => {
    const hostname = str(args, 'hostname').trim().toLowerCase();
    const username = str(args, 'username').trim();
    const password = str(args, 'password');
    if (!hostname) {
      return fail(`Pass the MyChart hostname. Call search_mycharts to look one up — this demo serves ${s.hostname}.`);
    }
    if (!data.directory.some((entry) => entry.hostname === hostname)) {
      return fail(`No MyChart instance at "${hostname}". Call search_mycharts to find the right hostname.`);
    }
    if (!username || !password) {
      return { state: 'invalid_login', account: hostname, message: 'MyChart needs both a username and a password.' };
    }

    if (username.toLowerCase().startsWith('marge')) {
      const pendingId = `pending-${s.activityLog.length + 1}`;
      s.pendingLogin = { pendingId, hostname, username };
      return {
        state: 'need_2fa',
        pending_id: pendingId,
        account: hostname,
        delivery: 'Email ending in ****@example.com',
        message:
          'MyChart sent a 6-digit verification code. Ask the user for it, then call complete_2fa with this pending_id and the code.',
      };
    }

    s.configured = true;
    s.connected = true;
    s.hostname = hostname;
    s.username = username;
    logActivity(s, 'account', `Connected ${username}@${hostname}`);
    return {
      state: 'logged_in',
      account: `${username}@${hostname}`,
      // The real MCPB recommends a passkey here rather than registering one —
      // enrolling a sign-in factor on someone's medical record is their call.
      // This demo has no passkey tools, so it just reports the login.
      passkey_saved: false,
      message: 'Account connected. Nothing was changed about how this account signs in.',
    };
  },

  connect_instance: (s) => {
    if (!s.configured) {
      return fail('No MyChart account is configured. Call setup_account with the hostname, username, and password.');
    }
    s.connected = true;
    return { status: 'logged_in', hostname: s.hostname, username: s.username };
  },

  check_session: (s) => ({
    hostname: s.hostname,
    username: s.username,
    configured: s.configured,
    connected: s.connected,
    cookiesValid: s.connected,
  }),

  complete_2fa: (s, args) => {
    const code = str(args, 'code');
    if (code && code.replace(/\D/g, '').length !== 6) return fail('Two-factor codes are 6 digits.');
    const pendingId = str(args, 'pending_id');
    const pending = s.pendingLogin;
    // A pending_id is required only once setup_account has actually issued
    // one; the demo's own auto-connect path calls this with just a code.
    if (pending && pendingId && pendingId !== pending.pendingId) {
      return fail('pending_id is unknown or has expired. Call setup_account again to start over.');
    }
    if (pending) {
      s.hostname = pending.hostname;
      s.username = pending.username;
      s.pendingLogin = null;
      logActivity(s, 'account', `Connected ${pending.username}@${pending.hostname}`);
    }
    s.configured = true;
    s.connected = true;
    return {
      state: 'logged_in',
      status: 'logged_in',
      account: `${s.username}@${s.hostname}`,
      passkey_saved: false,
      message: '2FA completed successfully. Account connected.',
      hostname: s.hostname,
      username: s.username,
    };
  },

  disconnect_account: (s, args) => {
    const account = str(args, 'account');
    const id = `${s.username}@${s.hostname}`;
    if (account && account !== id && account !== s.hostname) {
      return fail(`No account "${account}" is configured. Call list_accounts for the exact id.`);
    }
    if (!s.configured) return fail(`No account "${id}" is configured — nothing to disconnect.`);
    s.configured = false;
    s.connected = false;
    logActivity(s, 'account', `Forgot ${id}`);
    return {
      success: true,
      account: id,
      message: `Forgot ${id}. The saved credentials, passkey, and session are gone — set the account up again to read this record.`,
    };
  },

  // ── Patients (proxy access) ──
  list_proxy_targets: (s) => {
    const active = activePatient(s);
    return {
      count: s.patients.length,
      patients: s.patients.map((p) => ({
        id: p.id,
        name: p.name,
        is_self: p.isSelf,
        is_active: p.id === active.id,
        relationship: p.relationship,
      })),
      active_patient: active.name,
      profile_name: active.record.profile.name,
      message: [
        `Data tools on this account currently read ${active.name}'s record.`,
        s.patients.length === 1
          ? 'No other patient records are accessible from this account.'
          : 'To read a different patient, call switch_proxy_target with their name — data tools never switch on their own.',
      ].join(' '),
    };
  },

  switch_proxy_target: (s, args) => {
    const query = str(args, 'patient').trim();
    if (!query) {
      return fail(
        'Pass the patient to switch to — a name from list_proxy_targets, or "me" for the account holder\'s own record.',
      );
    }
    const wanted = findPatient(s, query);
    if (!wanted) {
      return fail(
        `No patient matching "${query}". This account can reach: ${s.patients.map((p) => p.name).join(', ')}.`,
      );
    }
    s.activePatientId = wanted.id;
    logActivity(s, 'patient', `Switched the active record to ${wanted.name}`);
    return {
      switched_to: wanted.name,
      is_self: wanted.isSelf,
      verified_profile_name: wanted.record.profile.name,
      verified_dob: wanted.record.profile.dateOfBirth,
      message:
        `Every data tool on this account now reads ${wanted.name}'s record` +
        `${wanted.isSelf ? " (the account holder's own chart)" : ''}.` +
        (wanted.isSelf ? '' : ' Switch back with patient: "me" when done.'),
    };
  },

  // ── Record ──
  //
  // Everything below reads `record(s)` — the ACTIVE patient's chart — never
  // the module-level fixtures. That is what makes switch_proxy_target real.
  get_profile: (s) => clone(record(s).profile),
  get_health_summary: (s) => clone(record(s).healthSummary),
  get_medications: (s) => clone(s.medications),
  get_allergies: (s) => clone(record(s).allergies),
  get_health_issues: (s) => clone(record(s).healthIssues),
  get_medical_history: (s) => clone(record(s).medicalHistory),
  get_vitals: (s) => clone(record(s).vitals),
  get_immunizations: (s) => clone(record(s).immunizations),
  get_care_team: (s) => clone(record(s).careTeam),
  get_emergency_contacts: (s) => clone(s.emergencyContacts),
  get_goals: (s) => clone(record(s).goals),
  get_preventive_care: (s) => clone(record(s).preventiveCare),

  // ── Results ──
  get_lab_results: (s, args) => {
    const { total, offset, count, page } = paginate(record(s).labResults, args);
    return { total, offset, count, results: clone(page) };
  },
  get_imaging_results: (s, args) => {
    const { total, offset, count, page } = paginate(record(s).imagingResults, args);
    // `index` and `image_id` are added here rather than stored, exactly as the
    // registry does it: the index is only meaningful against the list the
    // caller just received, and the image_id is the token that names the
    // pictures. Series detail stays out — download_imaging_study reports it.
    return {
      total,
      offset,
      count,
      results: page.map((study, i) => {
        const { series: _series, imageId, ...rest } = study;
        return { ...clone(rest), index: offset + i, ...(imageId ? { image_id: imageId } : {}) };
      }),
    };
  },

  /**
   * The one tool whose payload isn't plain JSON in the real product: it
   * downloads and decodes the study's pictures on the user's own device. The
   * demo can't decode anything, so it enumerates the same series metadata and
   * flags the attachment the UI renders as a radiograph.
   */
  download_imaging_study: (s, args) => {
    const studies = record(s).imagingResults;
    const imageId = str(args, 'image_id').trim();
    let study;

    if (imageId) {
      study = studies.find((r) => r.imageId === imageId);
      if (!study) {
        return fail('Invalid image_id — expected the image_id value from a get_imaging_results entry.');
      }
    } else if (args.imaging_index !== undefined && args.imaging_index !== null && args.imaging_index !== '') {
      const index = num(args, 'imaging_index', -1);
      if (!Number.isInteger(index) || index < 0) {
        return fail('imaging_index must be a non-negative integer from get_imaging_results.');
      }
      study = studies[index];
      if (!study) return fail(`No imaging result at index ${index} (this record has ${studies.length}).`);
    } else {
      return fail('Pass either image_id (from get_imaging_results) or imaging_index.');
    }

    if (!study.imageId) {
      return fail(`"${study.study}" has no viewable images — the report is the whole result.`);
    }

    let next = 0;
    const images = study.series.flatMap((series) =>
      Array.from({ length: series.imageCount }, () => ({
        index: next++,
        seriesUID: series.seriesUID,
        seriesDescription: series.seriesDescription,
      })),
    );

    return {
      studyName: str(args, 'study_name') || study.study,
      date: study.date,
      format: 'JPEG',
      totalImages: images.length,
      images,
      errors: [],
      // The UI watches for this flag and renders the simulated radiograph.
      attachment: { kind: 'xray', label: `${study.study} — ${study.date}` },
      note: "Images decoded from the portal's CLO wavelet format on this device and attached to the reply.",
    };
  },

  get_upcoming_orders: (s) => clone(record(s).upcomingOrders),

  // ── Visits ──
  get_upcoming_visits: (s) => clone(s.upcomingVisits),
  get_past_visits: (s, args) => {
    const visits = record(s).pastVisits;
    const yearsBack = num(args, 'years_back', 0);
    if (!yearsBack) return clone(visits);
    const cutoff = new Date(today());
    cutoff.setFullYear(cutoff.getFullYear() - yearsBack);
    return clone(visits.filter((v) => new Date(v.date) >= cutoff));
  },
  get_visit_notes: (s, args) => {
    const csn = str(args, 'csn');
    const notes = record(s).visitNotes;
    if (csn && csn !== notes.csn) {
      return { csn, notes: [], message: 'No clinical notes are attached to this visit.' };
    }
    return clone(notes);
  },
  get_note_content: (s, args) => {
    const byId = record(s).noteContentByHnoId;
    const content = byId[str(args, 'hno_id')] ?? Object.values(byId)[0];
    return clone(content);
  },
  get_visit_avs: (s) => clone(record(s).visitAVS),
  get_care_journeys: (s) => clone(record(s).careJourneys),
  get_referrals: (s) => clone(record(s).referrals),

  // ── Documents ──
  get_letters: (s) => clone(record(s).letters),
  /**
   * One letter's body. The real scraper returns a single `bodyHTML` field and
   * answers an unknown hnoId with an empty one — a JSON null from the portal —
   * so an id that isn't on file comes back empty here too rather than erroring.
   */
  get_letter_details: (s, args) => {
    const hnoId = str(args, 'hno_id');
    if (!hnoId) return fail('hno_id is required — take it from the get_letters entry you want.');
    return clone(record(s).letterDetailsByHnoId[hnoId] ?? { bodyHTML: '' });
  },
  get_documents: (s) => clone(record(s).documents),
  get_questionnaires: (s) => clone(record(s).questionnaires),
  get_education_materials: (s) => clone(record(s).educationMaterials),
  get_activity_feed: (s) => clone(record(s).activityFeed),
  get_ehi_export: (s) => clone(record(s).ehiExport),
  get_linked_accounts: (s) => clone(record(s).linkedAccounts),

  // ── Money ──
  get_billing: (s, args) => {
    const { total, offset, count, page } = paginate(record(s).billing, args);
    return { totalVisits: total, offset, count, visits: clone(page) };
  },
  get_insurance: (s) => clone(record(s).insurance),

  // ── Messaging ──
  get_messages: (s, args) => {
    const { total, offset, count, page } = paginate(s.messages, args);
    return { total, offset, count, conversations: clone(page) };
  },
  /**
   * One thread, in MyChart's own field names — `senderName`, `sentDate`,
   * `messageBody`, `isFromPatient` — rather than the demo's internal shape.
   * get_messages already inlines every message, so this is the tool a model
   * reaches for when it has an id and wants only that conversation.
   */
  get_message_thread: (s, args) => {
    const conversationId = str(args, 'conversation_id');
    if (!conversationId) return fail('conversation_id is required. Call get_messages for valid ids.');
    const thread = s.messages.find((m) => m.id === conversationId);
    if (!thread) return fail(`No conversation with id "${conversationId}". Call get_messages for valid ids.`);
    const patientName = record(s).profile.name;
    return {
      conversationId: thread.id,
      subject: thread.subject,
      messages: thread.messages.map((message, i) => ({
        messageId: `${thread.id}-m${i + 1}`,
        senderName: message.from,
        sentDate: message.date,
        messageBody: message.body,
        isFromPatient: matchesName(patientName, message.from),
      })),
    };
  },

  get_message_recipients: (s) => ({ recipients: clone(record(s).messageRecipients) }),
  get_message_topics: (s) => ({ topics: clone(record(s).messageTopics) }),

  delete_message: (s, args) => {
    const conversationId = str(args, 'conversation_id');
    const index = s.messages.findIndex((m) => m.id === conversationId);
    if (index === -1) return fail(`No conversation with id "${conversationId}". Call get_messages for valid ids.`);
    // index !== -1, so splice removes exactly one conversation.
    const removed = s.messages.splice(index, 1)[0]!;
    logActivity(s, 'message', `Deleted "${removed.subject}"`);
    return {
      success: true,
      conversationId: removed.id,
      subject: removed.subject,
      message: `Deleted the conversation "${removed.subject}".`,
    };
  },

  send_message: (s, args) => {
    const recipients = record(s).messageRecipients;
    const recipientName = str(args, 'recipient_name');
    const matched = fuzzyFind(recipients, recipientName, (r) => r.displayName);
    if (matched.length === 0) {
      const available = recipients.map((r) => r.displayName).join(', ');
      return fail(`No recipient matching "${recipientName}". Available: ${available}`);
    }
    if (matched.length > 1) {
      return fail(
        `Multiple recipients match "${recipientName}": ${matched.map((r) => r.displayName).join(', ')}. Please be more specific.`,
      );
    }

    const subject = str(args, 'subject');
    // `message` is the registry's name for this argument; `message_body` is
    // what the demo advertised for a while and what a model may still emit.
    const body = str(args, 'message') || str(args, 'message_body');
    if (!subject || !body) return fail('Both subject and message are required.');

    // The two guards above leave exactly one match.
    const recipient = matched[0]!.displayName;
    const requestedTopic = str(args, 'topic');
    const { topic, substituted } = resolveTopic(record(s).messageTopics, requestedTopic);
    const patientName = record(s).profile.name;
    const id = `msg-sent-${s.messages.length + 1}`;
    const thread: Conversation = {
      id,
      subject,
      from: patientName,
      date: today(),
      preview: body.slice(0, 90),
      sentThisSession: true,
      messages: [{ from: patientName, date: today(), body }],
    };
    s.messages.unshift(thread);
    logActivity(s, 'message', `Sent "${subject}" to ${recipient}`);
    return {
      success: true,
      conversationId: id,
      recipient,
      sent_to: recipient,
      subject,
      topic_used: topic.displayName,
      // A silent substitution is one the patient never gets told about, so the
      // registry reports it and so does this.
      ...(substituted
        ? { topic_substituted: `No topic matched "${requestedTopic}"; used "${topic.displayName}" instead.` }
        : {}),
    };
  },

  send_reply: (s, args) => {
    const conversationId = str(args, 'conversation_id');
    const thread = s.messages.find((m) => m.id === conversationId);
    if (!thread) return fail(`No conversation with id "${conversationId}". Call get_messages for valid ids.`);
    const body = str(args, 'message') || str(args, 'message_body');
    if (!body) return fail('message is required.');
    const patientName = record(s).profile.name;
    thread.messages.push({ from: patientName, date: today(), body });
    thread.date = today();
    logActivity(s, 'message', `Replied to "${thread.subject}"`);
    return { success: true, conversationId: thread.id, subject: thread.subject };
  },

  // ── Actions ──
  request_refill: (s, args) => {
    const query = str(args, 'medication_name');
    const matched = fuzzyFind<Medication>(s.medications, query, (m) => m.name);
    if (matched.length === 0) {
      return fail(`No medication matching "${query}". Available: ${s.medications.map((m) => m.name).join(', ')}`);
    }
    if (matched.length > 1) {
      return fail(`Multiple medications match "${query}": ${matched.map((m) => m.name).join(', ')}. Please be more specific.`);
    }
    // The two guards above leave exactly one match.
    const med = matched[0]!;
    if (med.refillsRemaining <= 0) {
      return fail(
        `"${med.name}" has no refills remaining. Your provider has to authorize a new prescription — message them instead.`,
      );
    }
    med.refillsRemaining -= 1;
    med.lastFilled = today();
    logActivity(s, 'refill', `Requested a refill of ${med.name}`);
    return {
      success: true,
      medication: med.name,
      pharmacy: med.pharmacy,
      refillsRemaining: med.refillsRemaining,
      message: `Refill request submitted for ${med.name}. ${med.pharmacy} will be notified.`,
    };
  },

  get_available_appointments: (s, args) => {
    let results: AppointmentOffer[] = s.availableAppointments.filter((r) => r.slots.length > 0);
    const open = results;
    const provider = str(args, 'provider_name');
    if (provider) results = results.filter((r) => matchesName(r.provider, provider));
    const visitType = str(args, 'visit_type');
    if (visitType) results = results.filter((r) => matchesName(r.visitType, visitType));
    if (results.length === 0) {
      // Say what IS bookable, the way the recipient and medication lookups do.
      // A model that invents a filter value ("visit_type: New Appointment")
      // otherwise dead-ends here and tells the patient there is nothing free.
      const providers = [...new Set(open.map((r) => r.provider))].join(', ');
      const types = [...new Set(open.map((r) => r.visitType))].join(', ');
      return fail(
        `No available appointments matching your criteria. Open slots are with: ${providers}. Visit types: ${types}. Retry with one of these, or omit the filters.`,
      );
    }
    return clone(results);
  },

  book_appointment: (s, args) => {
    const slotId = str(args, 'slot_id');
    for (const provider of s.availableAppointments) {
      const idx = provider.slots.findIndex((slot) => slot.slotId === slotId);
      if (idx === -1) continue;
      // idx !== -1, so splice removes exactly one slot.
      const slot = provider.slots.splice(idx, 1)[0]!;
      s.upcomingVisits.push({
        type: provider.visitType,
        provider: provider.provider,
        department: provider.department,
        location: provider.location,
        date: slot.date,
        time: slot.time,
        status: 'Scheduled',
        bookedThisSession: true,
      });
      s.upcomingVisits.sort((a, b) => a.date.localeCompare(b.date));
      const confirmation = `SPRFLD-${slot.slotId.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
      logActivity(s, 'appointment', `Booked ${provider.visitType} with ${provider.provider} on ${slot.date} at ${slot.time}`);
      return {
        success: true,
        confirmationNumber: confirmation,
        provider: provider.provider,
        department: provider.department,
        location: provider.location,
        visitType: provider.visitType,
        date: slot.date,
        time: slot.time,
        reason: str(args, 'reason') || 'Not specified',
        message: `Appointment booked with ${provider.provider} on ${slot.date} at ${slot.time}.`,
      };
    }
    return fail(`Slot "${slotId}" is not available. Call get_available_appointments for open slots.`);
  },

  add_emergency_contact: (s, args) => {
    const name = str(args, 'name');
    const phone = str(args, 'phone_number');
    if (!name || !phone) return fail('name and phone_number are required.');
    const contact: EmergencyContact = {
      id: `ec-${String(s.emergencyContacts.length + 1).padStart(3, '0')}`,
      name,
      relationship: str(args, 'relationship_type') || 'Not specified',
      phone,
      addedThisSession: true,
    };
    s.emergencyContacts.push(contact);
    logActivity(s, 'contact', `Added emergency contact ${contact.name}`);
    return { success: true, contact: clone(contact), message: `Emergency contact ${contact.name} added.` };
  },

  update_emergency_contact: (s, args) => {
    const id = str(args, 'id');
    const contact = s.emergencyContacts.find((c) => c.id === id);
    if (!contact) return fail(`No emergency contact with id "${id}". Call get_emergency_contacts for valid ids.`);
    const name = str(args, 'name');
    const relationship = str(args, 'relationship_type');
    const phone = str(args, 'phone_number');
    if (name) contact.name = name;
    if (relationship) contact.relationship = relationship;
    if (phone) contact.phone = phone;
    logActivity(s, 'contact', `Updated emergency contact ${contact.name}`);
    return { success: true, contact: clone(contact), message: `Emergency contact ${contact.name} updated.` };
  },

  remove_emergency_contact: (s, args) => {
    const id = str(args, 'id');
    const idx = s.emergencyContacts.findIndex((c) => c.id === id);
    if (idx === -1) return fail(`No emergency contact with id "${id}". Call get_emergency_contacts for valid ids.`);
    // idx !== -1, so splice removes exactly one contact.
    const removed = s.emergencyContacts.splice(idx, 1)[0]!;
    logActivity(s, 'contact', `Removed emergency contact ${removed.name}`);
    return { success: true, message: `Emergency contact ${removed.name} removed.` };
  },
};

/**
 * Tools that run without a chart, so neither the credential check nor the
 * active-patient assertion applies to them: the account meta tools, and the
 * two proxy tools themselves. Guarding "you must already be on patient X" in
 * front of the tools that list and change X would make them unusable exactly
 * when they are needed — the registry exempts its `Patients` group for the
 * same reason.
 */
const CHARTLESS_TOOLS = new Set(
  TOOL_SPECS.filter((spec) => spec.group === 'Account' || spec.group === 'Patients').map((spec) => spec.name),
);

/**
 * Run one tool against the session. Never throws for a caller mistake — an
 * unknown tool or bad argument comes back as `{ error }` so the agent loop can
 * feed it to the model and let it recover, same as production.
 */
export function executeTool(session: Session, name: string, args: ToolArgs = {}): ToolResult {
  const canonical = resolveToolName(name);
  const handler = HANDLERS[canonical];
  if (!handler) return fail(`Unknown tool "${name}". Available tools: ${TOOL_NAMES.join(', ')}`);
  const toolArgs = args ?? {};

  if (!CHARTLESS_TOOLS.has(canonical)) {
    if (!session.configured) {
      return fail(
        `No MyChart account is configured — ${canonical} has nothing to read. Call setup_account with the hostname, username, and password to connect one.`,
      );
    }
    const mismatch = assertActivePatient(session, toolArgs);
    if (mismatch) return mismatch;
  }

  try {
    return handler(session, toolArgs);
  } catch (err) {
    return fail(`${canonical} failed: ${(err as Error).message}`);
  }
}

/**
 * Latency simulation. Real MyChart scrapes take a beat, and the tool-call
 * indicator is a big part of what the demo is showing off — instant results
 * would hide it.
 */
export function toolLatencyMs(name: string): number {
  const canonical = resolveToolName(name);
  // Downloading and decoding a study is the slowest thing the product does.
  if (canonical === 'download_imaging_study') return 1400;
  if (isWriteTool(canonical)) return 700;
  if (canonical.startsWith('get_') || canonical.startsWith('list_') || canonical.startsWith('search_')) return 320;
  return 500;
}
