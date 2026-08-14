/** Shared types for the demo's record, tool layer, and agent loop. */

/* ── Record ─────────────────────────────────────────────────────────── */

export type Medication = {
  name: string;
  directions: string;
  prescriber: string;
  pharmacy: string;
  refillsRemaining: number;
  lastFilled: string;
};

export type LabComponent = {
  component: string;
  value: string;
  units: string;
  referenceRange: string;
  flag: 'Normal' | 'High' | 'Low';
};

export type LabPanel = {
  testName: string;
  orderedBy: string;
  collectedDate: string;
  status: string;
  results: LabComponent[];
};

export type MessageEntry = { from: string; date: string; body: string };

export type Conversation = {
  id: string;
  subject: string;
  from: string;
  date: string;
  preview: string;
  messages: MessageEntry[];
  /** Set on threads created during this demo session. */
  sentThisSession?: boolean;
};

export type BillingCharge = {
  date: string;
  description: string;
  provider: string;
  totalCharge: string;
  insurancePaid: string;
  patientResponsibility: string;
  status: 'Paid' | 'Payment Plan' | 'Outstanding';
};

export type EmergencyContact = {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  addedThisSession?: boolean;
};

export type Visit = {
  type: string;
  provider: string;
  department: string;
  location: string;
  date: string;
  time: string;
  status: string;
  instructions?: string;
  bookedThisSession?: boolean;
};

export type AppointmentSlot = { date: string; time: string; slotId: string };

export type AppointmentOffer = {
  provider: string;
  department: string;
  location: string;
  visitType: string;
  slots: AppointmentSlot[];
};

export type Insight = {
  id: string;
  title: string;
  severity: 'info' | 'discuss' | 'discuss_soon';
  bodyMd: string;
  suggestedQuestion: string;
};

export type SeedChat = { id: string; title: string; updatedAt: string };

/* ── Patients ───────────────────────────────────────────────────────── */

/** A rendered document as MyChart returns it — a clinical note, an AVS. */
export type RenderedDocument = { contentHtml: string; contentCss: string };

/**
 * One patient's entire chart.
 *
 * MyChart's active patient is *server-side session state*: every data endpoint
 * returns whichever record the portal is currently pointed at, and
 * `switch_proxy_target` is the only thing that moves it. The demo models it the
 * same way — one record per accessible patient, with `Session.activePatient`
 * deciding which one every read resolves against. A switch that didn't change
 * the answers would demo a lie.
 *
 * Closed on purpose, with no optional fields: a second patient cannot quietly
 * answer fewer questions than the first. Every tool has a defined answer for
 * every record, even when that answer is an empty list.
 */
export type PatientRecord = {
  profile: {
    name: string;
    preferredName: string;
    dateOfBirth: string;
    sex: string;
    mrn: string;
    primaryCareProvider: string;
    address: string;
    phone: string;
    email: string;
  };
  healthSummary: {
    bloodType: string;
    height: string;
    weight: string;
    bmi: string;
    bloodPressure: string;
    heartRate: string;
    lastUpdated: string;
  };
  medications: Medication[];
  allergies: { allergen: string; reaction: string; severity: string; type: string }[];
  healthIssues: { condition: string; status: string; onsetDate: string; provider: string }[];
  medicalHistory: {
    pastConditions: { condition: string; year: string; status: string }[];
    surgicalHistory: { procedure: string; year: string; provider: string }[];
    familyHistory: { relation: string; conditions: string[] }[];
  };
  vitals: { date: string; measurements: { name: string; value: string; units: string }[] }[];
  immunizations: { vaccine: string; date: string; site: string; provider: string }[];
  careTeam: { name: string; role: string; specialty: string; phone: string }[];
  emergencyContacts: EmergencyContact[];
  goals: { goal: string; setBy: string; status: string; targetDate: string }[];
  preventiveCare: { item: string; status: string; dueDate: string; lastCompleted: string }[];
  labResults: LabPanel[];
  imagingResults: {
    study: string;
    date: string;
    orderedBy: string;
    facility: string;
    status: string;
    hasImages: boolean;
    seriesCount: number;
    impression: string;
  }[];
  upcomingOrders: {
    orderType: string;
    testName: string;
    orderedBy: string;
    orderDate: string;
    instructions: string;
  }[];
  upcomingVisits: Visit[];
  pastVisits: {
    csn: string;
    type: string;
    provider: string;
    department: string;
    date: string;
    reason: string;
    diagnoses: string[];
  }[];
  visitNotes: {
    csn: string;
    lrpId: string;
    depPhoneNumber: string;
    isAtLeastOneNoteSensitive: boolean;
    notes: {
      hnoId: string;
      hnoDat: string;
      displayName: string;
      iso: string;
      isAddendum: boolean;
      isNoteSensitive: boolean;
      providerName: string;
      providerMagicId: string;
    }[];
  };
  noteContentByHnoId: Record<string, RenderedDocument>;
  visitAVS: RenderedDocument;
  careJourneys: { name: string; status: string; startDate: string; provider: string; nextStep: string }[];
  referrals: {
    referralTo: string;
    reason: string;
    referredBy: string;
    date: string;
    status: string;
    expirationDate: string;
  }[];
  /** `hnoId`/`csn` are what `get_letter_details` drills in on, as in the real registry. */
  letters: {
    hnoId: string;
    csn: string;
    title: string;
    date: string;
    provider: string;
    type: string;
    summary: string;
  }[];
  letterContentByHnoId: Record<string, RenderedDocument>;
  documents: { title: string; date: string; type: string; provider: string }[];
  questionnaires: {
    name: string;
    assignedDate: string;
    dueDate: string;
    status: string;
    appointment: string;
  }[];
  educationMaterials: { title: string; assignedBy: string; date: string; category: string }[];
  activityFeed: { date: string; type: string; description: string }[];
  ehiExport: { availableFormats: string[]; lastExport: string; note: string };
  billing: BillingCharge[];
  insurance: {
    plan: string;
    memberId: string;
    groupNumber: string;
    subscriber: string;
    effectiveDate: string;
    copay: { office: string; specialist: string; urgentCare: string; er: string };
    deductible: string;
    outOfPocketMax: string;
  }[];
  messages: Conversation[];
  messageRecipients: {
    recipients: { displayName: string; specialty: string; department: string }[];
    topics: { displayName: string; value: string }[];
  };
  availableAppointments: AppointmentOffer[];
};

