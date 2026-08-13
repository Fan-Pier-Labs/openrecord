import * as cheerio from 'cheerio';

import { MyChartRequest } from './myChartRequest';
import { makeAuthenticatedRequest, SessionExpiredError, type AuthenticatedRequestOptions } from './makeAuthenticatedRequest';
import { getMyChartProfile } from './profile';
import { logger } from '../../shared/logger';

export type ProxyTarget = {
  /**
   * Epic's identifier for the patient record: a long opaque `WP-…` string,
   * different on every organization and meaningless outside the session that
   * produced it. Never parse or construct one.
   *
   * The account holder's own record carries a real id like any other — it is
   * **not** blank. Identify it with `isSelf`, never by inspecting the id.
   * (Confirmed on UCSF, Renown and Carson Tahoe; see PR #206.)
   */
  id: string;
  displayName: string;
  isSelf: boolean;
  isSelected: boolean;
  /**
   * Whether `isSelected` actually came from the portal, or is just a default.
   * The `EpicPx.ReactContext.personalizations.proxySubjects` script block does
   * not carry a selection flag, so targets recovered from it report
   * `selectionKnown: false` and `isSelected: false`. Consumers must not read
   * `isSelected === false` as "this record is not active" unless
   * `selectionKnown` is true.
   */
  selectionKnown: boolean;
  linkUrl: string;
  source: 'proxy-switch-json' | 'home-html';
};

type ProxySwitchSubject = {
  Id?: string;
  DisplayName?: string;
  LinkUrl?: string;
  IsSelected?: boolean;
  IsSelf?: boolean;
};

type ProxySwitchResponse = {
  ProxySubjectList?: ProxySwitchSubject[];
};

/**
 * How to name the record you want. Exactly one of these is needed.
 *
 * Prefer `self: true` over an id when returning to the account holder — proxy
 * ids are opaque and organization-specific, and the portal's own `IsSelf` flag
 * is the only portable way to name that record.
 */
export type ProxyTargetSelector = {
  /** The account holder's own record, whatever its id happens to be. */
  self?: boolean;
  /** An opaque id from `discoverProxyTargets`. */
  id?: string;
  /** Display name; rejected if more than one record shares it. */
  displayName?: string;
};

/** Max redirects to follow before giving up on a proxy-switch chain. */
const MAX_SWITCH_REDIRECTS = 5;

/**
 * Display names some instances use for the account holder's own entry instead
 * of the person's actual name. These can't be compared against the scraped
 * profile name, so identity verification treats them as "no opinion".
 */
const GENERIC_SELF_LABELS = new Set(['me', 'myself', 'you', 'self', 'my record', 'my chart']);

/** Name suffixes that carry no identity signal. */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'md', 'do', 'phd']);

function isDebugEnabled(): boolean {
  return process.env.MYCHART_DEBUG_PROXY_CONTEXT === '1';
}

function debugLog(message: string, details?: unknown): void {
  if (!isDebugEnabled()) return;
  if (details === undefined) {
    logger.debug(`[proxy-context] ${message}`);
    return;
  }
  logger.debug(`[proxy-context] ${message}`, details);
}

