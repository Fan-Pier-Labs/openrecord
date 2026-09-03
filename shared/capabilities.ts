/**
 * The capability registry — the single source of truth for what OpenRecord can
 * do with a MyChart account.
 *
 * Every client (CLI, npm library, Claude Desktop extension, mobile app) derives
 * its tool/command list from `CAPABILITIES` instead of hand-maintaining its own.
 * Before this file existed the four lists had drifted — the mobile app was
 * missing visit notes, questionnaires, upcoming orders, EHI export, linked
 * accounts, message threads and every emergency-contact write; the CLI was
 * missing visit notes and those same writes — so the answer a patient got
 * depended on which client they happened to ask. `capabilities.test.ts` now
 * fails the build if any client stops covering an entry here.
 *
 * ## Shape of an entry
 *
 * A capability is a name, a parameter list, and a `run(request, args, ctx)`
 * that takes a logged-in {@link MyChartRequest} and returns JSON-serializable
 * data. Nothing in here knows about MCP, React Native, or argv — the clients
 * own their own presentation, and only their presentation.
 *
 * ## Adding one
 *
 * Add the entry here. Every client picks it up automatically: the MCP server
 * registers a tool, the mobile agent lists it in its prompt, the CLI gains
 * `--action <id>`, and the npm client gains a `runCapability(id, …)` route.
 * The only thing a client may still need is bespoke presentation (see
 * `rendersMedia` below).
 */

import type { MyChartRequest } from '../scrapers/myChart/core/myChartRequest';
import type { RawResponse } from '../scrapers/myChart/core/rawResponse';
import {
  DEFAULT_OUTPUT_MODE,
  OUTPUT_MODES,
  isOutputMode,
  renderOutput,
  type OutputMode,
  type Processor,
} from '../scrapers/myChart/processors/processor';
import { base64UrlEncode, base64UrlDecode } from './base64url';
import { resolveUnique } from './resolveUnique';

import { fetchProfileRaw, profileProcessor } from '../scrapers/myChart/chart/profile/profile';
import { fetchHealthSummaryRaw, healthSummaryProcessor } from '../scrapers/myChart/chart/healthSummary/healthSummary';
// `getMedications` (the standard object) is for request_refill's name resolution;
// the capability itself runs `fetchMedicationsRaw` + the processor like every read.
import { getMedications, fetchMedicationsRaw, medicationsProcessor } from '../scrapers/myChart/chart/medications/medications';
import { requestMedicationRefill } from '../scrapers/myChart/chart/medications/medicationRefill';
import { fetchAllergiesRaw, allergiesProcessor } from '../scrapers/myChart/chart/allergies/allergies';
import { fetchHealthIssuesRaw, healthIssuesProcessor } from '../scrapers/myChart/chart/healthIssues/healthIssues';
import { fetchVitalsRaw, vitalsProcessor } from '../scrapers/myChart/chart/vitals/vitals';
import { fetchImmunizationsRaw, immunizationsProcessor } from '../scrapers/myChart/chart/immunizations/immunizations';
import { fetchPreventiveCareRaw, preventiveCareProcessor } from '../scrapers/myChart/chart/preventiveCare/preventiveCare';
import { fetchMedicalHistoryRaw, medicalHistoryProcessor } from '../scrapers/myChart/chart/medicalHistory/medicalHistory';
import { fetchGoalsRaw, goalsProcessor } from '../scrapers/myChart/chart/goals/goals';

import {
  fetchUpcomingVisitsRaw,
  fetchPastVisitsRaw,
  upcomingVisitsProcessor,
  pastVisitsProcessor,
} from '../scrapers/myChart/chart/visits/visits';
import {
  fetchVisitNotesRaw,
  fetchNoteContentRaw,
  fetchVisitAvsRaw,
  visitNotesProcessor,
  noteContentProcessor,
} from '../scrapers/myChart/chart/notes/notes';

import {
  fetchLabResultsRaw,
  fetchImagingResultsRaw,
  getImagingResults,
  labResultsProcessor,
  imagingResultsProcessor,
} from '../scrapers/myChart/chart/labs/labResults';
import { downloadImagingStudyDirect } from '../scrapers/myChart/eunity/imagingDirectDownload';
import type { FdiContext } from '../scrapers/myChart/eunity/imagingViewer';

import { fetchConversationsRaw, conversationsProcessor } from '../scrapers/myChart/chart/messages/conversations';
import { fetchConversationThreadRaw, conversationThreadProcessor } from '../scrapers/myChart/chart/messages/messageThreads';
import {
  fetchMessageRecipientsRaw,
  fetchMessageTopicsRaw,
  messageRecipientsProcessor,
  messageTopicsProcessor,
} from '../scrapers/myChart/chart/messages/recipients';
import {
  sendNewMessage,
  getMessageRecipients,
  getMessageTopics,
  getVerificationToken,
  type MessageRecipient,
  type MessageTopic,
} from '../scrapers/myChart/chart/messages/sendMessage';
import { sendReply } from '../scrapers/myChart/chart/messages/sendReply';
import { deleteMessage } from '../scrapers/myChart/chart/messages/deleteMessage';

import { fetchBillingRaw, billingProcessor } from '../scrapers/myChart/chart/bills/bills';
import { fetchInsuranceRaw, insuranceProcessor } from '../scrapers/myChart/chart/insurance/insurance';

import { fetchCareTeamRaw, careTeamProcessor } from '../scrapers/myChart/chart/careTeam/careTeam';
import { fetchReferralsRaw, referralsProcessor } from '../scrapers/myChart/chart/referrals/referrals';
import {
  fetchLettersRaw,
  fetchLetterDetailsRaw,
  lettersProcessor,
  letterDetailsProcessor,
} from '../scrapers/myChart/chart/letters/letters';
import { fetchDocumentsRaw, documentsProcessor } from '../scrapers/myChart/chart/documents/documents';
import { fetchUpcomingOrdersRaw, upcomingOrdersProcessor } from '../scrapers/myChart/chart/upcomingOrders/upcomingOrders';
import { fetchQuestionnairesRaw, questionnairesProcessor } from '../scrapers/myChart/chart/questionnaires/questionnaires';
import { fetchCareJourneysRaw, careJourneysProcessor } from '../scrapers/myChart/chart/careJourneys/careJourneys';
import { fetchActivityFeedRaw, activityFeedProcessor } from '../scrapers/myChart/chart/activityFeed/activityFeed';
import { fetchEducationMaterialsRaw, educationMaterialsProcessor } from '../scrapers/myChart/chart/educationMaterials/educationMaterials';
import { fetchEhiExportRaw, ehiExportProcessor } from '../scrapers/myChart/chart/ehiExport/ehiExport';
import { fetchLinkedAccountsRaw, linkedAccountsProcessor } from '../scrapers/myChart/chart/otherMyCharts/otherMyCharts';