/** One record the account can reach, as `list_proxy_targets` reports it. */
export type ProxyTarget = {
  id: string;
  /** Full name, and the key into `Session.patients`. */
  name: string;
  relationship: string;
  /** True for the account holder's own chart — `switch_proxy_target` "me". */
  isSelf: boolean;
};

/* ── Session ────────────────────────────────────────────────────────── */

/** One demo visitor's mutable copy of the record. */
export type Session = {
  hostname: string;
  username: string;
  connected: boolean;
  /** Every chart this account can reach, keyed by patient name. */
  patients: Record<string, PatientRecord>;
  /**
   * Whose chart every read resolves against. Server-side state in real
   * MyChart, so it persists across turns until `switch_proxy_target` moves it.
   */
  activePatient: string;
  activityLog: { kind: string; summary: string; at: string }[];
};

/* ── Tools ──────────────────────────────────────────────────────────── */

export type ToolGroup =
  | 'Account'
  | 'Patients'
  | 'Record'
  | 'Results'
  | 'Visits'
  | 'Documents'
  | 'Billing'
  | 'Messaging'
  | 'Actions';

/**
 * Patient-facing copy for the confirmation dialog a write tool opens.
 *
 * It lives on the tool spec rather than in a lookup table beside it so the two
 * cannot drift: declaring a write tool means writing the dialog that gates it,
 * and the type is what enforces that. The real iOS client derives the same
 * three fields from `kind: 'write'` in `shared/capabilities.ts`.
 */
export type WriteMeta = {
  /** Dialog title — the action, not the function name. "Send Message". */
  title: string;
  /** One line on what approving will do. */
  description: string;
  /** Approve-button label. "Send", "Book", "Remove". */
  verb: string;
};

export type ToolSpec = {
  name: string;
  group: ToolGroup;
  description: string;
  args: Record<string, string>;
  /**
   * Present iff the tool changes portal state. A write must be called alone
   * and is put to the user in a confirmation dialog built from this copy;
   * reads just run. Absent means read.
   */
  write?: WriteMeta;
};

export type ToolArgs = Record<string, unknown>;

/** Any tool can fail with a message the model is expected to recover from. */
export type ToolError = { error: string };

export type ToolResult = unknown;

/** One executed call, as shown in the activity panel and desktop disclosures. */
export type ToolRecord = {
  tool: string;
  args: ToolArgs;
  result: ToolResult;
  ms: number;
};

export function isToolError(result: ToolResult): result is ToolError {
  return typeof result === 'object' && result !== null && 'error' in result;
}

/* ── Agent ──────────────────────────────────────────────────────────── */

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = { role: ChatRole; content: string };

export type ParsedToolCall = { tool: string; args: ToolArgs };

/** Provider-neutral completion function. Returns the model's raw text. */
export type CompleteFn = (
  messages: ChatMessage[],
  system: string,
  signal?: AbortSignal,
) => Promise<string>;

export type TurnCallbacks = {
  onToolStart?: (call: ParsedToolCall) => void;
  onToolEnd?: (record: ToolRecord) => void;
  /** The model call failed; the turn is about to throw. */
  onError?: (error: Error) => void;
  /**
   * Put a proposed write to the user and resolve with their answer. The loop
   * blocks on this, so the tool does not run until it resolves true.
   *
   * Omitting it denies every write: a surface that forgets to wire the dialog
   * must fail shut, not run writes with no confirmation at all.
   */
  onConfirmWrite?: (write: PendingWrite) => Promise<boolean>;
};

/**
 * A write the model proposed but has not been allowed to run yet.
 *
 * The system prompt tells the model to confirm every write with the user
 * first, but a prompt is not a guarantee — a cheap model will happily fire
 * send_message off the back of a plain question. The loop holds the call and
 * puts it to the user as a dialog before anything executes.
 */
export type PendingWrite = {
  tool: string;
  args: ToolArgs;
  /**
   * Extra rows for the confirmation dialog, resolved by code from session
   * state — e.g. what a bare slot_id actually means (provider, date, time).
   * The dialog's contract is "the user sees what will really run", and an
   * opaque id on its own doesn't meet it.
   */
  details?: { label: string; value: string }[];
};

export type TurnResult = {
  text: string;
  toolCalls: ToolRecord[];
};

export type Surface = 'ios' | 'desktop';

/* ── Skills and alerts ──────────────────────────────────────────────── */

export type Skill = {
  id: string;
  title: string;
  description: string;
  icon: string;
  kickoffMessage: string;
  playbook: string;
};

export type Alert = {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  usesAi: boolean;
  prompt: string;
  /** Hides the card once session state makes it moot. */
  resolvedWhen?: (session: Session) => boolean;
};