function summarizeTargets(targets: ProxyTarget[]): string {
  return targets
    .map((target) => `${target.displayName}${target.isSelected ? '*' : ''}${target.isSelf ? ' (self)' : ''}`)
    .join(', ');
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The deployment prefix, ready to concatenate. Root-mounted instances have no
 * prefix at all (`firstPathPart` is null), so they get the empty string rather
 * than a literal `/null`.
 */
function mountPath(mychartRequest: MyChartRequest): string {
  return mychartRequest.firstPathPart ? `/${mychartRequest.firstPathPart}` : '';
}

function absoluteUrl(mychartRequest: MyChartRequest, value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return new URL(value, `${mychartRequest.protocol}://${mychartRequest.hostname}`).href;
}

function normalizeLinkUrl(mychartRequest: MyChartRequest, value: string, id: string, isSelf: boolean): string {
  if (value && value !== '#') {
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    return value.startsWith('/') ? value : `${mountPath(mychartRequest)}/${value}`;
  }
  if (isSelf) {
    return `${mountPath(mychartRequest)}/inside.asp?mode=self`;
  }
  return `${mountPath(mychartRequest)}/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${encodeURIComponent(id)}`;
}

function dedupeTargets(targets: ProxyTarget[]): ProxyTarget[] {
  const seen = new Set<string>();
  const deduped: ProxyTarget[] = [];

  for (const target of targets) {
    const key = `${target.id}::${target.displayName}::${target.isSelf}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(target);
  }

  return deduped;
}

function parseProxyTargetsFromJson(mychartRequest: MyChartRequest, json: ProxySwitchResponse): ProxyTarget[] {
  return dedupeTargets(
    (json.ProxySubjectList || [])
      .map((entry) => ({
        id: entry.Id || '',
        displayName: entry.DisplayName || '',
        isSelf: !!entry.IsSelf,
        isSelected: !!entry.IsSelected,
        selectionKnown: true,
        linkUrl: normalizeLinkUrl(mychartRequest, entry.LinkUrl || '', entry.Id || '', !!entry.IsSelf),
        source: 'proxy-switch-json' as const,
      }))
      .filter((entry) => entry.displayName)
  );
}

function parseProxyTargetsFromHomeHtml(mychartRequest: MyChartRequest, html: string): ProxyTarget[] {
  const $ = cheerio.load(html);
  const targets: ProxyTarget[] = [];

  $('.proxySubjectLink').each((_, el) => {
    const link = $(el);
    const displayName = link.find('.proxySelectorDropDownNameEllipsis').first().text().trim();
    const id = (link.attr('data-id') || '').trim();
    const href = link.attr('href') || '';
    const isSelected = link.hasClass('currentContext');
    // Self is NOT "the one without an id" — the account holder's record has a
    // real id too. What distinguishes it is that its link does not carry the
    // switch-context query, which is the one thing the confirmed `/ProxySwitch`
    // payload tells us about link shape: proxies get `mode=proxyswitch&…&eid=`,
    // self gets a bare page URL.
    const looksLikeProxySwitch = /mode=proxyswitch|[?&]eid=/i.test(href);
    const isSelf = href.includes('mode=self')
      || /access your record/i.test(link.attr('aria-label') || '')
      || (!!href && !looksLikeProxySwitch);

    if (!displayName) return;
    targets.push({
      id,
      displayName,
      isSelf,
      isSelected,
      // The anchor markup marks the active record with `currentContext`, so the
      // absence of that class is a real "not selected", not a missing signal.
      selectionKnown: true,
      linkUrl: normalizeLinkUrl(mychartRequest, href, id, isSelf),
      source: 'home-html',
    });
  });

  // Last-resort fallback: the React personalization payload. It lists the
  // records but says nothing about which one is active, hence selectionKnown.
  const scriptRegex = /EpicPx\.ReactContext\.personalizations\.proxySubjects\.push\((\{[\s\S]*?\})\);/g;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const block = match[1];
    const displayName = block.match(/displayName:"([^"]+)"/)?.[1] || '';
    const id = block.match(/\{type:"INTERNAL",value:"([^"]+)"\}/)?.[1] || '';
    if (!displayName) continue;
    // Prefer an explicit self flag (`isSelf:!0` once minified). Falling back to
    // "has no id" is a last resort and is known to be wrong wherever the
    // account holder carries a real id, which is every instance measured so far.
    const selfFlag = /\bisSelf:\s*(!0|true)/.test(block);
    const isSelf = selfFlag || !id;
    targets.push({
      id,
      displayName,
      isSelf,
      isSelected: false,
      selectionKnown: false,
      linkUrl: normalizeLinkUrl(mychartRequest, '', id, isSelf),
      source: 'home-html',
    });
  }

  return dedupeTargets(targets);
}

async function loadHomeHtml(mychartRequest: MyChartRequest, options?: AuthenticatedRequestOptions): Promise<string> {
  const resp = await makeAuthenticatedRequest(mychartRequest, { path: '/Home' }, options);
  return resp.text();
}

async function followProxySwitchChain(mychartRequest: MyChartRequest, startPathOrUrl: string): Promise<void> {
  let currentUrl = absoluteUrl(mychartRequest, startPathOrUrl);
  let resp = await mychartRequest.makeRequest({ url: currentUrl, followRedirects: false });
  debugLog(`switch url=${currentUrl} status=${resp.status}`);

  let hops = 0;
  while ([301, 302].includes(resp.status)) {
    if (hops >= MAX_SWITCH_REDIRECTS) {
      // Bailing out quietly here used to leave the caller to fail later with
      // the confusing "could not be confirmed" error. Say what went wrong.
      throw new Error(
        `Proxy switch redirect chain exceeded ${MAX_SWITCH_REDIRECTS} hops (last url ${currentUrl}).`
      );
    }
    const location = resp.headers.get('Location');
    debugLog('redirect location=', location || null);
    if (!location) break;
    currentUrl = new URL(location, currentUrl).href;
    resp = await mychartRequest.makeRequest({ url: currentUrl, followRedirects: false });
    hops += 1;
    debugLog(`redirect follow url=${currentUrl} status=${resp.status}`);
  }

  const finalHome = await mychartRequest.makeRequest({ path: '/Home', followRedirects: false });
  debugLog(`final home url=${finalHome.url} status=${finalHome.status}`);
}

function resolveTarget(targets: ProxyTarget[], target: ProxyTargetSelector): ProxyTarget {
  // Returning to the account holder is the most common thing a caller does
  // after switching away, and it must not depend on knowing an opaque
  // organization-specific id. `isSelf` is the portal's own marker for it.
  //
  // `id: ''` is accepted as a spelling of the same request: no observed
  // instance issues a blank id, so it cannot collide with a real record, and on
  // any instance that did use blank-for-self it resolves to the same entry.
  if (target.self === true || target.id === '') {
    const matches = targets.filter((entry) => entry.isSelf);
    if (matches.length !== 1) {
      throw new Error(
        `Could not resolve the account holder's own record: ${matches.length} of ${targets.length} ` +
        `discovered records are flagged as self.`
      );
    }
    return matches[0];
  }

  if (target.id !== undefined) {
    const matches = targets.filter((entry) => entry.id === target.id);
    if (matches.length !== 1) {
      throw new Error(`Could not resolve proxy target by id '${target.id}'.`);
    }
    return matches[0];
  }

  if (target.displayName) {
    const wanted = normalize(target.displayName);
    const matches = targets.filter((entry) => normalize(entry.displayName) === wanted);
    if (matches.length === 0) {
      throw new Error(`Could not resolve proxy target by displayName '${target.displayName}'.`);
    }
    if (matches.length > 1) {
      throw new Error(`Ambiguous proxy target displayName '${target.displayName}'.`);
    }
    return matches[0];
  }

  throw new Error('Proxy target must include self, id or displayName.');
}

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NAME_SUFFIXES.has(token));
}

