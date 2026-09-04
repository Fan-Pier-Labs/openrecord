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
 * own their own presentation, and only their presentation. The entries
 * themselves live one file per group under `registry/`; this file is the
 * assembly, the lookup and the dispatch.
 *
 * ## Capabilities that need no account
 *
 * Not everything OpenRecord can do is a chart read. Looking a provider up in
 * the NPI Registry, or finding which MyChart a health system runs, is public
 * data — and each client used to hand-write its own version of that, which is
 * how the Claude Desktop extension ended up the only client able to search the
 * MyChart directory. Those live here too, as `kind: 'public'`: no `account`
 * parameter, no session, no patient assertion, and no client-side list.
 *
 * ## Adding one
 *
 * Add the entry to its group's file in `registry/` (a new group also goes in
 * {@link CAPABILITY_IMPLS} below, in the order it should be listed). Every
 * client picks it up automatically: the MCP server registers a tool, the mobile
 * agent lists it in its prompt, the CLI gains `--action <id>`, and the npm
 * client gains a `runCapability(id, …)` route. The only thing a client may
 * still need is bespoke presentation (see `rendersMedia`).
 */

import type { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import type { RawResponse } from '../../scrapers/myChart/core/rawResponse';
import { renderOutput } from '../../scrapers/myChart/processors/processor';
import { assertProxyReadContext } from '../../scrapers/myChart/proxy/proxyTools';

import { optStr } from './args';
import { readOutputMode } from './params';
import { isPublicCapability } from './public';
import type { Capability, CapabilityArgs, CapabilityContext, CapabilityImpl } from './types';

import { PROFILE_CAPABILITIES } from './registry/profile';
import { VISIT_CAPABILITIES } from './registry/visits';
import { RESULT_CAPABILITIES } from './registry/results';
import { MESSAGE_CAPABILITIES } from './registry/messages';
import { BILLING_CAPABILITIES } from './registry/billing';
import { CARE_CAPABILITIES } from './registry/care';
import { EMERGENCY_CONTACT_CAPABILITIES } from './registry/emergencyContacts';
import { PRESCRIPTION_CAPABILITIES } from './registry/prescriptions';
import { PATIENT_CAPABILITIES } from './registry/patients';
import { ACCOUNT_SECURITY_CAPABILITIES } from './registry/accountSecurity';
import { PROVIDER_CAPABILITIES } from './registry/providers';
import { DIRECTORY_CAPABILITIES } from './registry/directory';

export type {
  Capability,
  CapabilityArgs,
  CapabilityContext,
  CapabilityKind,
  CapabilityParam,
  CapabilityParamType,
} from './types';
export { encodeImageId, decodeImageId, type StudyImagePayload } from './imaging';
export { resolveRecipient, resolveTopic } from './resolve';
export {
  ACCOUNT_PARAM,
  ACCOUNT_PARAM_NAMES,
  MODE_PARAM,
  MODEL_FACING_OUTPUT_MODE,
  PATIENT_PARAM,
  describeModeParam,
  readAccountArg,
  readOutputMode,
} from './params';
export { acceptsAccountParam, isPublicCapability } from './public';

/**
 * The registry, in listing order. The order of these arrays is the order every
 * client shows its tools in, so it is a presentation decision, not an
 * accident — see {@link capabilitiesByGroup}.
 */
const CAPABILITY_IMPLS: readonly CapabilityImpl[] = [
  ...PROFILE_CAPABILITIES,
  ...VISIT_CAPABILITIES,
  ...RESULT_CAPABILITIES,
  ...MESSAGE_CAPABILITIES,
  ...BILLING_CAPABILITIES,
  ...CARE_CAPABILITIES,
  ...EMERGENCY_CONTACT_CAPABILITIES,
  ...PRESCRIPTION_CAPABILITIES,
  ...PATIENT_CAPABILITIES,
  ...ACCOUNT_SECURITY_CAPABILITIES,
  ...PROVIDER_CAPABILITIES,
  ...DIRECTORY_CAPABILITIES,
];

// ── Lookup helpers ──────────────────────────────────────────────────────────

/**
 * Every capability, as clients see them: no `run`. Reaching the implementation
 * is a compile error outside this module — see `CapabilityImpl`, which
 * `./types` exports and this file deliberately does not re-export.
 */
export const CAPABILITIES: readonly Capability[] = CAPABILITY_IMPLS;

/** Capability ids in registry order. */
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

/**
 * The capabilities that need no MyChart account — public directories and
 * registries. Clients use this to decide what to offer, and what to run,
 * before anyone has connected anything.
 */
export const PUBLIC_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(isPublicCapability);

export const PUBLIC_CAPABILITY_IDS: readonly string[] = PUBLIC_CAPABILITIES.map((c) => c.id);

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
 * because they act on the MyChart login, not on any one patient's chart, and
 * `public`-kind ones because they have no chart and no session to assert
 * against — see `PublicCapabilityImpl` in `./types`.
 */
function needsPatientAssertion(capability: Capability): boolean {
  return (
    capability.group !== 'Patients' && capability.kind !== 'account' && !isPublicCapability(capability)
  );
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
  request: MyChartRequest | null,
  idOrAlias: string,
  args: CapabilityArgs = {},
  ctx?: CapabilityContext,
): Promise<unknown> {
  const capability = getCapabilityImpl(idOrAlias);
  if (!capability) {
    throw new Error(`Unknown capability "${idOrAlias}". Known capabilities: ${CAPABILITY_IDS.join(', ')}`);
  }
  // Before anything else, including the patient assertion: a capability with no
  // scraper has nothing to assert about and no session to spend on it. Compared
  // against undefined rather than for truthiness, because that is what narrows
  // the union — everything past this line has a `run`.
  if (capability.notImplemented !== undefined) return capability.notImplemented;

  let result: unknown;
  if (capability.kind === 'public') {
    // Public capabilities are the reason `request` is nullable: they read the
    // NPI Registry or Epic's instance directory, which no account owns. Their
    // `run` cannot take a session, so there is nothing to assert and nothing
    // that could read the wrong chart.
    result = await capability.run(args);
  } else {
    // Everything else needs one. A client that lost track of which kind it was
    // dispatching gets this rather than a `Cannot read properties of null`
    // fifteen frames into a scraper.
    if (!request) {
      throw new Error(`"${capability.id}" needs a connected MyChart account; none was passed.`);
    }
    if (needsPatientAssertion(capability)) {
      await assertProxyReadContext(request, optStr(args, 'patient'));
    }
    result = await capability.run(request, args, ctx);
  }
  if (!capability.processor) return result;
  return renderOutput(capability.processor, result as RawResponse, readOutputMode(args));
}

/** Whether this capability accepts {@link MODE_PARAM} — i.e. it has a processor. */
export function acceptsModeParam(capability: Capability): boolean {
  return getCapabilityImpl(capability.id)?.processor !== undefined;
}

/** Whether this capability accepts {@link PATIENT_PARAM} on top of its own. */
export function acceptsPatientParam(capability: Capability): boolean {
  return needsPatientAssertion(capability);
}

/** One `name(param, param) — description` line per capability, for prompts and help. */
export function describeCapability(capability: Capability): string {
  const params = capability.params.map((p) => (p.required ? p.name : `${p.name}?`)).join(', ');
  return `${capability.id}(${params}) — ${capability.description}`;
}