import {
  fetchEmergencyContactsRaw,
  emergencyContactsProcessor,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
} from '../scrapers/myChart/chart/emergencyContacts/emergencyContacts';

import {
  assertProxyReadContext,
  runListProxyTargets,
  runSwitchProxyTarget,
} from '../scrapers/myChart/proxy/proxyTools';

import { setupPasskey, listPasskeys, deletePasskey } from '../scrapers/myChart/auth/setupPasskey';
import { serializeCredential } from '../scrapers/myChart/auth/softwareAuthenticator';
import { setupTotp, disableTotp } from '../scrapers/myChart/auth/setupTotp';

// ── Types ───────────────────────────────────────────────────────────────────

export type CapabilityKind =
  /** Reads chart data. Safe to batch and to run without confirmation. */
  | 'read'
  /** Mutates the patient's MyChart record (sends, deletes, submits). */
  | 'write'
  /**
   * Changes the credentials or 2FA configuration of the MyChart account
   * itself. Never offered to a model as a tool — clients surface these in
   * their own settings surface (CLI flags, app settings screen).
   */
  | 'account';

export type CapabilityParamType = 'string' | 'number' | 'boolean';

export interface CapabilityParam {
  name: string;
  type: CapabilityParamType;
  /** Prose shown to the model / printed in `--help`. */
  description: string;
  required?: boolean;
  /** Inclusive bounds, numbers only. */
  min?: number;
  max?: number;
}

/**
 * Per-account state a capability may need that does not live on the MyChart
 * session — the stored password, the saved TOTP secret, and the callbacks that
 * persist newly-issued secrets. Each client wires this to its own credential
 * store (`~/.openrecord-mcpb/`, expo-secure-store, the CLI's `.totp-store`).
 */
export interface CapabilityContext {
  /**
   * The account password, if the client has one stored. TOTP setup needs it.
   * Every client reads this out of its own credential store, so "nothing stored"
   * arrives as an explicit undefined; the capabilities that need it check
   * truthiness, so undefined and absent behave identically.
   */
  password?: string | undefined;
  /** The saved TOTP secret for this account, if any. Disabling TOTP needs it. */
  totpSecret?: string | undefined;
  /** Persist a newly-created TOTP secret. */
  saveTotpSecret?: (secret: string) => Promise<void> | void;
  /** Persist a newly-registered passkey credential (already serialized). */
  savePasskey?: (serializedCredential: string) => Promise<void> | void;
}

/**
 * Args as a capability receives them: one scalar per declared param.
 *
 * Deliberately NOT `Record<string, unknown>`. Args originate untyped — a model
 * emits JSON, the CLI parses `--arg name=value` — so narrowing them is a real
 * step, and this type says the step has already happened. Each client owns it
 * at its own edge: the MCPB's zod schemas, the CLI's `coerceCapabilityArgs`,
 * the app's `toCapabilityArgs`. A client that skips it fails to compile here,
 * which is how the app's missing check was found.
 */
export type CapabilityArgs = Record<string, string | number | boolean | undefined>;

export interface Capability {
  /** Canonical tool name. snake_case; identical across every client. */
  id: string;
  /** Older names a client may still receive. Accepted by {@link executeCapability}. */
  aliases?: readonly string[];
  /** Short human label, used for MCP tool titles and CLI section headers. */
  title: string;
  description: string;
  kind: CapabilityKind;
  /** Grouping for help output and tool-list ordering. */
  group: string;
  /**
   * A capability that is real, supported and rarely what anyone wants.
   *
   * MyChart's surface is not evenly valuable: labs, medications, visit notes
   * and messages are the reason to connect an account at all, while goals,
   * education pamphlets, care journeys and the emergency-contact writes are
   * endpoints most charts leave empty and most callers never reach for. Listing
   * all of them at equal weight buries the useful ones — a person skims past
   * them and a model picks a plausible-looking wrong tool out of the noise.
   *
   * So this is a *presentation* flag, never a capability flag: nothing here
   * changes what {@link executeCapability} will run, and every id stays
   * available in every client. It only decides what a listing shows first.
   * The CLI hides these behind `--help --show-all`; see
   * {@link COMMON_CAPABILITIES}.
   */
  lessFrequentlyUsed?: boolean;
  params: readonly CapabilityParam[];
  /**
   * True when the payload contains binary image data that each client has to
   * encode itself (the MCPB ships a pure-JS JPEG encoder, the mobile app uses
   * its own decoder, the CLI uses sharp). Clients must still expose the
   * capability — they just post-process `run`'s output.
   */
  rendersMedia?: boolean;
}

/**
 * A capability plus its implementation. **Internal to this module on purpose.**
 *
 * `run` is deliberately absent from the exported {@link Capability}, so
 * `capability.run(...)` does not compile anywhere outside this file. That is
 * the enforcement for "every dispatch goes through {@link executeCapability}",
 * which is where the active-patient assertion lives — and it replaces a regex
 * over three client source files.
 *
 * The regex only ever caught the one spelling that had already caused a bug.
 * Every one of these compiled, bypassed the assertion, and on the imaging
 * capability meant returning a different patient's medical images:
 *
 *     const { run } = capability;  run(session, args)
 *     getCapability(id)!.run(session, args)
 *     CAPABILITIES[0].run(session, args)
 *     for (const c of CAPABILITIES) c.run(session, args)
 *
 * The last of those was live: `downloadStudyJpegs` reached `run` through
 * `getCapability`, in a file the regex never scanned.
 */
interface CapabilityImpl extends Capability {
  run: (request: MyChartRequest, args: CapabilityArgs, ctx?: CapabilityContext) => Promise<unknown>;
  /**
   * For read capabilities: `run` returns the scraper's {@link RawResponse}
   * envelope and this turns it into the requested {@link OutputMode}. A
   * capability without one ignores `mode` (writes, account management, media).
   * `unknown` rather than a per-entry type parameter: the registry only ever
   * hands the processor to {@link renderOutput}, which is generic over it.
   */
  processor?: Processor;
}

// ── Argument coercion ───────────────────────────────────────────────────────

function str(args: CapabilityArgs, name: string, fallback = ''): string {
  const v = args[name];
  if (v === undefined || v === null) return fallback;
  return String(v);
}