/** "Bart" vs "Bartholomew": a short form of the same given name. */
function isShortFormOf(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 3 && longer.startsWith(shorter);
}

/**
 * Compare the profile name scraped after a switch against the display name of
 * the record we asked for.
 *
 * Deliberately three-valued. MyChart's proxy list and its profile page do not
 * agree on how a name is written — the list says "Bart Simpson" where the
 * profile says "Bartholomew JoJo Simpson" — so a two-valued match/mismatch
 * would reject perfectly good switches. `unknown` is the honest answer whenever
 * the two names share a surname but not a recognizable given name: that is
 * either a nickname or a sibling, and this function cannot tell which. The
 * caller disambiguates by checking the profile against the *other* known
 * records (see `switchProxyTarget`).
 *
 * `mismatch` is reserved for names with nothing in common, which is what
 * landing on an unrelated patient actually looks like.
 */
export function compareProfileNames(expected: string, actual: string): 'match' | 'mismatch' | 'unknown' {
  if (!expected || !actual) return 'unknown';
  if (GENERIC_SELF_LABELS.has(normalize(expected)) || GENERIC_SELF_LABELS.has(normalize(actual))) {
    return 'unknown';
  }

  const a = nameTokens(expected);
  const b = nameTokens(actual);
  if (a.length === 0 || b.length === 0) return 'unknown';

  const setA = new Set(a);
  const setB = new Set(b);
  // Dropped middle names: "Homer Simpson" vs "Homer Jay Simpson".
  if (a.every((token) => setB.has(token)) || b.every((token) => setA.has(token))) return 'match';

  const surnameShared = a[a.length - 1] === b[b.length - 1];
  if (surnameShared && isShortFormOf(a[0], b[0])) return 'match';

  // Reordered renderings ("Simpson, Homer Jay").
  const shared = a.filter((token) => setB.has(token));
  if (shared.length >= 2) return 'match';

  // Same surname, unfamiliar given name — a nickname we don't know how to
  // expand, or a family member. Not enough to condemn the switch on its own.
  if (surnameShared) return 'unknown';

  return 'mismatch';
}

