/**
 * Client-facing proxy (multi-patient) helpers shared by the Claude Desktop
 * extension and the mobile app.
 *
 * Both clients expose the same two agent tools — `list_proxy_targets` and
 * `switch_proxy_target` — and gate every other data tool behind
 * `assertProxyReadContext`. The semantics deliberately mirror the CLI's
 * conservative stance (see `npm-package/cli/cli.ts`): reads assert which
 * patient they are about and refuse on a mismatch; only an explicit switch
 * changes MyChart's server-side active patient.
 *
 * The error messages name the agent tools (`switch_proxy_target`,
 * `list_proxy_targets`) so a model that hits a refusal knows exactly which
 * call fixes it. Both clients register the tools under those names.
 */

import { type MyChartRequest } from './myChartRequest';
import {
  checkProxyContext,
  compareProfileNames,
  discoverProxyTargets,
  findProxyTarget,
  switchProxyTarget,
  verifyActiveProxyTarget,
  type ProxyTarget,
  type ProxyContextCheck,
} from './proxyContext';

export type PatientRecordSummary = {
  /** Opaque organization-specific record id. Never parse or construct one. */
  id: string;
  name: string;
  is_self: boolean;
  /** null when the portal does not report which record is active. */
  is_active: boolean | null;
};

export type ListProxyTargetsResult = {
  count: number;
  patients: PatientRecordSummary[];
  /** Display name of the record data tools currently read, when known. */
  active_patient: string | null;
  /** Name on the profile page right now — independent evidence of the above. */
  profile_name: string | null;
  message: string;
};

export type SwitchProxyTargetResult = {
  switched_to: string;
  is_self: boolean;
  verified_profile_name: string | null;
  verified_dob: string | null;
  message: string;
};

/**
 * One proxy discovery per session, shared by every guarded call.
 *
 * Keyed on the request object itself: a re-login (keepalive reconnect, process
 * restart restoring cookies from disk) constructs a fresh MyChartRequest, so
 * stale knowledge about the active patient can never outlive the session it
 * was learned from. Storing the promise rather than the result lets a burst of
 * parallel reads (the mobile app fires its 16 memory categories at once) share
 * a single discovery instead of racing 16 of them.
 */
const discoveryCache = new WeakMap<MyChartRequest, Promise<ProxyTarget[]>>();

function cachedDiscovery(mychartRequest: MyChartRequest): Promise<ProxyTarget[]> {
  let pending = discoveryCache.get(mychartRequest);
  if (!pending) {
    pending = discoverProxyTargets(mychartRequest);
    discoveryCache.set(mychartRequest, pending);
    // A failed discovery must not poison the session — drop it so the next
    // call retries instead of rejecting forever.
    pending.catch(() => discoveryCache.delete(mychartRequest));
  }
  return pending;
}

/**
 * List every patient record the account can reach and which one is active.
 * Read-only. Also primes the discovery cache for subsequent guarded reads.
 */
export async function runListProxyTargets(mychartRequest: MyChartRequest): Promise<ListProxyTargetsResult> {
  const targets = await discoverProxyTargets(mychartRequest);
  discoveryCache.set(mychartRequest, Promise.resolve(targets));

  if (targets.length === 0) {
    return {
      count: 0,
      patients: [],
      active_patient: null,
      profile_name: null,
      message:
        'This account has access to only its own record — there are no family-member (proxy) records to switch between.',
    };
  }

  const verified = await verifyActiveProxyTarget(mychartRequest, { proxyTargets: targets });

  // Prefer the portal's own selection flag; where the discovery surface does
  // not carry one (the script-block fallback), fall back to matching the
  // profile page against exactly one known record.
  let active = verified.selectedTarget;
  if (!active && verified.profileName) {
    const byName = targets.filter(
      (target) => compareProfileNames(target.displayName, verified.profileName!) === 'match',
    );
    if (byName.length === 1) active = byName[0]!;
  }

  return {
    count: targets.length,
    patients: targets.map((target) => ({
      id: target.id,
      name: target.displayName,
      is_self: target.isSelf,
      is_active: target.selectionKnown ? target.isSelected : null,
    })),
    active_patient: active ? active.displayName : null,
    profile_name: verified.profileName,
    message: [
      active
        ? `Data tools on this account currently read ${active.displayName}'s record.`
        : 'This MyChart instance does not report which record is active (is_active: null).',
      // Some instances list the account holder's own record even when there
      // is nothing to switch to — a single-entry list is still "no proxy access".
      targets.length === 1
        ? 'No other patient records are accessible from this account.'
        : 'To read a different patient, call switch_proxy_target with their name — data tools never switch on their own.',
    ].join(' '),
  };
}