function requireStr(args: CapabilityArgs, name: string): string {
  const v = str(args, name).trim();
  if (!v) throw new Error(`Missing required argument "${name}".`);
  return v;
}

function optStr(args: CapabilityArgs, name: string): string | undefined {
  const v = args[name];
  if (v === undefined || v === null || v === '') return undefined;
  return String(v);
}

function num(args: CapabilityArgs, name: string, fallback: number): number {
  const v = args[name];
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Pack an {@link FdiContext} into one opaque `image_id` token.
 *
 * A single copy-paste value is easier for a model to round-trip from
 * get_imaging_results into download_imaging_study than two separate fields,
 * and base64url avoids delimiter collisions — `fdi`/`ord` are arbitrary
 * URL-encoded tokens that can contain a colon or comma.
 */
export function encodeImageId(fdiContext: FdiContext): string {
  return base64UrlEncode(JSON.stringify({ fdi: fdiContext.fdi, ord: fdiContext.ord }));
}

/** Inverse of {@link encodeImageId}. Throws if the token is malformed. */
export function decodeImageId(imageId: string): FdiContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(imageId));
  } catch {
    throw new Error('Invalid image_id — expected the image_id value from a get_imaging_results entry.');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as FdiContext).fdi !== 'string' ||
    typeof (parsed as FdiContext).ord !== 'string'
  ) {
    throw new Error('Invalid image_id — expected the image_id value from a get_imaging_results entry.');
  }
  return { fdi: (parsed as FdiContext).fdi, ord: (parsed as FdiContext).ord };
}

// ── Name resolution ─────────────────────────────────────────────────────────
//
// The shared `resolveUnique` does the work — exact match first, then a unique
// partial, and an error listing the candidates otherwise. These wrappers exist
// so the messaging capabilities read clearly and so consumers of the npm
// package can reach the same logic.

/** Resolve a provider name to exactly one recipient, or throw with the options. */
export function resolveRecipient(recipients: MessageRecipient[], query: string): MessageRecipient {
  return resolveUnique(recipients, query, { getName: (r) => r.displayName, label: 'recipient' });
}

/**
 * Resolve a topic name, falling back to the first available topic.
 *
 * Unlike a recipient, an unmatched topic is not worth refusing over: MyChart
 * requires a topic on every message and the category is cosmetic, so stranding
 * the patient's message over it would help nobody. The fallback is *reported*
 * rather than silent — `send_message` returns the topic it actually used, so
 * the reply can say which one, instead of the substitution being invisible at
 * the call site.
 */
export function resolveTopic(
  topics: MessageTopic[],
  query: string | undefined,
): { topic: MessageTopic; substituted: boolean } {
  const firstTopic = topics[0];
  if (!firstTopic) throw new Error('No message topics are available on this MyChart.');
  const wanted = (query ?? '').toLowerCase().trim();
  if (!wanted) return { topic: firstTopic, substituted: false };
  const match = topics.find((t) => t.displayName.toLowerCase().includes(wanted));
  return match ? { topic: match, substituted: false } : { topic: firstTopic, substituted: true };
}

// ── Small shared helpers ────────────────────────────────────────────────────

async function messagingToken(request: MyChartRequest): Promise<string> {
  const token = await getVerificationToken(request);
  if (!token) throw new Error('Could not get a MyChart verification token for messaging.');
  return token;
}

/** Resolve `medication_key` directly, or `medication_name` by fuzzy match. */
async function resolveMedicationKey(request: MyChartRequest, args: CapabilityArgs): Promise<{ key: string; name: string }> {
  const explicitKey = optStr(args, 'medication_key');
  if (explicitKey) return { key: explicitKey, name: optStr(args, 'medication_name') ?? explicitKey };

  const query = str(args, 'medication_name').trim();
  if (!query) throw new Error('Pass either medication_key (from get_medications) or medication_name.');

  const meds = (await getMedications(request)).prescriptions;
  // Match on the label the patient is most likely to use — "Lisinopril" as
  // well as "Lisinopril 10mg" — but exact-first, so naming a medication
  // precisely is never rejected for resembling another one.
  const med = resolveUnique(meds, query, {
    getName: (m) => m.name ?? '',
    // Patients say "Lipitor" as often as "Atorvastatin 20mg".
    getAlternateNames: (m) => (m.patientFriendlyName.text ? [m.patientFriendlyName.text] : []),
    label: 'medication',
    stripTitles: false,
  });

  if (!med.refillDetails?.isRefillable) throw new Error(`"${med.name}" is not refillable through MyChart.`);
  // `id` is the prescription's MyChart id. Whether the refill endpoint wants
  // it under `medicationKey` is unverified — see docs/processor-layer-todo.md.
  if (!med.id) throw new Error(`"${med.name}" has no prescription id, so it cannot be refilled here.`);
  return { key: med.id, name: med.name ?? '' };
}

/** The raw, still-encoded images of one study. Clients encode them themselves. */
export interface StudyImagePayload {
  studyName: string;
  /** How many image instances the study contains in total. */
  totalImages: number;
  images: Array<{
    index: number;
    seriesUID: string;
    seriesDescription: string;
    /** Raw CLO pixel data. Convert with the client's own CLO→image path. */
    pixelData?: Uint8Array;
    /** Raw CLO wrapper (calibration/window metadata) for the same image. */
    wrapperData?: Uint8Array;
  }>;
  errors: string[];
}

// ── The registry ────────────────────────────────────────────────────────────

/**
 * Which connected MyChart account the call is for.
 *
 * This is the one parameter every capability takes in every client, and it was
 * the last one still hand-written per client — the extension called it
 * `account` and required it, the mobile app called it `instance` and didn't.
 * That is precisely the drift this registry exists to kill, so it is declared
 * here and the parity test checks for it like any other parameter.
 *
 * `instance` stays an accepted alias: the mobile app's alerts generator and
 * alert cards pass it programmatically, and a saved chat may contain it.
 */
export const ACCOUNT_PARAM: CapabilityParam = {
  name: 'account',
  type: 'string',
  description:
    'MyChart hostname identifying which connected account to use — the `account` value from the ' +
    'client\'s account list. Optional when only one account is connected.',
};

/** Accepted spellings of {@link ACCOUNT_PARAM}, newest first. */
export const ACCOUNT_PARAM_NAMES: readonly string[] = [ACCOUNT_PARAM.name, 'instance'];

