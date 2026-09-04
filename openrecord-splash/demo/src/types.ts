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

export type Profile = {
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

export type HealthSummary = {
  bloodType: string;
  height: string;
  weight: string;
  bmi: string;
  bloodPressure: string;
  heartRate: string;
  lastUpdated: string;
};

export type Allergy = { allergen: string; reaction: string; severity: string; type: string };

export type HealthIssue = { condition: string; status: string; onsetDate: string; provider: string };

export type MedicalHistory = {
  pastConditions: { condition: string; year: string; status: string }[];
  surgicalHistory: { procedure: string; year: string; provider: string }[];
  familyHistory: { relation: string; conditions: string[] }[];
};

export type VitalsEntry = { date: string; measurements: { name: string; value: string; units: string }[] };

export type Immunization = { vaccine: string; date: string; site: string; provider: string };

export type CareTeamMember = { name: string; role: string; specialty: string; phone: string };

export type Goal = { goal: string; setBy: string; status: string; targetDate: string };

export type PreventiveCareItem = { item: string; status: string; dueDate: string; lastCompleted: string };

/** One series within an imaging study — what download_imaging_study enumerates. */
export type ImagingSeries = { seriesUID: string; seriesDescription: string; imageCount: number };

export type ImagingStudy = {
  study: string;
  date: string;
  orderedBy: string;
  facility: string;
  status: string;
  hasImages: boolean;
  seriesCount: number;
  impression: string;
  /**
   * Opaque token identifying the study's pictures, handed to
   * download_imaging_study. `null` for report-only results — exactly like the
   * real registry, which only attaches an `image_id` to studies that have
   * viewable images.
   */
  imageId: string | null;
  series: ImagingSeries[];
};

export type UpcomingOrder = {
  orderType: string;
  testName: string;
  orderedBy: string;
  orderDate: string;
  instructions: string;
};

export type PastVisit = {
  csn: string;
  type: string;
  provider: string;
  department: string;
  date: string;
  reason: string;
  diagnoses: string[];
};

export type VisitNote = {
  hnoId: string;
  hnoDat: string;
  displayName: string;
  iso: string;
  isAddendum: boolean;
  isNoteSensitive: boolean;
  providerName: string;
  providerMagicId: string;
};

export type VisitNotes = {
  csn: string;
  lrpId: string;
  depPhoneNumber: string;
  isAtLeastOneNoteSensitive: boolean;
  notes: VisitNote[];
};

/** Rendered HTML + its stylesheet, the shape MyChart returns for notes and letters. */
export type RenderedDocument = { contentHtml: string; contentCss: string };

export type CareJourney = { name: string; status: string; startDate: string; provider: string; nextStep: string };

export type Referral = {
  referralTo: string;
  reason: string;
  referredBy: string;
  date: string;
  status: string;
  expirationDate: string;
};

/** A letter entry. `hnoId` + `csn` are what get_letter_details takes. */
export type Letter = {
  title: string;
  date: string;
  provider: string;
  type: string;
  summary: string;
  hnoId: string;
  csn: string;
};

/** get_letter_details' payload — the real scraper returns exactly this one field. */
export type LetterDetail = { bodyHTML: string };

export type ClinicalDocument = { title: string; date: string; type: string; provider: string };

export type Questionnaire = {
  name: string;
  assignedDate: string;
  dueDate: string;
  status: string;
  appointment: string;
};

export type EducationMaterial = { title: string; assignedBy: string; date: string; category: string };

export type ActivityFeedEntry = { date: string; type: string; description: string };

export type EhiExport = { availableFormats: string[]; lastExport: string; note: string };

export type LinkedAccount = { organization: string; hostname: string; status: string };

export type MessageRecipient = { displayName: string; specialty: string; department: string };

export type MessageTopic = { displayName: string; value: string };

export type InsurancePlan = {
  plan: string;
  memberId: string;
  groupNumber: string;
  subscriber: string;
  effectiveDate: string;
  copay: { office: string; specialist: string; urgentCare: string; er: string };
  deductible: string;
  outOfPocketMax: string;
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

/**
 * One patient's whole chart.
 *
 * There are two: the account holder's, and the child record his MyChart
 * account has proxy access to. Every read tool resolves its data off the
 * ACTIVE record, which is what makes switch_proxy_target a real switch rather
 * than a message that says one happened.
 *
 * The trailing fields are the mutable ones — `createSession` clones them into
 * per-patient session state so a refill on one chart cannot touch the other.
 */
export type PatientRecord = {
  profile: Profile;
  healthSummary: HealthSummary;
  allergies: Allergy[];
  healthIssues: HealthIssue[];
  medicalHistory: MedicalHistory;
  vitals: VitalsEntry[];
  immunizations: Immunization[];
  careTeam: CareTeamMember[];
  goals: Goal[];
  preventiveCare: PreventiveCareItem[];
  labResults: LabPanel[];
  imagingResults: ImagingStudy[];
  upcomingOrders: UpcomingOrder[];
  pastVisits: PastVisit[];
  visitNotes: VisitNotes;
  noteContentByHnoId: Record<string, RenderedDocument>;
  visitAVS: RenderedDocument;
  careJourneys: CareJourney[];
  referrals: Referral[];
  letters: Letter[];
  letterDetailsByHnoId: Record<string, LetterDetail>;
  documents: ClinicalDocument[];
  questionnaires: Questionnaire[];
  educationMaterials: EducationMaterial[];
  activityFeed: ActivityFeedEntry[];
  ehiExport: EhiExport;
  linkedAccounts: LinkedAccount[];
  messageRecipients: MessageRecipient[];
  messageTopics: MessageTopic[];
  billing: BillingCharge[];
  insurance: InsurancePlan[];

  medications: Medication[];
  messages: Conversation[];
  emergencyContacts: EmergencyContact[];
  upcomingVisits: Visit[];
  availableAppointments: AppointmentOffer[];
};

/** A record this account can reach, plus the session's mutations to it. */
export type PatientState = {
  /** MyChart's own id for the record, as reported by list_proxy_targets. */
  id: string;
  name: string;
  isSelf: boolean;
  relationship: string;
  dateOfBirth: string;
  /** The static chart. Read tools clone out of here. */
  record: PatientRecord;
  medications: Medication[];
  messages: Conversation[];
  emergencyContacts: EmergencyContact[];
  upcomingVisits: Visit[];
  availableAppointments: AppointmentOffer[];
};

/* ── Session ────────────────────────────────────────────────────────── */

/** One demo visitor's mutable copy of the record. */
export type Session = {
  hostname: string;
  username: string;
  connected: boolean;
  /**
   * Whether credentials for this account are still saved.
   *
   * `disconnect_account` clears it and every data tool then refuses, the same
   * way the real extension's tools fail once the credential store no longer
   * has the account. `setup_account` puts it back.
   */
  configured: boolean;
  /** A setup_account call that came back `need_2fa` and is waiting on a code. */
  pendingLogin: { pendingId: string; hostname: string; username: string } | null;
  /**
   * Which record MyChart is showing. Server-side state in the real portal —
   * only switch_proxy_target changes it, and reads assert it rather than
   * following it.
   */
  activePatientId: string;
  patients: PatientState[];
  activityLog: { kind: string; summary: string; at: string }[];

  /**
   * The active patient's mutable state, as live arrays.
   *
   * Getters, not copies: the alerts panel and the settings screen read these,
   * and they have to follow a proxy switch the same way the tools do.
   */
  readonly medications: Medication[];
  readonly messages: Conversation[];
  readonly emergencyContacts: EmergencyContact[];
  readonly upcomingVisits: Visit[];
  readonly availableAppointments: AppointmentOffer[];
};

/* ── Tools ──────────────────────────────────────────────────────────── */

export type ToolGroup =
  | 'Account'
  | 'Patients'
  /**
   * Public lookups that need no account at all — CMS's NPI Registry. `public`
   * in `shared/capabilities.ts`; the demo answers them from its own cast
   * rather than calling the real registry, which holds real people.
   */
  | 'Providers'
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
 * three fields from `kind: 'write'` in `shared/capabilities/`.
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

// Every field is `?: T | undefined`, not plain `?: T`: callers forward
// callbacks they may not have (App.tsx passes a surface's handlers straight
// through), and `runAgentTurn` reads each one as `?? noop`, so an explicit
// `undefined` and an absent key mean the same thing here.
export type TurnCallbacks = {
  onToolStart?: ((call: ParsedToolCall) => void) | undefined;
  onToolEnd?: ((record: ToolRecord) => void) | undefined;
  /** The model call failed; the turn is about to throw. */
  onError?: ((error: Error) => void) | undefined;
  /**
   * Put a proposed write to the user and resolve with their answer. The loop
   * blocks on this, so the tool does not run until it resolves true.
   *
   * Omitting it denies every write: a surface that forgets to wire the dialog
   * must fail shut, not run writes with no confirmation at all.
   */
  onConfirmWrite?: ((write: PendingWrite) => Promise<boolean>) | undefined;
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
