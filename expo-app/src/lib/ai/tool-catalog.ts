/**
 * The agent-facing tool catalog.
 *
 * Two things live here, and they are deliberately in one file: the tool
 * declarations that go into the system prompt (claude-client.ts) and the
 * write-gating metadata the executor confirms against (tool-executor.ts). A
 * write tool missing its confirmation dialog is exactly the drift this file
 * exists to prevent.
 *
 * The list itself is *derived*, not written here — it comes from the shared
 * capability registry (`shared/capabilities/`), which the CLI, the npm
 * client and the Claude Desktop extension also derive from. The mobile list
 * used to be hand-maintained and had fallen behind the other clients by eight
 * tools: visit notes, note contents, the After Visit Summary, questionnaires,
 * upcoming orders, EHI export templates, linked accounts, message threads and
 * the whole emergency-contact write surface were simply absent on mobile, so
 * the answer a patient got depended on which client they asked.
 *
 * Only read, write and public capabilities appear. `account`-kind capabilities
 * change how the patient signs in to MyChart; those live on the settings
 * screen, where a human drives them.
 *
 * Dependency-free on purpose: no React Native imports, so bun unit tests can
 * read it directly.
 */

import {
  ACCOUNT_PARAM,
  AGENT_CAPABILITIES,
  MODE_PARAM,
  MODEL_FACING_OUTPUT_MODE,
  PATIENT_PARAM,
  acceptsAccountParam,
  acceptsModeParam,
  acceptsPatientParam,
  capabilityDescription,
  describeModeParam,
  CAPABILITIES,
} from "../../../../shared/capabilities";

export type ToolSpec = {
  name: string;
  description: string;
  /** arg name → prose type hint, rendered into the system prompt. */
  args: Record<string, string>;
};

function argHint(type: string, required: boolean | undefined, description: string): string {
  return `${type}${required ? "" : ", optional"} — ${description}`;
}

export const TOOLS: ToolSpec[] = AGENT_CAPABILITIES.map((capability) => ({
  name: capability.id,
  description: capabilityDescription(capability),
  args: {
    // Declared by the registry, so the parity test can see it. This used to be
    // spelled `instance` here and `account` in the extension — the one
    // parameter on almost every tool in every client, and the only one that
    // had already drifted. `instance` is still accepted at execution time.
    // The `public` lookups (NPI Registry, MyChart directory) take no account:
    // there is nothing to connect before using them.
    ...(acceptsAccountParam(capability)
      ? { [ACCOUNT_PARAM.name]: ACCOUNT_PARAM.description }
      : {}),
    // Which patient the call is about. The dispatch asserts it before running
    // and refuses on a mismatch, so the model has to be able to say it.
    ...(acceptsPatientParam(capability)
      ? { patient: argHint("string", false, PATIENT_PARAM.description) }
      : {}),
    // How the payload is rendered. The executor fills in the concise default
    // when the model says nothing; the model asks for more by name.
    ...(acceptsModeParam(capability)
      ? { [MODE_PARAM.name]: argHint("string", false, describeModeParam(MODEL_FACING_OUTPUT_MODE)) }
      : {}),
    ...Object.fromEntries(
      capability.params.map((p) => [p.name, argHint(p.type, p.required, p.description)]),
    ),
  },
}));

export type WriteToolMeta = {
  /** Dialog title shown in the confirmation popup. */
  title: string;
  /** One-line explanation of what confirming will do. */
  description: string;
  /** Confirm-button label (defaults to "Send"). */
  confirmLabel?: string;
};

/** Confirm-button labels that read better than the default "Send". */
const CONFIRM_LABELS: Record<string, string> = {
  switch_proxy_target: "Switch",
  request_refill: "Request",
  delete_message: "Delete",
  remove_emergency_contact: "Remove",
  add_emergency_contact: "Add",
  update_emergency_contact: "Update",
};

/**
 * Tools that mutate state — on MyChart's server or the session pointed at it.
 * Every entry gets a native confirmation dialog before executing and is
 * exclusive in the agent protocol (must be the only tool call in a turn).
 *
 * Derived from the registry's `kind`, so a write added there is
 * confirmation-gated here from the first build. The previous hand-written map
 * covered four of the eight writes the other clients already had.
 */
export const WRITE_TOOL_META: Record<string, WriteToolMeta> = Object.fromEntries(
  CAPABILITIES.filter((c) => c.kind === "write").map((c) => [
    c.id,
    {
      title: c.title,
      description: capabilityDescription(c),
      ...(CONFIRM_LABELS[c.id] ? { confirmLabel: CONFIRM_LABELS[c.id] } : {}),
    },
  ]),
);

export const WRITE_TOOLS: ReadonlySet<string> = new Set(Object.keys(WRITE_TOOL_META));

export const RESPOND_TOOL = "respond";

export function isExclusiveTool(name: string): boolean {
  return name === RESPOND_TOOL || WRITE_TOOLS.has(name);
}

/** The `- name(args) — description` block that goes into the system prompt. */
export function renderToolList(): string {
  return TOOLS.map(
    (t) => `- ${t.name}(${Object.keys(t.args).join(", ")}) — ${t.description}`,
  ).join("\n");
}