/** Read the account selector out of a client's arguments, whichever name it used. */
export function readAccountArg(args: CapabilityArgs): string | undefined {
  for (const name of ACCOUNT_PARAM_NAMES) {
    const value = args[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}


const CAPABILITY_IMPLS: readonly CapabilityImpl[] = [
  // ── Profile / overview ────────────────────────────────────────────────────
  {
    id: 'get_profile',
    title: 'Patient profile',
    description: 'Patient profile (name, date of birth, medical record number, primary care provider) plus the account email address.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchProfileRaw(request),
    processor: profileProcessor,
  },
  {
    id: 'get_health_summary',
    title: 'Health summary',
    description: 'Health summary — vitals snapshot, blood type, smoking status and similar top-level facts.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchHealthSummaryRaw(request),
    processor: healthSummaryProcessor,
  },
  {
    id: 'get_medications',
    title: 'Medications',
    description: 'Current medications with dosage, instructions, prescriber and pharmacy.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchMedicationsRaw(request),
    processor: medicationsProcessor,
  },
  {
    id: 'get_allergies',
    title: 'Allergies',
    description: 'Known allergies with reaction and severity.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchAllergiesRaw(request),
    processor: allergiesProcessor,
  },
  {
    id: 'get_health_issues',
    title: 'Health issues',
    description: 'Active health issues / problem list.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchHealthIssuesRaw(request),
    processor: healthIssuesProcessor,
  },
  {
    id: 'get_vitals',
    title: 'Vitals',
    description: 'Vitals and tracked flowsheet readings (weight, blood pressure, heart rate, glucose, etc.).',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchVitalsRaw(request),
    processor: vitalsProcessor,
  },
  {
    id: 'get_immunizations',
    title: 'Immunizations',
    description: 'Vaccination history.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchImmunizationsRaw(request),
    processor: immunizationsProcessor,
  },
  {
    id: 'get_preventive_care',
    title: 'Preventive care',
    description: 'Preventive care recommendations — overdue and upcoming screenings.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchPreventiveCareRaw(request),
    processor: preventiveCareProcessor,
  },
  {
    id: 'get_medical_history',
    title: 'Medical history',
    description: 'Past medical, surgical, family and social history.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => fetchMedicalHistoryRaw(request),
    processor: medicalHistoryProcessor,
  },
  {
    id: 'get_goals',
    title: 'Goals',
    description: 'Care team goals and patient-set goals.',
    kind: 'read',
    group: 'Profile',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchGoalsRaw(request),
    processor: goalsProcessor,
  },

  // ── Visits + notes ────────────────────────────────────────────────────────
  {
    id: 'get_upcoming_visits',
    title: 'Upcoming visits',
    description: 'Upcoming appointments.',
    kind: 'read',
    group: 'Visits',
    params: [],
    run: (request) => fetchUpcomingVisitsRaw(request),
    processor: upcomingVisitsProcessor,
  },
  {
    id: 'get_past_visits',
    title: 'Past visits',
    description: 'Past visits within the last `years_back` years (default 2).',
    kind: 'read',
    group: 'Visits',
    params: [{ name: 'years_back', type: 'number', description: 'How many years back to fetch (default 2).', min: 1, max: 20 }],
    run: (request, args) => {
      const oldest = new Date();
      oldest.setFullYear(oldest.getFullYear() - num(args, 'years_back', 2));
      return fetchPastVisitsRaw(request, oldest);
    },
    processor: pastVisitsProcessor,
  },
  {
    id: 'get_visit_notes',
    title: 'Visit notes',
    description:
      'List the clinical notes (operative, progress, anesthesia, …) attached to a past visit. Returns lrpID and, per note, hnoID and hnoDAT — pass those to get_note_content.',
    kind: 'read',
    group: 'Visits',
    params: [{ name: 'csn', type: 'string', description: 'Visit CSN (encounter id) from get_past_visits.', required: true }],
    run: (request, args) => fetchVisitNotesRaw(request, requireStr(args, 'csn')),
    processor: visitNotesProcessor,
  },
  {
    id: 'get_note_content',
    title: 'Note content',
    description: 'Fetch the rendered content of a single clinical note listed by get_visit_notes.',
    kind: 'read',
    group: 'Visits',
    params: [
      { name: 'csn', type: 'string', description: 'Visit CSN from get_past_visits.', required: true },
      { name: 'lrp_id', type: 'string', description: 'lrpID from get_visit_notes.', required: true },
      { name: 'hno_id', type: 'string', description: 'hnoID of the chosen note.', required: true },
      { name: 'hno_dat', type: 'string', description: 'hnoDAT of the chosen note.', required: true },
    ],
    run: (request, args) =>
      fetchNoteContentRaw(request, {
        csn: requireStr(args, 'csn'),
        lrpId: requireStr(args, 'lrp_id'),
        hnoId: requireStr(args, 'hno_id'),
        hnoDat: requireStr(args, 'hno_dat'),
      }),
    processor: noteContentProcessor,
  },
  {
    id: 'get_visit_avs',
    title: 'After Visit Summary',
    description: 'The After Visit Summary for a past visit.',
    kind: 'read',
    group: 'Visits',
    params: [{ name: 'csn', type: 'string', description: 'Visit CSN from get_past_visits.', required: true }],
    run: (request, args) => fetchVisitAvsRaw(request, requireStr(args, 'csn')),
    processor: noteContentProcessor,
  },

  // ── Results ───────────────────────────────────────────────────────────────
  {
    id: 'get_lab_results',
    title: 'Lab results',
    description: 'Lab results with reference ranges and prior values for trending.',
    kind: 'read',
    group: 'Results',
    params: [],
    run: (request) => fetchLabResultsRaw(request),
    processor: labResultsProcessor,
  },
  {
    id: 'get_imaging_results',
    title: 'Imaging results',
    description:
      'Imaging result metadata (X-ray, MRI, CT, ultrasound, …) with reports. Entries that have viewable pictures carry an `image_id` — pass that to download_imaging_study to get the actual images.',
    kind: 'read',
    group: 'Results',
    params: [],
    // The processor mints `image_id` (one opaque token for the { fdi, ord }
    // pair — a single copy-paste value is far easier for a model to hand
    // back than two fields it can mix up) and `index`, the fallback handle.
    run: (request) => fetchImagingResultsRaw(request),
    processor: imagingResultsProcessor,
  },
  {
    id: 'download_imaging_study',
    aliases: ['get_xray_image'],
    title: 'Download imaging study',
    description:
      'Download every picture in one imaging study. Identify the study with the `image_id` from get_imaging_results (or its 0-based `imaging_index`). Images are downloaded and decoded on the user’s own device.',
    kind: 'read',
    group: 'Results',
    rendersMedia: true,
    params: [
      { name: 'image_id', type: 'string', description: 'The `image_id` from the chosen get_imaging_results entry. Copy it verbatim.' },
      { name: 'imaging_index', type: 'number', description: 'Alternative to image_id: the 0-based index of the study in get_imaging_results.', min: 0 },
      { name: 'study_name', type: 'string', description: 'Human-readable study name used to label the output. Optional.' },
    ],
    run: async (request, args): Promise<StudyImagePayload> => {
      let fdiContext: FdiContext;
      let studyName = optStr(args, 'study_name');

      const imageId = optStr(args, 'image_id');
      if (imageId) {
        fdiContext = decodeImageId(imageId);
      } else if (args.imaging_index !== undefined && args.imaging_index !== null && args.imaging_index !== '') {
        const index = num(args, 'imaging_index', -1);
        if (!Number.isInteger(index) || index < 0) {
          throw new Error('imaging_index must be a non-negative integer from get_imaging_results.');
        }
        const { orders } = await getImagingResults(request);
        const study = orders[index];
        if (!study) throw new Error(`No imaging result at index ${index} (this account has ${orders.length}).`);
        if (!study.image_id) throw new Error(`The imaging result at index ${index} has no viewable images.`);
        fdiContext = decodeImageId(study.image_id);
        studyName = studyName ?? study.orderName ?? undefined;
      } else {
        throw new Error('Pass either image_id (from get_imaging_results) or imaging_index.');
      }

      const result = await downloadImagingStudyDirect(request, fdiContext, studyName ?? 'study', '', {
        skipFileWrite: true,
      });

      return {
        studyName: result.studyName,
        totalImages: result.images.length,
        images: result.images.map((img, index) => ({
          index,
          seriesUID: img.seriesUID,
          seriesDescription: img.seriesDescription,
          // An image with no pixel or wrapper buffer omits the key rather than
          // reporting it as present-and-undefined.
          ...(img.pixelData !== undefined ? { pixelData: img.pixelData } : {}),
          ...(img.wrapperData !== undefined ? { wrapperData: img.wrapperData } : {}),
        })),
        errors: result.errors,
      };
    },
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  {
    id: 'get_messages',
    title: 'Messages',
    description: 'Inbox conversations with the care team.',
    kind: 'read',
    group: 'Messages',
    params: [],
    run: (request) => fetchConversationsRaw(request),
    processor: conversationsProcessor,
  },
  {
    id: 'get_message_thread',
    title: 'Message thread',
    description: 'Every message in one conversation.',
    kind: 'read',
    group: 'Messages',
    params: [{ name: 'conversation_id', type: 'string', description: 'Conversation id from get_messages.', required: true }],
    run: async (request, args) => {
      const conversationId = requireStr(args, 'conversation_id');
      const raw = await fetchConversationThreadRaw(request, conversationId);
      // GetConversationDetails answers an unknown id with a literal JSON null
      // (same as GetVisitNotes). Saying so beats rendering an empty thread.
      if (raw.requests.find((r) => r.path.includes('GetConversationDetails'))?.body === null) {
        throw new Error(
          `No conversation ${conversationId} on the active patient record. Check the id from get_messages, and that the right patient is active.`,
        );
      }
      return raw;
    },
    processor: conversationThreadProcessor,
  },
  {
    id: 'get_message_recipients',
    title: 'Message recipients',
    description: 'Providers and departments that can receive a new message.',
    kind: 'read',
    group: 'Messages',
    params: [],
    run: (request) => fetchMessageRecipientsRaw(request),
    processor: messageRecipientsProcessor,
  },
  {
    id: 'get_message_topics',
    title: 'Message topics',
    description: 'Topics/categories a new message can be filed under.',
    kind: 'read',
    group: 'Messages',
    // send_message resolves the topic itself and reports any substitution, so
    // listing them up front is rarely a step anyone needs to take.
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchMessageTopicsRaw(request),
    processor: messageTopicsProcessor,
  },
  {
    id: 'send_message',
    title: 'Send a message',
    description:
      'Send a new message to a provider or department. Names are matched against get_message_recipients — an ambiguous name is an error rather than a guess.',
    kind: 'write',
    group: 'Messages',
    params: [
      { name: 'recipient_name', type: 'string', description: 'Provider or department name, as shown by get_message_recipients.', required: true },
      { name: 'topic', type: 'string', description: 'Topic name, e.g. "Medical Question". Defaults to the first available topic.' },
      { name: 'subject', type: 'string', description: 'Subject line.', required: true },
      { name: 'message', type: 'string', description: 'Body of the message.', required: true },
    ],
    run: async (request, args) => {
      const token = await messagingToken(request);
      const [recipients, topics] = await Promise.all([
        getMessageRecipients(request, token),
        getMessageTopics(request, token),
      ]);
      const recipient = resolveRecipient(recipients, requireStr(args, 'recipient_name'));
      const { topic, substituted } = resolveTopic(topics, optStr(args, 'topic'));
      const result = await sendNewMessage(request, {
        recipient,
        topic,
        subject: requireStr(args, 'subject'),
        messageBody: requireStr(args, 'message'),
      });
      // Say who it went to and under which topic. The topic can be a
      // substitution when the requested one doesn't exist on this instance,
      // and a silent substitution is one the patient never gets told about.
      return {
        ...result,
        sent_to: recipient.displayName,
        topic_used: topic.displayName,
        ...(substituted
          ? { topic_substituted: `No topic matched "${optStr(args, 'topic')}"; used "${topic.displayName}" instead.` }
          : {}),
      };
    },
  },
  {
    id: 'send_reply',
    title: 'Reply to a message',
    description: 'Reply in an existing conversation.',
    kind: 'write',
    group: 'Messages',
    params: [
      { name: 'conversation_id', type: 'string', description: 'Conversation id from get_messages.', required: true },
      { name: 'message', type: 'string', description: 'Reply text.', required: true },
    ],
    run: (request, args) =>
      sendReply(request, {
        conversationId: requireStr(args, 'conversation_id'),
        messageBody: requireStr(args, 'message'),
      }),
  },
  {
    id: 'delete_message',
    title: 'Delete a conversation',
    description: 'Delete a message conversation from the inbox.',
    kind: 'write',
    group: 'Messages',
    lessFrequentlyUsed: true,
    params: [{ name: 'conversation_id', type: 'string', description: 'Conversation id from get_messages.', required: true }],
    run: (request, args) => deleteMessage(request, requireStr(args, 'conversation_id')),
  },

  // ── Billing / coverage ────────────────────────────────────────────────────
  {
    id: 'get_billing',
    title: 'Billing',
    description: 'Billing history and account balances.',
    kind: 'read',
    group: 'Billing',
    params: [],
    run: (request) => fetchBillingRaw(request),
    processor: billingProcessor,
  },
  {
    id: 'get_insurance',
    title: 'Insurance',
    description: 'Insurance coverages on file.',
    kind: 'read',
    group: 'Billing',
    params: [],
    run: (request) => fetchInsuranceRaw(request),
    processor: insuranceProcessor,
  },

  // ── Care coordination ─────────────────────────────────────────────────────
  {
    id: 'get_care_team',
    title: 'Care team',
    description: 'Providers on the care team, including outside providers, each with their role and specialty.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchCareTeamRaw(request),
    processor: careTeamProcessor,
  },
  {
    id: 'get_referrals',
    title: 'Referrals',
    description: 'Active and past referrals.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchReferralsRaw(request),
    processor: referralsProcessor,
  },
  {
    id: 'get_letters',
    title: 'Letters',
    description: 'Letters from providers. Each entry carries the hnoId/csn needed by get_letter_details.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchLettersRaw(request),
    processor: lettersProcessor,
  },
  {
    id: 'get_letter_details',
    title: 'Letter contents',
    description: 'The full contents of one letter listed by get_letters.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [
      { name: 'hno_id', type: 'string', description: 'hnoId from the chosen get_letters entry.', required: true },
      { name: 'csn', type: 'string', description: 'csn from the chosen get_letters entry.', required: true },
    ],
    run: (request, args) => fetchLetterDetailsRaw(request, requireStr(args, 'hno_id'), requireStr(args, 'csn')),
    processor: letterDetailsProcessor,
  },
  {
    id: 'get_documents',
    title: 'Documents',
    description: 'Clinical documents and visit records.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchDocumentsRaw(request),
    processor: documentsProcessor,
  },
  {
    id: 'get_upcoming_orders',
    title: 'Upcoming orders',
    description: 'Standing/upcoming orders — labs, imaging and procedures the care team has ordered.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => fetchUpcomingOrdersRaw(request),
    processor: upcomingOrdersProcessor,
  },
  {
    id: 'get_questionnaires',
    title: 'Questionnaires',
    description: 'Open and completed questionnaires / health assessments.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchQuestionnairesRaw(request),
    processor: questionnairesProcessor,
  },
  {
    id: 'get_care_journeys',
    title: 'Care journeys',
    description: 'Care journeys and care plans.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchCareJourneysRaw(request),
    processor: careJourneysProcessor,
  },
  {
    id: 'get_activity_feed',
    title: 'Activity feed',
    description: 'Recent account activity feed items.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchActivityFeedRaw(request),
    processor: activityFeedProcessor,
  },
  {
    id: 'get_education_materials',
    title: 'Education materials',
    description: 'Patient education materials assigned by the care team.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchEducationMaterialsRaw(request),
    processor: educationMaterialsProcessor,
  },
  {
    id: 'get_ehi_export',
    title: 'EHI export templates',
    description: 'Electronic Health Information export templates this instance offers.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchEhiExportRaw(request),
    processor: ehiExportProcessor,
  },
  {
    id: 'get_linked_accounts',
    title: 'Linked MyChart accounts',
    description: 'MyChart accounts at other organizations that are linked to this one.',
    kind: 'read',
    group: 'Care',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchLinkedAccountsRaw(request),
    processor: linkedAccountsProcessor,
  },

  // ── Emergency contacts ────────────────────────────────────────────────────
  {
    id: 'get_emergency_contacts',
    title: 'Emergency contacts',
    description: 'Emergency contacts on file.',
    kind: 'read',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchEmergencyContactsRaw(request),
    processor: emergencyContactsProcessor,
  },
  {
    id: 'add_emergency_contact',
    title: 'Add an emergency contact',
    description: 'Add a new emergency contact to the record.',
    kind: 'write',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [
      { name: 'name', type: 'string', description: 'Contact’s full name.', required: true },
      { name: 'relationship_type', type: 'string', description: 'Relationship, e.g. "Spouse", "Parent", "Sibling", "Friend".', required: true },
      { name: 'phone_number', type: 'string', description: 'Contact phone number.', required: true },
    ],
    run: (request, args) =>
      addEmergencyContact(request, {
        name: requireStr(args, 'name'),
        relationshipType: requireStr(args, 'relationship_type'),
        phoneNumber: requireStr(args, 'phone_number'),
      }),
  },
  {
    id: 'update_emergency_contact',
    title: 'Update an emergency contact',
    description: 'Update an existing emergency contact. Only the fields you pass are changed.',
    kind: 'write',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [
      { name: 'id', type: 'string', description: 'Contact id from get_emergency_contacts.', required: true },
      { name: 'name', type: 'string', description: 'New name.' },
      { name: 'relationship_type', type: 'string', description: 'New relationship.' },
      { name: 'phone_number', type: 'string', description: 'New phone number.' },
    ],
    run: (request, args) =>
      updateEmergencyContact(request, {
        id: requireStr(args, 'id'),
        name: optStr(args, 'name'),
        relationshipType: optStr(args, 'relationship_type'),
        phoneNumber: optStr(args, 'phone_number'),
      }),
  },
  {
    id: 'remove_emergency_contact',
    title: 'Remove an emergency contact',
    description: 'Remove an emergency contact by id.',
    kind: 'write',
    group: 'Emergency contacts',
    lessFrequentlyUsed: true,
    params: [{ name: 'id', type: 'string', description: 'Contact id from get_emergency_contacts.', required: true }],
    run: (request, args) => removeEmergencyContact(request, requireStr(args, 'id')),
  },

  // ── Prescriptions ─────────────────────────────────────────────────────────
  {
    id: 'request_refill',
    title: 'Request a refill',
    description: 'Request a refill for a current medication. Give the medication name; an ambiguous name is an error rather than a guess.',
    kind: 'write',
    group: 'Prescriptions',
    params: [
      { name: 'medication_name', type: 'string', description: 'Medication name as shown by get_medications.' },
      { name: 'medication_key', type: 'string', description: 'Exact prescription `id` from get_medications. Use instead of medication_name when you have it.' },
    ],
    run: async (request, args) => {
      const { key, name } = await resolveMedicationKey(request, args);
      const result = await requestMedicationRefill(request, key);
      return { ...result, medication: name };
    },
  },

  // ── Patient records (proxy access) ────────────────────────────────────────
  //
  // Thin wrappers over `scrapers/myChart/proxyTools.ts`, which owns the
  // semantics: reads assert which patient they are about and refuse on a
  // mismatch, and only an explicit switch changes MyChart's server-side
  // active patient. Everything below is exempt from that assertion — guarding
  // "you must already be on patient X" in front of the tools that list and
  // change X would make them unusable exactly when they are needed.
  {
    id: 'list_proxy_targets',
    aliases: ['list_patients', 'get_active_patient'],
    title: 'List accessible patient records',
    description:
      'List every patient record this MyChart account can access — the account holder plus any family members reachable via proxy access (a parent viewing a child\'s chart) — and which one is currently active. Data tools always read the ACTIVE record; use switch_proxy_target to change it. Accounts without proxy access return count: 0.',
    kind: 'read',
    group: 'Patients',
    params: [],
    run: (request) => runListProxyTargets(request),
  },
  {
    id: 'switch_proxy_target',
    aliases: ['switch_patient'],
    title: 'Switch the active patient record',
    description:
      'Switch which patient\'s record MyChart is showing (e.g. from the account holder\'s own chart to a child\'s). This changes server-side MyChart state: EVERY data tool on this account reads the newly active record afterwards. The switch is verified against the profile page and fails rather than landing on the wrong patient. Pass patient: "me" to return to the account holder\'s own record when done.',
    kind: 'write',
    group: 'Patients',
    params: [
      {
        name: 'patient',
        type: 'string',
        description: 'Patient name from list_proxy_targets, or "me" for the account holder\'s own record.',
        required: true,
      },
    ],
    run: (request, args) => runSwitchProxyTarget(request, requireStr(args, 'patient')),
  },

  // ── Account security ──────────────────────────────────────────────────────
  //
  // `account` kind: these change how the patient logs in, so no client offers
  // them to a model. They are reachable from the CLI's flags, the desktop
  // extension's setup surface and the mobile app's settings screen.
  {
    id: 'register_passkey',
    title: 'Register a passkey',
    description: 'Register a passkey on this MyChart account so future logins skip the password and the 2FA prompt.',
    kind: 'account',
    group: 'Account security',
    // The whole group is a sign-in setting rather than a chart operation, and
    // the CLI drives all five from dedicated flags (`--set-up-passkey`,
    // `--set-up-totp`, …) that the help text lists in their own section.
    lessFrequentlyUsed: true,
    params: [],
    run: async (request, _args, ctx) => {
      const credential = await setupPasskey(request);
      if (!credential) {
        throw new Error('MyChart did not return a credential. Some instances disable passkey registration from the patient portal.');
      }
      const serialized = serializeCredential(credential);
      await ctx?.savePasskey?.(serialized);
      return { registered: true, saved: !!ctx?.savePasskey };
    },
  },
  {
    id: 'list_passkeys',
    title: 'List passkeys',
    description: 'List the passkeys registered on this MyChart account.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [],
    run: async (request) => {
      const passkeys = await listPasskeys(request);
      if (!passkeys) throw new Error('MyChart would not list passkeys for this account.');
      return { count: passkeys.length, passkeys };
    },
  },
  {
    id: 'delete_passkey',
    title: 'Delete passkeys',
    description: 'Delete a passkey from the MyChart account by rawId, or every registered passkey when no id is given.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [{ name: 'raw_id', type: 'string', description: 'rawId from list_passkeys. Omit to delete every passkey on the account.' }],
    run: async (request, args) => {
      const rawId = optStr(args, 'raw_id');
      const passkeys = (await listPasskeys(request)) ?? [];
      const targets = (rawId ? passkeys.filter((p) => (p as { rawId?: string }).rawId === rawId) : passkeys)
        .map((p) => (p as { rawId?: string }).rawId)
        .filter((id): id is string => !!id);
      if (targets.length === 0) {
        throw new Error(rawId ? `No passkey with rawId ${rawId}.` : 'No passkeys are registered on this account.');
      }
      const deleted: string[] = [];
      const failed: string[] = [];
      for (const id of targets) {
        if (await deletePasskey(request, id)) deleted.push(id);
        else failed.push(id);
      }
      return { deleted, failed };
    },
  },
  {
    id: 'setup_totp',
    title: 'Set up an authenticator app',
    description: 'Turn on authenticator-app (TOTP) two-factor authentication and store the secret locally so future logins can generate their own codes.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [],
    run: async (request, _args, ctx) => {
      if (!ctx?.password) throw new Error('The account password is required to set up TOTP.');
      const result = await setupTotp(request, ctx.password);
      if (!result.secret) throw new Error(result.error || 'MyChart did not return a TOTP secret.');
      await ctx.saveTotpSecret?.(result.secret);
      return { enabled: true, saved: !!ctx.saveTotpSecret };
    },
  },
  {
    id: 'disable_totp',
    title: 'Turn off the authenticator app',
    description: 'Turn off authenticator-app (TOTP) two-factor authentication on this MyChart account.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [],
    run: async (request, _args, ctx) => {
      if (!ctx?.password) throw new Error('The account password is required to disable TOTP.');
      if (!ctx.totpSecret) throw new Error('No saved TOTP secret for this account — MyChart requires a current code to turn TOTP off.');
      const ok = await disableTotp(request, ctx.password, ctx.totpSecret);
      if (!ok) throw new Error('MyChart rejected the request to disable TOTP.');
      return { enabled: false };
    },
  },
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

/** Capability ids in registry order. */
/**
 * Every capability, as clients see them: no `run`. Reaching the implementation
 * is a compile error outside this module — see {@link CapabilityImpl}.
 */
export const CAPABILITIES: readonly Capability[] = CAPABILITY_IMPLS;

export const CAPABILITY_IDS: readonly string[] = CAPABILITIES.map((c) => c.id);

/** The read + write capabilities — everything a model may be offered as a tool. */
export const AGENT_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter((c) => c.kind !== 'account');

/**
 * The capabilities a listing shows first — everything not marked
 * {@link Capability.lessFrequentlyUsed}.
 *
 * Nothing filters on this to decide what it will *run*; it only decides what a
 * listing leads with. The CLI's `--help` prints these and points at
 * `--help --show-all` for the rest.
 */
export const COMMON_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter((c) => !c.lessFrequentlyUsed);

/** The remainder — real, supported, and rarely what anyone wants. */
export const LESS_FREQUENTLY_USED_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (c) => c.lessFrequentlyUsed,
);

/** Ids of the capabilities that mutate the patient's MyChart record. */
export const WRITE_CAPABILITY_IDS: readonly string[] = CAPABILITIES.filter((c) => c.kind === 'write').map((c) => c.id);

const BY_NAME = new Map<string, CapabilityImpl>();
for (const capability of CAPABILITY_IMPLS) {
  BY_NAME.set(capability.id, capability);
  for (const alias of capability.aliases ?? []) BY_NAME.set(alias, capability);
}

/** Look a capability up by id or alias. Returns undefined for unknown names. */
export function getCapability(idOrAlias: string): Capability | undefined {
  return BY_NAME.get(idOrAlias);
}

/**
 * The same lookup, but keeping the implementation handle. Module-private:
 * {@link executeCapability} is the only caller, because it is the only place
 * allowed to reach `run`.
 */
function getCapabilityImpl(idOrAlias: string): CapabilityImpl | undefined {
  return BY_NAME.get(idOrAlias);
}

/** Capabilities grouped in registry order, for help text and tool listings. */
export function capabilitiesByGroup(
  capabilities: readonly Capability[] = CAPABILITIES,
): Array<{ group: string; capabilities: Capability[] }> {
  const groups: Array<{ group: string; capabilities: Capability[] }> = [];
  for (const capability of capabilities) {
    let bucket = groups.find((g) => g.group === capability.group);
    if (!bucket) {
      bucket = { group: capability.group, capabilities: [] };
      groups.push(bucket);
    }
    bucket.capabilities.push(capability);
  }
  return groups;
}

/**
 * Capabilities exempt from the active-patient assertion below.
 *
 * The `Patients` group is exempt because asserting "you must already be on
 * patient X" in front of the very tools that list and change X would make them
 * unusable exactly when they are needed. `account`-kind capabilities are exempt
 * because they act on the MyChart login, not on any one patient's chart.
 */
function needsPatientAssertion(capability: Capability): boolean {
  return capability.group !== 'Patients' && capability.kind !== 'account';
}

/**
 * Run a capability by id (or alias) against a logged-in session.
 *
 * Every chart-touching call first asserts which patient MyChart is on, via
 * `assertProxyReadContext`. `args.patient` names the patient the call is
 * about; omitting it means the account holder — explicitly, not "whoever the
 * session happens to be pointed at", because sessions resume from cached
 * cookies and would otherwise inherit whichever patient an earlier invocation
 * left behind. A mismatch throws with the `switch_proxy_target` call that
 * fixes it; reading never switches on its own.
 *
 * Doing this here rather than in each client's dispatch is the point of the
 * registry: one guard, and no client can forget it. Discovery is cached per
 * session inside `proxyTools`, so the assertion costs one request per session
 * rather than one per call.
 *
 * Throws a listing-friendly error for unknown names.
 */
export async function executeCapability(
  request: MyChartRequest,
  idOrAlias: string,
  args: CapabilityArgs = {},
  ctx?: CapabilityContext,
): Promise<unknown> {
  const capability = getCapabilityImpl(idOrAlias);
  if (!capability) {
    throw new Error(`Unknown capability "${idOrAlias}". Known capabilities: ${CAPABILITY_IDS.join(', ')}`);
  }
  if (needsPatientAssertion(capability)) {
    await assertProxyReadContext(request, optStr(args, 'patient'));
  }
  const result = await capability.run(request, args, ctx);
  if (!capability.processor) return result;
  return renderOutput(capability.processor, result as RawResponse, readOutputMode(args));
}

/**
 * The output mode a caller asked for, defaulting to {@link DEFAULT_OUTPUT_MODE}.
 * An unknown value is an error rather than a silent fallback: a caller that
 * typed `mode: 'summary'` and got JSON back would not know it was ignored.
 */
export function readOutputMode(args: CapabilityArgs): OutputMode {
  const value = args[MODE_PARAM.name];
  if (value === undefined || value === null || value === '') return DEFAULT_OUTPUT_MODE;
  if (isOutputMode(value)) return value;
  throw new Error(`Unknown mode ${JSON.stringify(value)}. Expected one of: ${OUTPUT_MODES.join(', ')}.`);
}

/**
 * How a read capability's payload is rendered. Declared once, like
 * {@link PATIENT_PARAM}: every client offers it on every capability that
 * {@link acceptsModeParam}, and {@link executeCapability} applies it.
 */
export const MODE_PARAM: CapabilityParam = {
  name: 'mode',
  type: 'string',
  description:
    'Output mode: `concise` (markdown, the interesting fields), `standard` (markdown, every ' +
    'useful field), `json` (the standard fields as JSON), or `raw` (the untouched MyChart ' +
    'response, large).',
};

/**
 * What a model-facing client passes when the model said nothing. The MCPB and
 * the mobile agent hand the payload straight to a context window, and a 200 KB
 * visits payload is what started the processor layer; `concise` is the right
 * default there, and the model can still ask for any other mode by name.
 * Programmatic callers (the library, the CLI) get {@link DEFAULT_OUTPUT_MODE}.
 */
export const MODEL_FACING_OUTPUT_MODE: OutputMode = 'concise';

/** {@link MODE_PARAM} with the client's default stated, for tool descriptions. */
export function describeModeParam(defaultMode: OutputMode): string {
  return `${MODE_PARAM.description} Default: ${defaultMode}.`;
}

/** Whether this capability accepts {@link MODE_PARAM} — i.e. it has a processor. */
export function acceptsModeParam(capability: Capability): boolean {
  return getCapabilityImpl(capability.id)?.processor !== undefined;
}

/**
 * The patient parameter every chart-touching capability accepts on top of its
 * own. Not declared per-capability — it is the same on all of them, and the
 * assertion is applied by {@link executeCapability} rather than by any `run`.
 */
export const PATIENT_PARAM: CapabilityParam = {
  name: 'patient',
  type: 'string',
  description:
    "Which patient's record this call is about, for accounts with MyChart proxy access to family " +
    "members' charts — a name from list_proxy_targets. Omit for the account holder's own record. " +
    'If MyChart is currently on a different patient the call fails (with instructions) rather than ' +
    'switching silently.',
};

/** Whether this capability accepts {@link PATIENT_PARAM} on top of its own. */
export function acceptsPatientParam(capability: Capability): boolean {
  return needsPatientAssertion(capability);
}

/** One `name(param, param) — description` line per capability, for prompts and help. */
export function describeCapability(capability: Capability): string {
  const params = capability.params.map((p) => (p.required ? p.name : `${p.name}?`)).join(', ');
  return `${capability.id}(${params}) — ${capability.description}`;
}
