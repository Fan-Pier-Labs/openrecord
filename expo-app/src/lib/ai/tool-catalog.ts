/**
 * The agent-facing tool catalog, extracted so the prompt-side declarations
 * (claude-client.ts) and the execution-side write gating (tool-executor.ts)
 * share one source of truth — a write tool missing its confirmation dialog is
 * exactly the drift this file exists to prevent. Dependency-free on purpose:
 * it must stay importable from bun unit tests (no React Native imports).
 */

export type ToolSpec = {
  name: string;
  description: string;
  /** arg name → prose type hint, rendered into the system prompt. */
  args: Record<string, string>;
};

export const TOOLS: ToolSpec[] = [
  { name: "get_profile", description: "Get the user's MyChart profile information", args: { instance: "MyChart hostname (optional if only one account)" } },
  { name: "get_health_summary", description: "Get a summary of the user's health information", args: { instance: "optional" } },
  { name: "get_medications", description: "Get current and past medications", args: { instance: "optional" } },
  { name: "get_allergies", description: "Get allergy information", args: { instance: "optional" } },
  { name: "get_health_issues", description: "Get health issues / problem list", args: { instance: "optional" } },
  { name: "get_upcoming_visits", description: "Get upcoming appointments", args: { instance: "optional" } },
  { name: "get_past_visits", description: "Get past visit history", args: { instance: "optional", years_back: "number, optional" } },
  { name: "get_lab_results", description: "Get lab test results", args: { instance: "optional", limit: "number", offset: "number" } },
  { name: "get_messages", description: "Get MyChart messages/conversations with providers", args: { instance: "optional", limit: "number", offset: "number" } },
  { name: "get_billing", description: "Get billing history", args: { instance: "optional", limit: "number", offset: "number" } },
  { name: "get_care_team", description: "Get care team members", args: { instance: "optional" } },
  { name: "get_insurance", description: "Get insurance information", args: { instance: "optional" } },
  { name: "get_immunizations", description: "Get immunization records", args: { instance: "optional" } },
  { name: "get_preventive_care", description: "Get preventive care recommendations", args: { instance: "optional" } },
  { name: "get_vitals", description: "Get vital signs history", args: { instance: "optional" } },
  { name: "get_documents", description: "Get medical documents", args: { instance: "optional" } },
  { name: "get_imaging_results", description: "Get imaging/radiology results", args: { instance: "optional", limit: "number", offset: "number" } },
  { name: "get_xray_image", description: "Download the actual X-ray/imaging picture for an imaging result and attach it to the reply. Use the 0-based index from get_imaging_results.", args: { instance: "optional", imaging_index: "0-based index from get_imaging_results" } },
  { name: "get_letters", description: "Get letters from providers", args: { instance: "optional" } },
  { name: "get_referrals", description: "Get referral information", args: { instance: "optional" } },
  { name: "get_medical_history", description: "Get medical history", args: { instance: "optional" } },
  { name: "get_emergency_contacts", description: "Get emergency contacts", args: { instance: "optional" } },
  { name: "get_activity_feed", description: "Get recent activity feed", args: { instance: "optional" } },
  { name: "get_care_journeys", description: "Get care journey information", args: { instance: "optional" } },
  { name: "get_goals", description: "Get health goals", args: { instance: "optional" } },
  { name: "get_education_materials", description: "Get patient education materials", args: { instance: "optional" } },
  { name: "get_message_recipients", description: "List available message recipients and topics (use before send_message if unsure who to message)", args: { instance: "optional" } },
  { name: "list_proxy_targets", description: "List every patient record this account can access — the user plus any family members via MyChart proxy access (e.g. a parent seeing a child's chart) — and which one is currently active", args: { instance: "optional" } },
  { name: "switch_proxy_target", description: "Switch which patient's record MyChart is showing (e.g. to a child's chart). ALL data tools then read that patient's record until switched back. Confirm with the user before switching.", args: { instance: "optional", patient: "patient name from list_proxy_targets, or 'me' for the user's own record" } },
  { name: "send_message", description: "Send a new message to a MyChart provider. Confirm with the user before sending.", args: { instance: "optional", recipient_name: "provider name (fuzzy match)", topic: "topic (fuzzy match, e.g. 'Medical Question')", subject: "subject line", message_body: "message body" } },
  { name: "send_reply", description: "Reply to an existing MyChart conversation. Confirm with the user before sending.", args: { instance: "optional", conversation_id: "conversation id from get_messages", message_body: "reply text" } },
  { name: "request_refill", description: "Request a medication refill. Confirm with the user before submitting.", args: { instance: "optional", medication_name: "medication name (fuzzy match)" } },
];

export type WriteToolMeta = {
  /** Dialog title shown in the confirmation popup. */
  title: string;
  /** One-line explanation of what confirming will do. */
  description: string;
  /** Confirm-button label (defaults to "Send"). */
  confirmLabel?: string;
};

/**
 * Tools that mutate state — on MyChart's server or the session pointed at it.
 * Every entry gets a native confirmation dialog before executing and is
 * exclusive in the agent protocol (must be the only tool call in a turn).
 */
export const WRITE_TOOL_META: Record<string, WriteToolMeta> = {
  send_message: {
    title: "Send Message",
    description: "Sends a new message to a MyChart provider.",
  },
  send_reply: {
    title: "Send Reply",
    description: "Replies to an existing MyChart conversation.",
  },
  request_refill: {
    title: "Request Refill",
    description: "Submits a medication refill request to MyChart.",
  },
  switch_proxy_target: {
    title: "Switch Patient Record",
    description:
      "Changes which patient's chart MyChart is showing. All data tools will read that patient's record until switched back.",
    confirmLabel: "Switch",
  },
};

export const WRITE_TOOLS: ReadonlySet<string> = new Set(Object.keys(WRITE_TOOL_META));

export const RESPOND_TOOL = "respond";

export function isExclusiveTool(name: string): boolean {
  return name === RESPOND_TOOL || WRITE_TOOLS.has(name);
}