export async function discoverProxyTargets(
  mychartRequest: MyChartRequest,
  options?: AuthenticatedRequestOptions,
): Promise<ProxyTarget[]> {
  try {
    const resp = await makeAuthenticatedRequest(mychartRequest, {
      path: `/ProxySwitch?noCache=${Math.random()}`,
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }, options);

    if (resp.ok) {
      const json = await resp.json() as ProxySwitchResponse;
      const targets = parseProxyTargetsFromJson(mychartRequest, json);
      if (targets.length > 0) {
        debugLog(`discovered targets source=proxy-switch-json count=${targets.length} [${summarizeTargets(targets)}]`);
        return targets;
      }
    }
  } catch (error) {
    // An unrenewable expired session is a real answer, not a reason to fall
    // through to the HTML surface — that would just attempt a second re-login
    // and then parse a login page into "no proxy targets".
    if (error instanceof SessionExpiredError) throw error;
    debugLog('proxy-switch-json discovery failed', error instanceof Error ? error.message : String(error));
  }

  const html = await loadHomeHtml(mychartRequest, options);
  const targets = parseProxyTargetsFromHomeHtml(mychartRequest, html);
  debugLog(`discovered targets source=home-html count=${targets.length} [${summarizeTargets(targets)}]`);
  return targets;
}

export async function verifyActiveProxyTarget(
  mychartRequest: MyChartRequest,
  options?: { proxyTargets?: ProxyTarget[] } & AuthenticatedRequestOptions
): Promise<{
  profileName: string | null;
  profileDob: string | null;
  proxyTargets: ProxyTarget[];
  selectedTarget: ProxyTarget | null;
  /** False when discovery could not tell which record is active at all. */
  selectionKnown: boolean;
}> {
  const renewOptions = { autoRenew: options?.autoRenew };
  const [profile, proxyTargets] = await Promise.all([
    getMyChartProfile(mychartRequest, renewOptions),
    options?.proxyTargets ? Promise.resolve(options.proxyTargets) : discoverProxyTargets(mychartRequest, renewOptions),
  ]);

  const selectionKnown = proxyTargets.some((entry) => entry.selectionKnown);
  const selectedTarget = proxyTargets.find((entry) => entry.selectionKnown && entry.isSelected) || null;
  const result = {
    profileName: profile?.name || null,
    profileDob: profile?.dob || null,
    proxyTargets,
    selectedTarget,
    selectionKnown,
  };

  debugLog(`verified profile name=${result.profileName ?? 'null'} dob=${result.profileDob ?? 'null'}`);
  debugLog(`selected target after verification=${selectedTarget ? `${selectedTarget.displayName}${selectedTarget.isSelected ? '*' : ''}` : 'null'} selectionKnown=${selectionKnown}`);
  return result;
}

