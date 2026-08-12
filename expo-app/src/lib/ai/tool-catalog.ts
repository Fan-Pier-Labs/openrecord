/**
 * The tools the on-device agent is told about, derived from the shared
 * capability registry (`shared/capabilities.ts`) rather than hand-listed.
 *
 * The list used to be maintained by hand and had fallen behind the CLI and the
 * Claude Desktop extension by eight tools: visit notes, the note contents, the
 * After Visit Summary, questionnaires, upcoming orders, EHI export templates,
 * linked accounts, message threads and the whole emergency-contact write
 * surface were simply absent on mobile — so the answer a patient got depended
 * on which client they happened to ask. Adding an entry to the registry now
 * adds it here, and `shared/__tests__/capability-parity.test.ts` fails if this
 * catalog ever covers less than the registry does.
 *
 * Only read + write capabilities appear. `account`-kind capabilities change
 * how the patient signs in to MyChart; those live on the settings screen,
 * where a human drives them.
 *
 * Kept free of React Native imports so it can be imported by tests directly.
 */

import {
  AGENT_CAPABILITIES,
  INSTANCE_NOTE,
  WRITE_CAPABILITY_IDS,
} from "../../../../shared/capabilities";

export type AgentTool = {
  name: string;
  description: string;
  args: Record<string, string>;
};

export const TOOLS: AgentTool[] = AGENT_CAPABILITIES.map((capability) => ({
  name: capability.id,
  description: capability.description,
  args: {
    instance: INSTANCE_NOTE,
    ...Object.fromEntries(
      capability.params.map((p) => [
        p.name,
        `${p.type}${p.required ? "" : ", optional"} — ${p.description}`,
      ]),
    ),
  },
}));

/**
 * Which tools mutate the record is a property of the capability, not of the
 * agent loop — so a new write tool is exclusive and confirmation-gated the day
 * it enters the registry, without anyone remembering to update a set here.
 */
export const WRITE_TOOL_NAMES: readonly string[] = WRITE_CAPABILITY_IDS;

/** The `- name(args) — description` block that goes into the system prompt. */
export function renderToolList(): string {
  return TOOLS.map(
    (t) => `- ${t.name}(${Object.keys(t.args).join(", ")}) — ${t.description}`,
  ).join("\n");
}
