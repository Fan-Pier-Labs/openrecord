import * as cheerio from 'cheerio';

import { MyChartRequest } from './myChartRequest';
import { getMyChartProfile } from './profile';
import { logger } from '../../shared/logger';

export type ProxyTarget = {
  id: string;
  displayName: string;
  isSelf: boolean;
  isSelected: boolean;
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

function absoluteUrl(mychartRequest: MyChartRequest, value: string): string {
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return new URL(value, `${mychartRequest.protocol}://${mychartRequest.hostname}`).href;
}

function normalizeLinkUrl(mychartRequest: MyChartRequest, value: string, id: string, isSelf: boolean): string {
  if (value && value !== '#') {
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    return value.startsWith('/') ? value : `/${mychartRequest.firstPathPart}/${value}`;
  }
  if (isSelf) {
    return `/${mychartRequest.firstPathPart}/inside.asp?mode=self`;
  }
  return `/${mychartRequest.firstPathPart}/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${encodeURIComponent(id)}`;
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
      linkUrl: normalizeLinkUrl(mychartRequest, href, id, isSelf),
      source: 'home-html',
    });
  });

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

  for (let i = 0; i < 5; i += 1) {
    if (![301, 302].includes(resp.status)) break;
    const location = resp.headers.get('Location');
    debugLog('redirect location=', location || null);
    if (!location) break;
    currentUrl = new URL(location, currentUrl).href;
    resp = await mychartRequest.makeRequest({ url: currentUrl, followRedirects: false });
    debugLog(`redirect follow url=${currentUrl} status=${resp.status}`);
  }

  const finalHome = await mychartRequest.makeRequest({ path: '/Home', followRedirects: false });
  debugLog(`final home url=${finalHome.url} status=${finalHome.status}`);
}

function resolveTarget(targets: ProxyTarget[], target: { id?: string; displayName?: string }): ProxyTarget {
  if (target.id) {
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
}>;
export async function verifyActiveProxyTarget(
  mychartRequest: MyChartRequest,
  options?: { proxyTargets?: ProxyTarget[] }
): Promise<{
  profileName: string | null;
  profileDob: string | null;
  proxyTargets: ProxyTarget[];
  selectedTarget: ProxyTarget | null;
}> {
  const [profile, proxyTargets] = await Promise.all([
    getMyChartProfile(mychartRequest),
    options?.proxyTargets ? Promise.resolve(options.proxyTargets) : discoverProxyTargets(mychartRequest),
  ]);

  const selectedTarget = proxyTargets.find((entry) => entry.isSelected) || null;
  const result = {
    profileName: profile?.name || null,
    profileDob: profile?.dob || null,
    proxyTargets,
    selectedTarget,
  };

  debugLog(`verified profile name=${result.profileName ?? 'null'} dob=${result.profileDob ?? 'null'}`);
  debugLog(`selected target after verification=${selectedTarget ? `${selectedTarget.displayName}${selectedTarget.isSelected ? '*' : ''}` : 'null'}`);
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
    const explicitSelfById = !!target.id && target.id === resolved.id;
    const explicitSelfByName = !!target.displayName && normalize(target.displayName) === normalize(resolved.displayName);
    if (!explicitSelfById && !explicitSelfByName) {
      throw new Error('Refusing to switch to self without an explicit self target request.');
    }
  }

  await followProxySwitchChain(mychartRequest, resolved.linkUrl);
  const refreshedTargets = await discoverProxyTargets(mychartRequest);
  const verified = await verifyActiveProxyTarget(mychartRequest, { proxyTargets: refreshedTargets });
  const selected = verified.selectedTarget;

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