/** Strings a human might type to mean "the account holder's own record". */
const SELF_QUERIES = new Set(['self', 'me', 'myself', 'my record', 'account holder']);

/**
 * Resolve a human-supplied string to exactly one record.
 *
 * Accepts, in order of precedence: a self alias ("me", "self"), an exact id, an
 * exact display name, or a unique case-insensitive partial name. Ambiguity is
 * always an error listing the candidates — guessing which patient was meant is
 * precisely the failure this codebase must never produce.
 */
export function findProxyTarget(targets: ProxyTarget[], query: string): ProxyTarget {
  const wanted = normalize(query);
  if (!wanted) throw new Error('Patient query is empty.');

  const describe = () => targets.map((t) => `'${t.displayName}'${t.isSelf ? ' (you)' : ''}`).join(', ');

  if (SELF_QUERIES.has(wanted)) {
    const selves = targets.filter((entry) => entry.isSelf);
    if (selves.length === 1) return selves[0];
    // Only one record is reachable at all, so it IS the account holder —
    // whether or not the portal bothered to flag it. This matters because the
    // HTML and script discovery surfaces are inferred rather than captured: a
    // single-record account whose markup we misparse must not get locked out
    // of a tool that has nothing to do with proxy access.
    if (targets.length === 1) return targets[0];
    throw new Error(`Could not identify the account holder's own record among: ${describe()}.`);
  }

  // Ids are opaque and exact — check them before any name matching so a record
  // can always be named unambiguously even if display names collide.
  const byId = targets.filter((entry) => entry.id === query.trim());
  if (byId.length === 1) return byId[0];

  const exact = targets.filter((entry) => normalize(entry.displayName) === wanted);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(`'${query}' matches more than one patient record. Use --patient with the record id instead.`);
  }

  const partial = targets.filter((entry) => normalize(entry.displayName).includes(wanted));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(
      `'${query}' matches ${partial.length} patient records (${partial.map((t) => `'${t.displayName}'`).join(', ')}). Be more specific.`
    );
  }

  throw new Error(`No patient record matches '${query}'. Available: ${describe()}.`);
}

export type ProxyContextCheck = {
  /** Every record this account can reach. Empty for single-record accounts. */
  targets: ProxyTarget[];
  /** The record the caller asked for. Null when the account has no proxy access. */
  wanted: ProxyTarget | null;
  /** The record the portal is actually on, as best we can determine. */
  current: ProxyTarget | null;
  /** True when the portal is already on `wanted`. */
  active: boolean;
  /**
   * How `current` was established: the portal's own selection flag, or by
   * matching the scraped profile name when the portal doesn't report one.
   * 'unknown' means neither worked and `active` must not be trusted.
   */
  determinedBy: 'selection-flag' | 'profile-name' | 'unknown';
};

/**
 * Report whether the portal is already on a given patient, WITHOUT changing
 * anything.
 *
 * This is the read-only counterpart to `switchProxyTarget`, for callers that
 * want to verify before acting rather than mutate a session as a side effect of
 * reading. Passing no query asks about the account holder.
 *
 * Where the portal reports a selection, that's used. Where it doesn't — the
 * script-block discovery surface never does — the active record is inferred by
 * comparing the scraped profile against each known record, which is stronger
 * evidence than a flag anyway.
 */
