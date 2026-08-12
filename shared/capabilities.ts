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

import type { MyChartRequest } from '../scrapers/myChart/myChartRequest';

import { getMyChartProfile, getEmail } from '../scrapers/myChart/profile';
import { getHealthSummary } from '../scrapers/myChart/healthSummary';
import { getMedications } from '../scrapers/myChart/medications';
import { requestMedicationRefill } from '../scrapers/myChart/medicationRefill';
import { getAllergies } from '../scrapers/myChart/allergies';
import { getHealthIssues } from '../scrapers/myChart/healthIssues';
import { getVitals } from '../scrapers/myChart/vitals';
import { getImmunizations } from '../scrapers/myChart/immunizations';
import { getPreventiveCare } from '../scrapers/myChart/preventiveCare';
import { getMedicalHistory } from '../scrapers/myChart/medicalHistory';
import { getGoals } from '../scrapers/myChart/goals';

import { upcomingVisits, pastVisits } from '../scrapers/myChart/visits/visits';
import { getVisitNotes, getNoteContent, getVisitAVS } from '../scrapers/myChart/notes/notes';

import { listLabResults, getImagingResults } from '../scrapers/myChart/labs_and_procedure_results/labResults';
import { downloadImagingStudyDirect } from '../scrapers/myChart/eunity/imagingDirectDownload';
import type { FdiContext } from '../scrapers/myChart/eunity/imagingViewer';

import { listConversations } from '../scrapers/myChart/messages/conversations';
import { getConversationMessages } from '../scrapers/myChart/messages/messageThreads';
import {
  sendNewMessage,
  getMessageRecipients,
  getMessageTopics,
  getVerificationToken,
  type MessageRecipient,
  type MessageTopic,
} from '../scrapers/myChart/messages/sendMessage';
import { sendReply } from '../scrapers/myChart/messages/sendReply';
import { deleteMessage } from '../scrapers/myChart/messages/deleteMessage';

import { getBillingHistory } from '../scrapers/myChart/bills/bills';
import { getInsurance } from '../scrapers/myChart/insurance';

import { getCareTeam } from '../scrapers/myChart/careTeam';
import { getReferrals } from '../scrapers/myChart/referrals';
import { getLetters, getLetterDetails } from '../scrapers/myChart/letters';
import { getDocuments } from '../scrapers/myChart/documents';
import { getUpcomingOrders } from '../scrapers/myChart/upcomingOrders';
import { getQuestionnaires } from '../scrapers/myChart/questionnaires';
import { getCareJourneys } from '../scrapers/myChart/careJourneys';
import { getActivityFeed } from '../scrapers/myChart/activityFeed';
import { getEducationMaterials } from '../scrapers/myChart/educationMaterials';
import { getEhiExportTemplates } from '../scrapers/myChart/ehiExport';
import { getLinkedMyChartAccounts } from '../scrapers/myChart/other_mycharts/other_mycharts';

import {
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
} from '../scrapers/myChart/emergencyContacts';

import {
  discoverProxyTargets,
  verifyActiveProxyTarget,
  switchProxyTarget,
  findProxyTarget,
} from '../scrapers/myChart/proxyContext';

import { setupPasskey, listPasskeys, deletePasskey } from '../scrapers/myChart/setupPasskey';
import { serializeCredential } from '../scrapers/myChart/softwareAuthenticator';
import { setupTotp, disableTotp } from '../scrapers/myChart/setupTotp';

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

export type CapabilityParamType = 'string' | 'number' | 'boolean' | 'object';

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
  /** The account password, if the client has one stored. TOTP setup needs it. */
  password?: string;
  /** The saved TOTP secret for this account, if any. Disabling TOTP needs it. */
  totpSecret?: string;
  /** Persist a newly-created TOTP secret. */
  saveTotpSecret?: (secret: string) => Promise<void> | void;
  /** Persist a newly-registered passkey credential (already serialized). */
  savePasskey?: (serializedCredential: string) => Promise<void> | void;
}

