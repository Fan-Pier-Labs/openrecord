import * as cheerio from 'cheerio';

import { MyChartRequest } from './myChartRequest';
import { getMyChartProfile } from './profile';
import { logger } from '../../shared/logger';

export type ProxyTarget = {
  /**
   * Epic's identifier for the patient record. The account holder's own record
   * ("self") is identified by the **empty string**, not by a missing value —
   * that is what MyChart puts in `Id` for the self entry. Callers wanting to
   * switch back to the account holder pass `{ id: '' }`.
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
    const isSelf = href.includes('mode=self') || (!id && /access your record/i.test(link.attr('aria-label') || ''));

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
    const isSelf = !id;
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

async function loadHomeHtml(mychartRequest: MyChartRequest): Promise<string> {
  const resp = await mychartRequest.makeRequest({ path: '/Home' });
  return await resp.text();
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

function resolveTarget(targets: ProxyTarget[], target: { id?: string; displayName?: string }): ProxyTarget {
  // `id` must be checked for presence, not truthiness: the account holder's own
  // record has the empty-string id, and switching back to it is the single most
  // common thing a caller does after switching away.
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

  throw new Error('Proxy target must include id or displayName.');
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

export async function discoverProxyTargets(mychartRequest: MyChartRequest): Promise<ProxyTarget[]> {
  try {
    const resp = await mychartRequest.makeRequest({
      path: `/ProxySwitch?noCache=${Math.random()}`,
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (resp.ok) {
      const json = await resp.json() as ProxySwitchResponse;
      const targets = parseProxyTargetsFromJson(mychartRequest, json);
      if (targets.length > 0) {
        debugLog(`discovered targets source=proxy-switch-json count=${targets.length} [${summarizeTargets(targets)}]`);
        return targets;
      }
    }
  } catch (error) {
    debugLog('proxy-switch-json discovery failed', error instanceof Error ? error.message : String(error));
  }

  const html = await loadHomeHtml(mychartRequest);
  const targets = parseProxyTargetsFromHomeHtml(mychartRequest, html);
  debugLog(`discovered targets source=home-html count=${targets.length} [${summarizeTargets(targets)}]`);
  return targets;
}

export async function verifyActiveProxyTarget(
  mychartRequest: MyChartRequest,
  options?: { proxyTargets?: ProxyTarget[] }
): Promise<{
  profileName: string | null;
  profileDob: string | null;
  proxyTargets: ProxyTarget[];
  selectedTarget: ProxyTarget | null;
  /** False when discovery could not tell which record is active at all. */
  selectionKnown: boolean;
}> {
  const [profile, proxyTargets] = await Promise.all([
    getMyChartProfile(mychartRequest),
    options?.proxyTargets ? Promise.resolve(options.proxyTargets) : discoverProxyTargets(mychartRequest),
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

export async function switchProxyTarget(
  mychartRequest: MyChartRequest,
  target: { id?: string; displayName?: string },
  options?: { discoveredTargets?: ProxyTarget[] }
): Promise<{ target: ProxyTarget; verifiedProfileName: string | null; verifiedDob: string | null }> {
  const discovered = options?.discoveredTargets ?? await discoverProxyTargets(mychartRequest);
  if (discovered.length === 0) {
    throw new Error('No proxy targets were discovered for this session.');
  }

  const resolved = resolveTarget(discovered, target);
  debugLog('chosen target=', resolved);

  if (resolved.isSelf) {
    const explicitSelfById = target.id !== undefined && target.id === resolved.id;
    const explicitSelfByName = !!target.displayName && normalize(target.displayName) === normalize(resolved.displayName);
    if (!explicitSelfById && !explicitSelfByName) {
      throw new Error('Refusing to switch to self without an explicit self target request.');
    }
  }

  await followProxySwitchChain(mychartRequest, resolved.linkUrl);
  const refreshedTargets = await discoverProxyTargets(mychartRequest);
  const verified = await verifyActiveProxyTarget(mychartRequest, { proxyTargets: refreshedTargets });
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

  if (verified.selectionKnown) {
    const confirmed = resolved.isSelf ? !!selected?.isSelf : !!selected && selected.id === resolved.id;
    if (!confirmed) {
      throw new Error('Proxy target switch could not be confirmed after redirect chain.');
    }
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
  return {
    target: { ...refreshed, isSelected: true },
    verifiedProfileName: verified.profileName,
    verifiedDob: verified.profileDob,
  };
}