export async function checkProxyContext(
  mychartRequest: MyChartRequest,
  query?: string,
  options?: { discoveredTargets?: ProxyTarget[] } & AuthenticatedRequestOptions
): Promise<ProxyContextCheck> {
  const renewOptions = { autoRenew: options?.autoRenew };
  const targets = options?.discoveredTargets ?? await discoverProxyTargets(mychartRequest, renewOptions);
  if (targets.length === 0) {
    return { targets, wanted: null, current: null, active: true, determinedBy: 'unknown' };
  }

  const wanted = findProxyTarget(targets, query ?? 'me');

  const flagged = targets.find((entry) => entry.selectionKnown && entry.isSelected);
  if (flagged) {
    return {
      targets,
      wanted,
      current: flagged,
      active: flagged.id === wanted.id,
      determinedBy: 'selection-flag',
    };
  }

  // No selection flag: ask the profile page who we are.
  const profile = await getMyChartProfile(mychartRequest, renewOptions);
  const profileName = profile?.name || '';
  const byName = profileName
    ? targets.filter((entry) => compareProfileNames(entry.displayName, profileName) === 'match')
    : [];

  if (byName.length === 1) {
    return {
      targets,
      wanted,
      current: byName[0],
      active: byName[0].id === wanted.id,
      determinedBy: 'profile-name',
    };
  }

  return { targets, wanted, current: null, active: false, determinedBy: 'unknown' };
}

/**
 * Run `fn` with the portal pointed at `target`.
 *
 * MyChart has no per-request patient parameter — the active record is
 * server-side session state, reached only by following a switch URL. That makes
 * "which patient am I reading?" invisible at the call site and, because
 * sessions are resumed from cached cookies, it can persist across processes.
 * This wrapper puts the target back at the call site: state the patient you
 * mean, every time, and let the switching be an implementation detail.
 *
 * Passing no target means the account holder — explicitly, not "whoever the
 * session happens to be pointed at". The switch is skipped when the portal
 * already reports the wanted record as active, so the common case costs one
 * discovery request rather than a full switch.
 *
 * Accounts with no proxy access have no proxy surface at all; there `fn` simply
 * runs.
 */
/**
 * Record which patient record this session is on, and arm the restore hook
 * session renewal uses to put it back after a silent re-login. Set together
 * on purpose: renewal fails closed if it ever finds a recorded non-self
 * target without a restore hook (see sessionRenewal.ts). The hook re-runs the
 * verified switch with autoRenew: false, so it can only ever fail, never
 * re-enter renewal.
 */
function recordActiveTarget(
  mychartRequest: MyChartRequest,
  resolved: Pick<ProxyTarget, 'id' | 'isSelf' | 'displayName'>,
): void {
  mychartRequest.activeProxyTarget = {
    id: resolved.id,
    isSelf: resolved.isSelf,
    displayName: resolved.displayName,
  };
  mychartRequest.restoreProxyContext = async () => {
    await switchProxyTarget(
      mychartRequest,
      resolved.isSelf ? { self: true } : { id: resolved.id },
      { autoRenew: false },
    );
  };
}

export async function withProxyTarget<T>(
  mychartRequest: MyChartRequest,
  target: ProxyTargetSelector | string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const discovered = await discoverProxyTargets(mychartRequest);

  if (discovered.length === 0) {
    if (typeof target === 'string' || (target && (target.id !== undefined || target.displayName))) {
      throw new Error('This account has access to only one patient record, so a patient cannot be selected.');
    }
    return fn();
  }

  const resolved = typeof target === 'string'
    ? findProxyTarget(discovered, target)
    : resolveTarget(discovered, target ?? { self: true });

  // Already there — don't pay for a redirect chain we don't need. Still record
  // the intent: if the session expires inside fn(), automatic renewal must
  // know which record to restore even though no switch happened on this call.
  if (resolved.selectionKnown && resolved.isSelected) {
    recordActiveTarget(mychartRequest, resolved);
  } else {
    await switchProxyTarget(
      mychartRequest,
      resolved.isSelf ? { self: true } : { id: resolved.id },
      { discoveredTargets: discovered }
    );
  }

  return fn();
}

