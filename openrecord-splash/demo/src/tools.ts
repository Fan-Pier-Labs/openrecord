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
import type {
  AppointmentOffer,
  Conversation,
  EmergencyContact,
  Medication,
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

/**
 * Fresh, isolated copy of the record. One per demo session — hitting "reset"
 * throws this away and makes a new one.
 */
export function createSession(): Session {
  return {
    hostname: data.DEMO_HOSTNAME,
    username: data.DEMO_USERNAME,
    connected: false,
    medications: clone(data.medications),
    messages: clone(data.messages),
    emergencyContacts: clone(data.emergencyContacts),
    upcomingVisits: clone(data.upcomingVisits),
    availableAppointments: clone(data.availableAppointments),
    activityLog: [],
  };
}

function logActivity(session: Session, kind: string, summary: string): void {
  session.activityLog.push({ kind, summary, at: new Date().toISOString() });
}

/**
 * Tool catalogue. `args` is a name → description map used both to build the
 * model's system prompt and to render the tool browser in the UI.
 *
 * `write: true` marks the tools that change something in the portal. The agent
 * must call them alone and confirm with the user first, exactly like production.
 */
export const TOOL_SPECS: ToolSpec[] = [
  // ── Session / account ──
  { name: 'list_accounts', group: 'Account', description: 'List MyChart accounts configured on this device', args: {} },
  { name: 'connect_instance', group: 'Account', description: 'Log into a MyChart account and open a session', args: { instance: 'MyChart hostname' } },
  { name: 'check_session', group: 'Account', description: 'Check whether the current MyChart session is still valid', args: { instance: 'optional' } },
  { name: 'complete_2fa', group: 'Account', description: 'Finish a login that asked for a two-factor code', args: { code: '6-digit code', instance: 'optional' } },

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
  { name: 'get_imaging_results', group: 'Results', description: 'Imaging and radiology studies with the full narrative impression', args: { instance: 'optional', limit: 'number', offset: 'number' } },
  { name: 'get_xray_image', group: 'Results', description: 'Download the actual image pixels for an imaging study and attach them to the reply', args: { imaging_index: '0-based index from get_imaging_results', instance: 'optional' } },
  { name: 'get_upcoming_orders', group: 'Results', description: 'Orders placed but not yet completed — labs, imaging, procedures', args: { instance: 'optional' } },

  // ── Visits ──
  { name: 'get_upcoming_visits', group: 'Visits', description: 'Scheduled upcoming appointments', args: { instance: 'optional' } },
  { name: 'get_past_visits', group: 'Visits', description: 'Past visit history with reasons and diagnoses', args: { instance: 'optional', years_back: 'number' } },
  { name: 'get_visit_notes', group: 'Visits', description: 'Clinical notes attached to a past visit', args: { csn: 'visit id from get_past_visits', instance: 'optional' } },
  { name: 'get_note_content', group: 'Visits', description: 'Rendered text of one clinical note', args: { csn: 'visit id', hno_id: 'note id from get_visit_notes', instance: 'optional' } },
  { name: 'get_visit_avs', group: 'Visits', description: 'After Visit Summary for a past visit', args: { csn: 'visit id', instance: 'optional' } },
  { name: 'get_care_journeys', group: 'Visits', description: 'Care journeys and longitudinal care plans', args: { instance: 'optional' } },
  { name: 'get_referrals', group: 'Visits', description: 'Referrals, their status, and expiry dates', args: { instance: 'optional' } },

  // ── Documents ──
  { name: 'get_letters', group: 'Documents', description: 'Letters and after-visit summaries', args: { instance: 'optional' } },
  { name: 'get_documents', group: 'Documents', description: 'Clinical documents on file', args: { instance: 'optional' } },
  { name: 'get_questionnaires', group: 'Documents', description: 'Assigned questionnaires and health assessments', args: { instance: 'optional' } },
  { name: 'get_education_materials', group: 'Documents', description: 'Patient education materials assigned by the care team', args: { instance: 'optional' } },
  { name: 'get_activity_feed', group: 'Documents', description: 'Recent portal activity feed', args: { instance: 'optional' } },
  { name: 'get_ehi_export', group: 'Documents', description: 'Electronic Health Information export formats (Cures Act)', args: { instance: 'optional' } },
  { name: 'get_linked_mychart_accounts', group: 'Documents', description: 'Linked MyChart accounts at other health systems', args: { instance: 'optional' } },

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
  { name: 'get_message_recipients', group: 'Messaging', description: 'Who can be messaged, and the available topics', args: { instance: 'optional' } },
  {
    name: 'send_message',
    group: 'Messaging',
    write: true,
    description: 'Send a new message to the care team. Confirm with the user before sending.',
    args: { recipient_name: 'provider name (fuzzy match)', topic: 'topic name', subject: 'subject line', message_body: 'body text', instance: 'optional' },
  },
  {
    name: 'send_reply',
    group: 'Messaging',
    write: true,
    description: 'Reply to an existing message thread. Confirm with the user before sending.',
    args: { conversation_id: 'thread id from get_messages', message_body: 'reply text', instance: 'optional' },
  },

  // ── Actions ──
  {
    name: 'request_refill',
    group: 'Actions',
    write: true,
    description: 'Request a medication refill. Confirm with the user before submitting.',
    args: { medication_name: 'medication name (fuzzy match)', instance: 'optional' },
  },
  { name: 'get_available_appointments', group: 'Actions', description: 'Open appointment slots by provider and visit type', args: { provider_name: 'optional filter', visit_type: 'optional filter', instance: 'optional' } },
  {
    name: 'book_appointment',
    group: 'Actions',
    write: true,
    description: 'Book an open appointment slot. Confirm with the user before booking.',
    args: { slot_id: 'slot id from get_available_appointments', reason: 'reason for visit', instance: 'optional' },
  },
  {
    name: 'add_emergency_contact',
    group: 'Actions',
    write: true,
    description: 'Add an emergency contact. Confirm with the user first.',
    args: { name: 'contact name', relationship_type: 'relationship', phone_number: 'phone number', instance: 'optional' },
  },
  {
    name: 'update_emergency_contact',
    group: 'Actions',
    write: true,
    description: 'Update an emergency contact. Confirm with the user first.',
    args: { id: 'contact id', name: 'optional', relationship_type: 'optional', phone_number: 'optional', instance: 'optional' },
  },
  {
    name: 'remove_emergency_contact',
    group: 'Actions',
    write: true,
    description: 'Remove an emergency contact. Confirm with the user first.',
    args: { id: 'contact id', instance: 'optional' },
  },
];

export const TOOL_NAMES: string[] = TOOL_SPECS.map((t) => t.name);
const SPEC_BY_NAME = new Map(TOOL_SPECS.map((t) => [t.name, t]));

export function isWriteTool(name: string): boolean {
  return Boolean(SPEC_BY_NAME.get(name)?.write);
}

export function getToolSpec(name: string): ToolSpec | undefined {
  return SPEC_BY_NAME.get(name);
}

/* ── Argument helpers ───────────────────────────────────────────────── */

function str(args: ToolArgs, key: string): string {
  const value = args[key];
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  // Model args are untyped; JSON keeps what the model actually sent where
  // String() on an object would have stored "[object Object]".
  return JSON.stringify(value) ?? '';
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
  list_accounts: (s) => [
    { hostname: s.hostname, username: s.username, connected: s.connected, hasTotpSecret: true, hasPasskeyCredential: true },
  ],
  connect_instance: (s) => {
    s.connected = true;
    return { status: 'logged_in', hostname: s.hostname, username: s.username };
  },
  check_session: (s) => ({ hostname: s.hostname, username: s.username, connected: s.connected, cookiesValid: s.connected }),
  complete_2fa: (s, args) => {
    const code = str(args, 'code');
    if (code && code.replace(/\D/g, '').length !== 6) return fail('Two-factor codes are 6 digits.');
    s.connected = true;
    return { status: 'logged_in', message: '2FA completed successfully', hostname: s.hostname, username: s.username };
  },

  // ── Record ──
  get_profile: () => clone(data.profile),
  get_health_summary: () => clone(data.healthSummary),
  get_medications: (s) => clone(s.medications),
  get_allergies: () => clone(data.allergies),
  get_health_issues: () => clone(data.healthIssues),
  get_medical_history: () => clone(data.medicalHistory),
  get_vitals: () => clone(data.vitals),
  get_immunizations: () => clone(data.immunizations),
  get_care_team: () => clone(data.careTeam),
  get_emergency_contacts: (s) => clone(s.emergencyContacts),
  get_goals: () => clone(data.goals),
  get_preventive_care: () => clone(data.preventiveCare),

  // ── Results ──
  get_lab_results: (_s, args) => {
    const { total, offset, count, page } = paginate(data.labResults, args);
    return { total, offset, count, results: clone(page) };
  },
  get_imaging_results: (_s, args) => {
    const { total, offset, count, page } = paginate(data.imagingResults, args);
    return { total, offset, count, results: clone(page) };
  },
  get_xray_image: (_s, args) => {
    const index = num(args, 'imaging_index', 0);
    const study = data.imagingResults[index];
    if (!study) return fail(`No imaging study at index ${index}. Call get_imaging_results first.`);
    return {
      study: study.study,
      date: study.date,
      format: 'JPEG',
      seriesCount: study.seriesCount,
      // The UI watches for this flag and renders the simulated radiograph.
      attachment: { kind: 'xray', label: `${study.study} — ${study.date}` },
      note: "Image decoded from the portal's CLO wavelet format and attached to this reply.",
    };
  },
  get_upcoming_orders: () => clone(data.upcomingOrders),

  // ── Visits ──
  get_upcoming_visits: (s) => clone(s.upcomingVisits),
  get_past_visits: (_s, args) => {
    const yearsBack = num(args, 'years_back', 0);
    if (!yearsBack) return clone(data.pastVisits);
    const cutoff = new Date(today());
    cutoff.setFullYear(cutoff.getFullYear() - yearsBack);
    return clone(data.pastVisits.filter((v) => new Date(v.date) >= cutoff));
  },
  get_visit_notes: (_s, args) => {
    const csn = str(args, 'csn');
    if (csn && csn !== data.visitNotes.csn) {
      return { csn, notes: [], message: 'No clinical notes are attached to this visit.' };
    }
    return clone(data.visitNotes);
  },
  get_note_content: (_s, args) => {
    const content = data.noteContentByHnoId[str(args, 'hno_id')] ?? Object.values(data.noteContentByHnoId)[0];
    return clone(content);
  },
  get_visit_avs: () => clone(data.visitAVS),
  get_care_journeys: () => clone(data.careJourneys),
  get_referrals: () => clone(data.referrals),

  // ── Documents ──
  get_letters: () => clone(data.letters),
  get_documents: () => clone(data.documents),
  get_questionnaires: () => clone(data.questionnaires),
  get_education_materials: () => clone(data.educationMaterials),
  get_activity_feed: () => clone(data.activityFeed),
  get_ehi_export: () => clone(data.ehiExport),
  get_linked_mychart_accounts: () => clone(data.linkedAccounts),

  // ── Money ──
  get_billing: (_s, args) => {
    const { total, offset, count, page } = paginate(data.billing, args);
    return { totalVisits: total, offset, count, visits: clone(page) };
  },
  get_insurance: () => clone(data.insurance),

  // ── Messaging ──
  get_messages: (s, args) => {
    const { total, offset, count, page } = paginate(s.messages, args);
    return { total, offset, count, conversations: clone(page) };
  },
  get_message_recipients: () => clone(data.messageRecipients),

  send_message: (s, args) => {
    const recipientName = str(args, 'recipient_name');
    const matched = fuzzyFind(data.messageRecipients.recipients, recipientName, (r) => r.displayName);
    if (matched.length === 0) {
      const available = data.messageRecipients.recipients.map((r) => r.displayName).join(', ');
      return fail(`No recipient matching "${recipientName}". Available: ${available}`);
    }
    if (matched.length > 1) {
      return fail(
        `Multiple recipients match "${recipientName}": ${matched.map((r) => r.displayName).join(', ')}. Please be more specific.`,
      );
    }

    const subject = str(args, 'subject');
    const body = str(args, 'message_body');
    if (!subject || !body) return fail('Both subject and message_body are required.');

    // The two guards above leave exactly one match.
    const recipient = matched[0]!.displayName;
    const id = `msg-sent-${s.messages.length + 1}`;
    const thread: Conversation = {
      id,
      subject,
      from: data.profile.name,
      date: today(),
      preview: body.slice(0, 90),
      sentThisSession: true,
      messages: [{ from: data.profile.name, date: today(), body }],
    };
    s.messages.unshift(thread);
    logActivity(s, 'message', `Sent "${subject}" to ${recipient}`);
    return { success: true, conversationId: id, recipient, subject, topic: str(args, 'topic') || 'Medical Question' };
  },

  send_reply: (s, args) => {
    const conversationId = str(args, 'conversation_id');
    const thread = s.messages.find((m) => m.id === conversationId);
    if (!thread) return fail(`No conversation with id "${conversationId}". Call get_messages for valid ids.`);
    const body = str(args, 'message_body');
    if (!body) return fail('message_body is required.');
    thread.messages.push({ from: data.profile.name, date: today(), body });
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
 * Run one tool against the session. Never throws for a caller mistake — an
 * unknown tool or bad argument comes back as `{ error }` so the agent loop can
 * feed it to the model and let it recover, same as production.
 */
export function executeTool(session: Session, name: string, args: ToolArgs = {}): ToolResult {
  const handler = HANDLERS[name];
  if (!handler) return fail(`Unknown tool "${name}". Available tools: ${TOOL_NAMES.join(', ')}`);
  try {
    return handler(session, args ?? {});
  } catch (err) {
    return fail(`${name} failed: ${(err as Error).message}`);
  }
}

/**
 * Latency simulation. Real MyChart scrapes take a beat, and the tool-call
 * indicator is a big part of what the demo is showing off — instant results
 * would hide it.
 */
export function toolLatencyMs(name: string): number {
  if (name === 'get_xray_image') return 1400;
  if (isWriteTool(name)) return 700;
  if (name.startsWith('get_')) return 320;
  return 500;
}