export type CapabilityArgs = Record<string, unknown>;

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
  params: readonly CapabilityParam[];
  /**
   * True when the payload contains binary image data that each client has to
   * encode itself (the MCPB ships a pure-JS JPEG encoder, the mobile app uses
   * its own decoder, the CLI uses sharp). Clients must still expose the
   * capability — they just post-process `run`'s output.
   */
  rendersMedia?: boolean;
  run: (request: MyChartRequest, args: CapabilityArgs, ctx?: CapabilityContext) => Promise<unknown>;
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

// ── Portable base64url (no Buffer, no atob) ─────────────────────────────────
//
// `image_id` round-trips through the model, the CLI's argv and React Native's
// Hermes runtime. Buffer exists in Node but not reliably on-device, and atob
// is not in the Hermes standard library either, so encode it by hand.

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return out;
}

function utf8String(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) { code = b; i += 1; }
    else if (b < 0xe0) { code = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2; }
    else if (b < 0xf0) { code = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f); i += 3; }
    else {
      code = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      i += 4;
    }
    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

function base64UrlEncode(text: string): string {
  const bytes = utf8Bytes(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2];
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function base64UrlDecode(encoded: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of encoded) {
    if (ch === '=' ) continue;
    const value = B64_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error('not base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return utf8String(bytes);
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

// ── Fuzzy resolution shared by every client ─────────────────────────────────
//
// Models are given display names, not opaque ids, so the name→object lookup
// lives here rather than in one client's tool layer. Ambiguity is always an
// error listing the candidates: picking a provider or a medication on the
// patient's behalf is exactly the guess this codebase must never make.

const TITLE_WORDS = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'md', 'md.', 'do', 'do.', 'np', 'pa', 'rn']);

function nameTokens(query: string): string[] {
  const all = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const withoutTitles = all.filter((t) => !TITLE_WORDS.has(t));
  // A query that is *nothing but* an honorific ("Dr") still narrows the list,
  // and reporting "multiple providers match" beats claiming no name was given.
  return withoutTitles.length > 0 ? withoutTitles : all;
}

/** Resolve a provider name to exactly one recipient, or throw with the options. */
export function resolveRecipient(recipients: MessageRecipient[], query: string): MessageRecipient {
  const tokens = nameTokens(query);
  if (tokens.length === 0) {
    throw new Error(`No recipient name given. Available: ${recipients.map((r) => r.displayName).join(', ')}`);
  }
  const matched = recipients.filter((r) => {
    const name = r.displayName.toLowerCase();
    return tokens.every((t) => name.includes(t));
  });
  if (matched.length === 0) {
    throw new Error(`No recipient matching "${query}". Available: ${recipients.map((r) => r.displayName).join(', ')}`);
  }
  if (matched.length > 1) {
    throw new Error(
      `Multiple recipients match "${query}": ${matched.map((r) => r.displayName).join(', ')}. Be more specific.`,
    );
  }
  return matched[0];
}

/**
 * Resolve a topic name. Unlike recipients, an unmatched topic falls back to the
 * first available one — MyChart requires a topic on every message and the
 * category is cosmetic, so refusing to send over it would be pointless.
 */
export function resolveTopic(topics: MessageTopic[], query: string | undefined): MessageTopic {
  if (topics.length === 0) throw new Error('No message topics are available on this MyChart.');
  const wanted = (query ?? '').toLowerCase().trim();
  if (!wanted) return topics[0];
  return topics.find((t) => t.displayName.toLowerCase().includes(wanted)) ?? topics[0];
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

  const query = str(args, 'medication_name').toLowerCase().trim();
  if (!query) throw new Error('Pass either medication_key (from get_medications) or medication_name.');

  const meds = (await getMedications(request)).medications;
  const matched = meds.filter(
    (m) => m.name.toLowerCase().includes(query) || m.commonName.toLowerCase().includes(query),
  );
  if (matched.length === 0) {
    throw new Error(`No medication matching "${query}". Available: ${meds.map((m) => m.name).join(', ')}`);
  }
  if (matched.length > 1) {
    throw new Error(`Multiple medications match "${query}": ${matched.map((m) => m.name).join(', ')}. Be more specific.`);
  }
  const med = matched[0];
  if (!med.isRefillable) throw new Error(`"${med.name}" is not refillable through MyChart.`);
  if (!med.medicationKey) throw new Error(`"${med.name}" has no medication key, so it cannot be refilled here.`);
  return { key: med.medicationKey, name: med.name };
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

const INSTANCE_NOTE = 'MyChart hostname. Optional when only one account is connected.';

export const CAPABILITIES: readonly Capability[] = [
  // ── Profile / overview ────────────────────────────────────────────────────
  {
    id: 'get_profile',
    title: 'Patient profile',
    description: 'Patient profile (name, date of birth, medical record number, primary care provider) plus the account email address.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: async (request) => {
      const profile = await getMyChartProfile(request);
      let email: string | undefined;
      try {
        email = (await getEmail(request)) ?? undefined;
      } catch {
        // The email endpoint is missing on some instances; the profile is the point.
      }
      return { ...profile, email };
    },
  },
  {
    id: 'get_health_summary',
    title: 'Health summary',
    description: 'Health summary — vitals snapshot, blood type, smoking status and similar top-level facts.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getHealthSummary(request),
  },
  {
    id: 'get_medications',
    title: 'Medications',
    description: 'Current medications with dosage, instructions, prescriber and pharmacy.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getMedications(request),
  },
  {
    id: 'get_allergies',
    title: 'Allergies',
    description: 'Known allergies with reaction and severity.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getAllergies(request),
  },
  {
    id: 'get_health_issues',
    title: 'Health issues',
    description: 'Active health issues / problem list.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getHealthIssues(request),
  },
  {
    id: 'get_vitals',
    title: 'Vitals',
    description: 'Vitals and tracked flowsheet readings (weight, blood pressure, heart rate, glucose, etc.).',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getVitals(request),
  },
  {
    id: 'get_immunizations',
    title: 'Immunizations',
    description: 'Vaccination history.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getImmunizations(request),
  },
  {
    id: 'get_preventive_care',
    title: 'Preventive care',
    description: 'Preventive care recommendations — overdue and upcoming screenings.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getPreventiveCare(request),
  },
  {
    id: 'get_medical_history',
    title: 'Medical history',
    description: 'Past medical, surgical, family and social history.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getMedicalHistory(request),
  },
  {
    id: 'get_goals',
    title: 'Goals',
    description: 'Care team goals and patient-set goals.',
    kind: 'read',
    group: 'Profile',
    params: [],
    run: (request) => getGoals(request),
  },

  // ── Visits + notes ────────────────────────────────────────────────────────
  {
    id: 'get_upcoming_visits',
    title: 'Upcoming visits',
    description: 'Upcoming appointments.',
    kind: 'read',
    group: 'Visits',
    params: [],
    run: (request) => upcomingVisits(request),
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
      return pastVisits(request, oldest);
    },
  },
  {
    id: 'get_visit_notes',
    title: 'Visit notes',
    description:
      'List the clinical notes (operative, progress, anesthesia, …) attached to a past visit. Returns hnoId, hnoDat and lrpId — pass those to get_note_content.',
    kind: 'read',
    group: 'Visits',
    params: [{ name: 'csn', type: 'string', description: 'Visit CSN (encounter id) from get_past_visits.', required: true }],
    run: (request, args) => getVisitNotes(request, requireStr(args, 'csn')),
  },
  {
    id: 'get_note_content',
    title: 'Note content',
    description: 'Fetch the rendered content of a single clinical note listed by get_visit_notes.',
    kind: 'read',
    group: 'Visits',
    params: [
      { name: 'csn', type: 'string', description: 'Visit CSN from get_past_visits.', required: true },
      { name: 'lrp_id', type: 'string', description: 'lrpId from get_visit_notes.', required: true },
      { name: 'hno_id', type: 'string', description: 'hnoId of the chosen note.', required: true },
      { name: 'hno_dat', type: 'string', description: 'hnoDat of the chosen note.', required: true },
    ],
    run: (request, args) =>
      getNoteContent(request, {
        csn: requireStr(args, 'csn'),
        lrpId: requireStr(args, 'lrp_id'),
        hnoId: requireStr(args, 'hno_id'),
        hnoDat: requireStr(args, 'hno_dat'),
      }),
  },
  {
    id: 'get_visit_avs',
    title: 'After Visit Summary',
    description: 'The After Visit Summary for a past visit.',
    kind: 'read',
    group: 'Visits',
    params: [{ name: 'csn', type: 'string', description: 'Visit CSN from get_past_visits.', required: true }],
    run: (request, args) => getVisitAVS(request, requireStr(args, 'csn')),
  },

  // ── Results ───────────────────────────────────────────────────────────────
  {
    id: 'get_lab_results',
    title: 'Lab results',
    description: 'Lab results with reference ranges and prior values for trending.',
    kind: 'read',
    group: 'Results',
    params: [],
    run: (request) => listLabResults(request),
  },
  {
    id: 'get_imaging_results',
    title: 'Imaging results',
    description:
      'Imaging result metadata (X-ray, MRI, CT, ultrasound, …) with reports. Entries that have viewable pictures carry an `image_id` — pass that to download_imaging_study to get the actual images.',
    kind: 'read',
    group: 'Results',
    params: [],
    run: async (request) => {
      const results = await getImagingResults(request);
      // Collapse the raw { fdi, ord } pair into one opaque token: a single
      // copy-paste value is far easier for a model to hand back than two
      // fields it can mix up.
      return results.map((r, index) => {
        if (!r.fdiContext) return { ...r, index };
        const { fdiContext, ...rest } = r;
        return { ...rest, index, image_id: encodeImageId(fdiContext) };
      });
    },
  },
  {
    id: 'download_imaging_study',
    aliases: ['get_xray_image'],
    title: 'Download imaging study',
    description:
      'Download the actual pictures for one imaging study. Identify the study with the `image_id` from get_imaging_results (or its 0-based `imaging_index`). Images are downloaded and decoded on the user’s own device.',
    kind: 'read',
    group: 'Results',
    rendersMedia: true,
    params: [
      { name: 'image_id', type: 'string', description: 'The `image_id` from the chosen get_imaging_results entry. Copy it verbatim.' },
      { name: 'imaging_index', type: 'number', description: 'Alternative to image_id: the 0-based index of the study in get_imaging_results.', min: 0 },
      { name: 'study_name', type: 'string', description: 'Human-readable study name used to label the output. Optional.' },
      { name: 'max_images', type: 'number', description: 'Maximum images to download (default 3).', min: 1, max: 50 },
      // Rendering hint rather than a download parameter: `run` returns raw CLO
      // bytes and each client encodes them, so the quality is applied there.
      { name: 'jpeg_quality', type: 'number', description: 'JPEG quality 1-100 for the returned pictures (default 85).', min: 1, max: 100 },
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
        const results = await getImagingResults(request);
        const study = results[index];
        if (!study) throw new Error(`No imaging result at index ${index} (this account has ${results.length}).`);
        if (!study.fdiContext) throw new Error(`The imaging result at index ${index} has no viewable images.`);
        fdiContext = study.fdiContext;
        studyName = studyName ?? study.orderName;
      } else {
        throw new Error('Pass either image_id (from get_imaging_results) or imaging_index.');
      }

      const maxImages = num(args, 'max_images', 3);
      const result = await downloadImagingStudyDirect(request, fdiContext, studyName ?? 'study', '', {
        skipFileWrite: true,
        maxImages,
      });

      return {
        studyName: result.studyName,
        totalImages: result.images.length,
        images: result.images.map((img, index) => ({
          index,
          seriesUID: img.seriesUID,
          seriesDescription: img.seriesDescription,
          pixelData: img.pixelData,
          wrapperData: img.wrapperData,
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
    run: (request) => listConversations(request),
  },
  {
    id: 'get_message_thread',
    title: 'Message thread',
    description: 'Every message in one conversation.',
    kind: 'read',
    group: 'Messages',
    params: [{ name: 'conversation_id', type: 'string', description: 'Conversation id from get_messages.', required: true }],
    run: (request, args) => getConversationMessages(request, requireStr(args, 'conversation_id')),
  },
  {
    id: 'get_message_recipients',
    title: 'Message recipients',
    description: 'Providers and departments that can receive a new message.',
    kind: 'read',
    group: 'Messages',
    params: [],
    run: async (request) => ({ recipients: await getMessageRecipients(request, await messagingToken(request)) }),
  },
  {
    id: 'get_message_topics',
    title: 'Message topics',
    description: 'Topics/categories a new message can be filed under.',
    kind: 'read',
    group: 'Messages',
    params: [],
    run: async (request) => ({ topics: await getMessageTopics(request, await messagingToken(request)) }),
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
      return sendNewMessage(request, {
        recipient: resolveRecipient(recipients, requireStr(args, 'recipient_name')),
        topic: resolveTopic(topics, optStr(args, 'topic')),
        subject: requireStr(args, 'subject'),
        messageBody: requireStr(args, 'message'),
      });
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
    run: (request) => getBillingHistory(request),
  },
  {
    id: 'get_insurance',
    title: 'Insurance',
    description: 'Insurance coverages on file.',
    kind: 'read',
    group: 'Billing',
    params: [],
    run: (request) => getInsurance(request),
  },

  // ── Care coordination ─────────────────────────────────────────────────────
  {
    id: 'get_care_team',
    title: 'Care team',
    description: 'Members of the care team.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getCareTeam(request),
  },
  {
    id: 'get_referrals',
    title: 'Referrals',
    description: 'Active and past referrals.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getReferrals(request),
  },
  {
    id: 'get_letters',
    title: 'Letters',
    description: 'Letters from providers. Each entry carries the hnoId/csn needed by get_letter_details.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getLetters(request),
  },
  {
    id: 'get_letter_details',
    title: 'Letter contents',
    description: 'The full contents of one letter listed by get_letters.',
    kind: 'read',
    group: 'Care',
    params: [
      { name: 'hno_id', type: 'string', description: 'hnoId from the chosen get_letters entry.', required: true },
      { name: 'csn', type: 'string', description: 'csn from the chosen get_letters entry.', required: true },
    ],
    run: (request, args) => getLetterDetails(request, requireStr(args, 'hno_id'), requireStr(args, 'csn')),
  },
  {
    id: 'get_documents',
    title: 'Documents',
    description: 'Clinical documents and visit records.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getDocuments(request),
  },
  {
    id: 'get_upcoming_orders',
    title: 'Upcoming orders',
    description: 'Standing/upcoming orders — labs, imaging and procedures the care team has ordered.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getUpcomingOrders(request),
  },
  {
    id: 'get_questionnaires',
    title: 'Questionnaires',
    description: 'Open and completed questionnaires / health assessments.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getQuestionnaires(request),
  },
  {
    id: 'get_care_journeys',
    title: 'Care journeys',
    description: 'Care journeys and care plans.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getCareJourneys(request),
  },
  {
    id: 'get_activity_feed',
    title: 'Activity feed',
    description: 'Recent account activity feed items.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getActivityFeed(request),
  },
  {
    id: 'get_education_materials',
    title: 'Education materials',
    description: 'Patient education materials assigned by the care team.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getEducationMaterials(request),
  },
  {
    id: 'get_ehi_export',
    title: 'EHI export templates',
    description: 'Electronic Health Information export templates this instance offers.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getEhiExportTemplates(request),
  },
  {
    id: 'get_linked_accounts',
    title: 'Linked MyChart accounts',
    description: 'MyChart accounts at other organizations that are linked to this one.',
    kind: 'read',
    group: 'Care',
    params: [],
    run: (request) => getLinkedMyChartAccounts(request),
  },

  // ── Emergency contacts ────────────────────────────────────────────────────
  {
    id: 'get_emergency_contacts',
    title: 'Emergency contacts',
    description: 'Emergency contacts on file.',
    kind: 'read',
    group: 'Emergency contacts',
    params: [],
    run: (request) => getEmergencyContacts(request),
  },
  {
    id: 'add_emergency_contact',
    title: 'Add an emergency contact',
    description: 'Add a new emergency contact to the record.',
    kind: 'write',
    group: 'Emergency contacts',
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
      { name: 'medication_key', type: 'string', description: 'Exact medicationKey from get_medications. Use instead of medication_name when you have it.' },
    ],
    run: async (request, args) => {
      const { key, name } = await resolveMedicationKey(request, args);
      const result = await requestMedicationRefill(request, key);
      return { ...result, medication: name };
    },
  },

  // ── Patients (proxy access) ───────────────────────────────────────────────
  {
    id: 'list_patients',
    title: 'List patient records',
    description:
      'Every patient record this account can read — the account holder plus anyone they have proxy access to (a child, a parent). Records other than the account holder are only readable after switch_patient.',
    kind: 'read',
    group: 'Patients',
    params: [],
    run: async (request) => {
      const targets = await discoverProxyTargets(request);
      return {
        count: targets.length,
        patients: targets.map((t) => ({
          id: t.id,
          name: t.displayName,
          isSelf: t.isSelf,
          isActive: t.selectionKnown ? t.isSelected : null,
        })),
      };
    },
  },
  {
    id: 'get_active_patient',
    title: 'Active patient record',
    description: 'Which patient record MyChart is currently showing. Every other read returns this patient’s chart.',
    kind: 'read',
    group: 'Patients',
    params: [],
    run: async (request) => {
      const active = await verifyActiveProxyTarget(request);
      return {
        profileName: active.profileName,
        profileDob: active.profileDob,
        selectionKnown: active.selectionKnown,
        activePatient: active.selectedTarget
          ? { id: active.selectedTarget.id, name: active.selectedTarget.displayName, isSelf: active.selectedTarget.isSelf }
          : null,
      };
    },
  },
  {
    id: 'switch_patient',
    title: 'Switch patient record',
    description:
      'Change which patient record MyChart shows. The active patient is server-side session state, so this changes what EVERY other tool reads until it is switched back. Pass "me" to return to the account holder. The switch is verified against the profile page and fails rather than landing on the wrong chart.',
    kind: 'write',
    group: 'Patients',
    params: [
      { name: 'patient', type: 'string', description: 'Patient name from list_patients, or "me" for the account holder.', required: true },
    ],
    run: async (request, args) => {
      const targets = await discoverProxyTargets(request);
      if (targets.length === 0) {
        throw new Error('This account has access to only one patient record, so there is nothing to switch to.');
      }
      const wanted = findProxyTarget(targets, requireStr(args, 'patient'));
      const result = await switchProxyTarget(request, wanted.isSelf ? { self: true } : { id: wanted.id }, {
        discoveredTargets: targets,
      });
      return {
        activePatient: { id: result.target.id, name: result.target.displayName, isSelf: result.target.isSelf },
        verifiedProfileName: result.verifiedProfileName,
        verifiedDob: result.verifiedDob,
      };
    },
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
export const CAPABILITY_IDS: readonly string[] = CAPABILITIES.map((c) => c.id);

/** The read + write capabilities — everything a model may be offered as a tool. */
export const AGENT_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter((c) => c.kind !== 'account');

/** Ids of the capabilities that mutate the patient's MyChart record. */
export const WRITE_CAPABILITY_IDS: readonly string[] = CAPABILITIES.filter((c) => c.kind === 'write').map((c) => c.id);

const BY_NAME = new Map<string, Capability>();
for (const capability of CAPABILITIES) {
  BY_NAME.set(capability.id, capability);
  for (const alias of capability.aliases ?? []) BY_NAME.set(alias, capability);
}

/** Look a capability up by id or alias. Returns undefined for unknown names. */
export function getCapability(idOrAlias: string): Capability | undefined {
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
 * Run a capability by id (or alias) against a logged-in session.
 * Throws a listing-friendly error for unknown names.
 */
export function executeCapability(
  request: MyChartRequest,
  idOrAlias: string,
  args: CapabilityArgs = {},
  ctx?: CapabilityContext,
): Promise<unknown> {
  const capability = getCapability(idOrAlias);
  if (!capability) {
    return Promise.reject(new Error(`Unknown capability "${idOrAlias}". Known capabilities: ${CAPABILITY_IDS.join(', ')}`));
  }
  return capability.run(request, args, ctx);
}

/** One `name(param, param) — description` line per capability, for prompts and help. */
export function describeCapability(capability: Capability): string {
  const params = capability.params.map((p) => (p.required ? p.name : `${p.name}?`)).join(', ');
  return `${capability.id}(${params}) — ${capability.description}`;
}

export { INSTANCE_NOTE };