export async function switchProxyTarget(
  mychartRequest: MyChartRequest,
  target: ProxyTargetSelector,
  options?: { discoveredTargets?: ProxyTarget[] } & AuthenticatedRequestOptions
): Promise<{ target: ProxyTarget; verifiedProfileName: string | null; verifiedDob: string | null }> {
  const renewOptions = { autoRenew: options?.autoRenew };
  const discovered = options?.discoveredTargets ?? await discoverProxyTargets(mychartRequest, renewOptions);
  if (discovered.length === 0) {
    throw new Error('No proxy targets were discovered for this session.');
  }

  const resolved = resolveTarget(discovered, target);
  debugLog('chosen target=', resolved);

  if (resolved.isSelf) {
    const explicitSelf = target.self === true
      || (target.id !== undefined && (target.id === '' || target.id === resolved.id))
      || (!!target.displayName && normalize(target.displayName) === normalize(resolved.displayName));
    if (!explicitSelf) {
      throw new Error('Refusing to switch to self without an explicit self target request.');
    }
  }

  await followProxySwitchChain(mychartRequest, resolved.linkUrl);
  const refreshedTargets = await discoverProxyTargets(mychartRequest, renewOptions);
  const verified = await verifyActiveProxyTarget(mychartRequest, { proxyTargets: refreshedTargets, autoRenew: options?.autoRenew });
  const selected = verified.selectedTarget;

  // Compare the patient the portal is now showing us against the one we asked
  // for. Never trust `IsSelected` alone — scraping the wrong patient's chart is
  // the worst failure mode this app has.
  const identity = compareProfileNames(resolved.displayName, verified.profileName || '');

  // The sharpest signal available: the profile we landed on matches a
  // *different* record in the list. That is a switch that went to the wrong
  // patient — most often a sibling, whom a surname comparison alone would wave
  // through — and it is never acceptable.
  if (identity !== 'match' && verified.profileName) {
    const impostor = refreshedTargets.find((entry) =>
      entry.id !== resolved.id && compareProfileNames(entry.displayName, verified.profileName!) === 'match');
    if (impostor) {
      throw new Error(
        `Proxy switch landed on the wrong patient: asked for '${resolved.displayName}', ` +
        `portal is showing '${verified.profileName}' (${impostor.displayName}).`
      );
    }
  }

  if (identity === 'mismatch') {
    throw new Error(
      `Proxy switch landed on the wrong patient: asked for '${resolved.displayName}', ` +
      `portal reports '${verified.profileName}'.`
    );
  }

  // Remember which record this session is now on. Automatic session renewal
  // (sessionRenewal.ts) reads this to restore the context after a re-login,
  // which resets MyChart to the account holder server-side.
  const recordSwitch = () => recordActiveTarget(mychartRequest, resolved);

  if (verified.selectionKnown) {
    const confirmed = resolved.isSelf ? !!selected?.isSelf : !!selected && selected.id === resolved.id;
    if (!confirmed) {
      throw new Error('Proxy target switch could not be confirmed after redirect chain.');
    }
    recordSwitch();
    return {
      target: selected!,
      verifiedProfileName: verified.profileName,
      verifiedDob: verified.profileDob,
    };
  }

  // Discovery could not report a selection flag (the script-block fallback).
  // The profile name is then the only evidence available, so require it.
  if (identity !== 'match') {
    throw new Error(
      `Proxy target switch could not be confirmed: the portal does not report which record is active, ` +
      `and the profile name ('${verified.profileName ?? 'unknown'}') could not be matched against ` +
      `'${resolved.displayName}'.`
    );
  }

  const refreshed = refreshedTargets.find((entry) => entry.id === resolved.id) ?? resolved;
  recordSwitch();
  return {
    target: { ...refreshed, isSelected: true },
    verifiedProfileName: verified.profileName,
    verifiedDob: verified.profileDob,
  };
}
