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

/* ── Session ────────────────────────────────────────────────────────── */

/** One demo visitor's mutable copy of the record. */
export type Session = {
  hostname: string;
  username: string;
  connected: boolean;
  medications: Medication[];
  messages: Conversation[];
  emergencyContacts: EmergencyContact[];
  upcomingVisits: Visit[];
  availableAppointments: AppointmentOffer[];
  activityLog: { kind: string; summary: string; at: string }[];
};

/* ── Tools ──────────────────────────────────────────────────────────── */

export type ToolGroup =
  | 'Account'
  | 'Record'
  | 'Results'
  | 'Visits'
  | 'Documents'
  | 'Billing'
  | 'Messaging'
  | 'Actions';

export type ToolSpec = {
  name: string;
  group: ToolGroup;
  description: string;
  args: Record<string, string>;
  /** Write tools change portal state; they must be called alone and confirmed. */
  write?: boolean;
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