/**
 * Deliberately switch MyChart's server-side active patient. The one mutation
 * in this module; verified against the profile page by the underlying
 * `switchProxyTarget`, so landing on the wrong patient fails instead of
 * silently returning the wrong chart.
 */
export async function runSwitchProxyTarget(
  mychartRequest: MyChartRequest,
  patient: string,
): Promise<SwitchProxyTargetResult> {
  if (!patient || !patient.trim()) {
    throw new Error(
      'Pass the patient to switch to — a name from list_proxy_targets, or "me" for the account holder\'s own record.',
    );
  }

  const targets = await discoverProxyTargets(mychartRequest);
  if (targets.length === 0) {
    throw new Error('This account has access to only its own record — there is nothing to switch.');
  }

  const wanted = findProxyTarget(targets, patient);
  const result = await switchProxyTarget(
    mychartRequest,
    wanted.isSelf ? { self: true } : { id: wanted.id },
    { discoveredTargets: targets },
  );

  // The cached discovery now reports a stale selection — rediscover lazily.
  discoveryCache.delete(mychartRequest);

  return {
    switched_to: result.target.displayName,
    is_self: result.target.isSelf,
    verified_profile_name: result.verifiedProfileName,
    verified_dob: result.verifiedDob,
    message:
      `Every data tool on this account now reads ${result.target.displayName}'s record` +
      `${result.target.isSelf ? " (the account holder's own chart)" : ''}.` +
      `${result.target.isSelf ? '' : ' Switch back with patient: "me" when done.'}`,
  };
}

/**
 * Assert that MyChart is on the patient a read (or write) is about, WITHOUT
 * changing anything.
 *
 * No `patient` means the account holder — explicitly, not "whoever the session
 * happens to be pointed at" — because sessions are resumed from cached cookies
 * and would otherwise inherit whichever patient an earlier invocation left
 * behind. On a mismatch this throws with the exact switch_proxy_target call
 * that fixes it; it never switches on its own.
 *
 * Failure handling mirrors the CLI: when a specific patient was asked for,
 * any inability to verify is a refusal; when nobody asked, a discovery or
 * parsing miss must not break an ordinary read that has nothing to do with
 * proxy access (most accounts have none, and two of the three discovery
 * surfaces are inferred rather than captured from a real instance).
 */
export async function assertProxyReadContext(
  mychartRequest: MyChartRequest,
  patient?: string,
): Promise<void> {
  const wantedQuery = patient?.trim() ? patient.trim() : undefined;

  let check: ProxyContextCheck;
  try {
    const targets = await cachedDiscovery(mychartRequest);
    check = await checkProxyContext(mychartRequest, wantedQuery, { discoveredTargets: targets });
  } catch (err) {
    if (wantedQuery) {
      throw new Error(`Could not verify which patient record is active: ${(err as Error).message}`);
    }
    return;
  }

  // Single-record account: no proxy surface, nothing to assert.
  if (!check.wanted) {
    if (wantedQuery) {
      throw new Error(
        'This account has access to only one patient record, so `patient` cannot be used. ' +
          "Omit it to read the account holder's own record.",
      );
    }
    return;
  }

  if (check.active) return;

  const currentName = check.current
    ? `'${check.current.displayName}'`
    : 'an unknown patient (this MyChart instance does not report which record is active)';
  throw new Error(
    `Refusing to read: MyChart is currently on ${currentName}, but this call is about ` +
      `'${check.wanted.displayName}'. The active patient is server-side MyChart state and reading never ` +
      `changes it. Call switch_proxy_target with patient: ${JSON.stringify(check.wanted.displayName)} to ` +
      'switch deliberately, then retry. list_proxy_targets shows every record this account can access.',
  );
}
