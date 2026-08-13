import { MyChartRequest } from "./myChartRequest";
import * as cheerio from 'cheerio';

import fs from 'fs';
import { getRequestVerificationTokenFromBody } from "./util";
import { changeDirToPackageRoot } from "../../shared/util";
import { sendTelemetryEvent } from "../../shared/telemetry";
import { acceptTermsAndConditions } from "./termsAndConditions";
import { isBlockedInstance } from "./blockedInstances";
import { createAssertion, type PasskeyCredential } from "./softwareAuthenticator";
import { logger } from '../../shared/logger';


// Just for testing / local development
// reads local creds from disk
function readTestCredentials_TEST_ONLY() {
  return JSON.parse(fs.readFileSync('creds.json', 'utf-8'))
}


// MyChart's login route. When a root redirect lands on it, everything in front
// of it is the deployment prefix — and for root-mounted instances that's nothing.
const MYCHART_LOGIN_ROUTE = '/authentication/';

/**
 * Where a MyChart deployment actually lives: the host serving it, and the
 * prefix its routes sit under (null for a root-mounted instance).
 *
 * The host is part of it because portals move. `patients.mycslink.org` redirects
 * to `mycslink.cedars-sinai.org/mycslink`, `login.wellspan.org` to
 * `my.wellspan.org/mywellspan` — the hostname a user hands us is often a
 * vanity alias for a deployment that lives somewhere else entirely.
 */
export type MountLocation = { hostname: string; firstPathPart: string | null };

/** How many hops to follow before deciding a redirect chain is a loop. */
const MAX_DISCOVERY_HOPS = 10;

/** Does this redirect path land on a MyChart route we recognize? */
export function landsOnMyChartRoute(path: string): boolean {
  return path.toLowerCase().includes(MYCHART_LOGIN_ROUTE);
}

/**
 * The deployment prefix carried by a path, whatever announced it.
 *
 *   /MyChart/                   → 'MyChart'      (uhhospitals.org and most others)
 *   /UCSFMyChart/               → 'UCSFMyChart'
 *   /Authentication/Login       → null           (Cleveland Clinic — no prefix)
 *   /prd/Authentication/Login   → 'prd'
 *
 * null means "no prefix": nothing at all goes in front of MyChart's routes.
 */
export function firstPathPartFromPathname(pathname: string): string | null {
  const routeStart = pathname.toLowerCase().indexOf(MYCHART_LOGIN_ROUTE);
  // Path went straight to a MyChart route — take whatever precedes it.
  if (routeStart >= 0) return pathname.slice(1, routeStart) || null;
  return pathname.split('/')[1] || null;
}

/**
 * Where a root page's `<meta http-equiv="refresh">` points, or null if there
 * isn't one we can use.
 *
 *   0; URL=/MyChart/                              → https://<host>/MyChart/
 *   1 ;url=https://mychart.renown.org/mychart     → as written (Renown)
 *
 * The target may be relative or absolute, so it goes through `new URL` rather
 * than string surgery — stripping every `/` out of an absolute URL folds the
 * host into the prefix (`https:mychart.renown.orgmychart`).
 *
 * Pass `hostname` to reject targets pointing at another host, the same way the
 * Location-header path does: a marketing page's path is not a MyChart prefix.
 *
 * Pass `baseUrl` when the page came from somewhere other than the bare host —
 * a relative `url=DefaultAsp` partway down a redirect chain resolves against
 * the page carrying it, not against `/`.
 */
export function parseMetaRefreshTarget(html: string, hostname?: string, baseUrl?: string): URL | null {
  const $ = cheerio.load(html);
  const content = $('meta[http-equiv="REFRESH"]').attr('content');
  if (!content) return null;

  // content is `<seconds>; url=<target>`. Split on the first `=` only — the target
  // can carry its own query string (`?id=…`).
  const afterDelay = content.split(';').slice(1).join(';');
  const equals = afterDelay.indexOf('=');
  if (equals < 0) return null;

  const target = afterDelay.slice(equals + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!target) return null;

  // A placeholder base resolves relative targets; absolute ones ignore it.
  let url: URL;
  try {
    url = new URL(target, baseUrl ?? `https://${hostname || 'mychart.invalid'}`);
  } catch {
    return null;
  }

  if (hostname && url.host !== hostname) {
    logger.debug('Meta refresh points off-host:', hostname, '->', url.host);
    return null;
  }

  return url;
}

/**
 * Work out the deployment prefix from a `<meta http-equiv="refresh">` on the root page.
 *
 *   0; URL=/MyChart/                              → 'MyChart'
 *   1 ;url=https://mychart.renown.org/mychart     → 'mychart'   (Renown — absolute URL)
 *   0; URL=/Authentication/Login                  → null        (root-mounted)
 *
 * null is ambiguous here — it means either "root-mounted" or "no usable refresh
 * tag". Callers that need to tell those apart use `parseMetaRefreshTarget` and
 * check `landsOnMyChartRoute` on the result.
 */
export function parseFirstPathPartFromHtml(html: string, hostname?: string): string | null {
  const target = parseMetaRefreshTarget(html, hostname);
  return target ? firstPathPartFromPathname(target.pathname) : null;
}

/**
 * Work out the deployment prefix from the redirect a root probe returns. See
 * `firstPathPartFromPathname` for what the shapes map to; null means "no
 * prefix": nothing at all goes in front of MyChart's routes.
 */
export function parseFirstPathPartFromLocation(locationHeader: string, hostname: string, protocol = 'https'): string | null {
  const { pathname } = new URL(locationHeader, protocol + '://' + hostname);
  return firstPathPartFromPathname(pathname);
}

export function parseFirstPathPartFromInput(input: string): string | null {
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    const part = parsed.pathname.split('/').filter(Boolean)[0];
    if (!part || !part.toLowerCase().includes('mychart')) {
      return null;
    }
    return part;
  } catch {
    return null;
  }
}

export function looksLikeLoginPage(html: string): boolean {
  const bodyLower = html.toLowerCase();
  return bodyLower.includes('__requestverificationtoken')
    || bodyLower.includes('login with passkey')
    || bodyLower.includes('forgot login information')
    || bodyLower.includes('error: please enable cookies to log in')
    || bodyLower.includes('secondaryvalidationcontroller')
    || bodyLower.includes('mychart® licensed from epic');
}

/**
 * Whether an HTML body is the login page an EXPIRED session gets bounced to.
 *
 * Deliberately much stricter than `looksLikeLoginPage`: that one answers "could
 * this be a MyChart login page?" during mount discovery, where matching an
 * authenticated page costs nothing. Here a false positive would declare a live
 * session dead and trigger a re-login, so only markers that never appear on
 * post-login pages count — `__RequestVerificationToken` is on every page and
 * the Epic license line is in every footer, which is exactly why the loose
 * check can't be reused for expiry detection.
 */
export function looksLikeSignedOutPage(html: string): boolean {
  const bodyLower = html.toLowerCase();
  return bodyLower.includes('isprelogin')          // <body class="… isPrelogin">
    || bodyLower.includes('login with passkey')     // real instances
    || bodyLower.includes('sign in with passkey')
    || bodyLower.includes('forgot login information')
    || bodyLower.includes('loginpagecontroller')    // the login page's own JS
    || bodyLower.includes('authentication/login/dologin'); // the login form action
}

/**
 * Where a root page's `window.location = "…"` points, or null if there isn't one.
 *
 * A handful of instances (mydovetale.ca) announce the mount from a script tag
 * instead of a meta refresh:
 *
 *   <script>window.location="https://mydovetale.ca/MyDovetale/";</script>
 *
 * The target is resolved against `baseUrl` and returned as-is — whether a
 * target on another host is worth following is the caller's decision.
 */
export function parseScriptRedirectTarget(html: string, baseUrl: string): URL | null {
  // window.location = "…" / window.location.href = '…' / location.replace("…")
  const match = html.match(/\b(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i)
    ?? html.match(/\b(?:window\.)?location\.(?:replace|assign)\s*\(\s*["']([^"']+)["']\s*\)/i);
  if (!match) return null;
  try {
    return new URL(match[1], baseUrl);
  } catch {
    return null;
  }
}

/**
 * Every MyChart mount a page links to, most-linked first.
 *
 * Landing pages come in two flavours and both are covered here:
 *
 *   - an affiliate chooser that links straight at the route
 *     (`https://mychart.example.org/prd/Authentication/Login`), and
 *   - a hospital marketing homepage that links at the mount
 *     (`https://mychart.example.org/MyChart/`).
 *
 * Ranking, in order: links that name the login route, then links on the host we
 * were asked about, then paths that read like a MyChart mount, then how often
 * the page refers to them. Nothing here is trusted on sight — the caller checks
 * each candidate for a login page — so the ordering only decides how quickly we
 * get to the right one, which is why a bare `/NorthMemorial/` stays in the
 * running even though it names neither the route nor MyChart.
 */
export function extractMountsFromLinks(html: string, preferHostname?: string): MountLocation[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, MountLocation & { hits: number; namesRoute: boolean; namesMyChart: boolean }>();

  const urls: string[] = [];
  $('a[href], link[href], area[href]').each((_i, el) => { const v = $(el).attr('href'); if (v) urls.push(v); });
  $('script[src], img[src], iframe[src], form[action]').each((_i, el) => {
    const v = $(el).attr('src') ?? $(el).attr('action'); if (v) urls.push(v);
  });
  // Absolute URLs sitting in inline script/JSON that cheerio's selectors miss.
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>()]+/g)) urls.push(m[0]);

  for (const raw of urls) {
    let url: URL;
    try { url = new URL(raw, `https://${preferHostname || 'mychart.invalid'}`); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;

    const namesRoute = landsOnMyChartRoute(url.pathname);
    const prefix = firstPathPartFromPathname(url.pathname);
    const namesMyChart = !!prefix && /mychart|chart|portal|prd/i.test(prefix);
    const trimmed = url.pathname.replace(/\/$/, '');
    const segments = trimmed.split('/').filter(Boolean).length;

    // `/Authentication/Login` on the bare host is a root mount; anything else
    // with no prefix at all carries no information.
    if (!namesRoute && !prefix) continue;
    // A deep path is only interesting when its first segment already reads as a
    // mount (`/MyChart/Scripts/…` on a marketing page). Otherwise it's the
    // site's own content: `/patients-and-visitors/find-a-doctor.html`.
    if (!namesRoute && !namesMyChart && segments > 1) continue;
    // Files aren't mounts — keeps `/style.css` and `/logo.png` out of it.
    if (!namesRoute && !namesMyChart && /\.[a-z0-9]{2,5}$/i.test(trimmed)) continue;

    const key = `${url.host}|${(prefix ?? '').toLowerCase()}`;
    const existing = candidates.get(key);
    if (existing) {
      existing.hits++;
      existing.namesRoute ||= namesRoute;
    } else {
      candidates.set(key, { hostname: url.host, firstPathPart: prefix, hits: 1, namesRoute, namesMyChart });
    }
  }

  return [...candidates.values()]
    .sort((a, b) =>
      Number(b.namesRoute) - Number(a.namesRoute)
      || Number(b.hostname === preferHostname) - Number(a.hostname === preferHostname)
      || Number(b.namesMyChart) - Number(a.namesMyChart)
      || b.hits - a.hits)
    .map(({ hostname, firstPathPart }) => ({ hostname, firstPathPart }));
}

const COMMON_FIRST_PATH_PART_CANDIDATES = ['MyChart', 'MyChart-PRD', 'MyChartPRD'];

export async function probeFirstPathPartByTryingCommonLoginPaths(mychartRequest: MyChartRequest): Promise<string | null> {
  for (const candidate of COMMON_FIRST_PATH_PART_CANDIDATES) {
    const candidateUrl = `${mychartRequest.protocol}://${mychartRequest.hostname}/${candidate}/Authentication/Login`;
    try {
      const resp = await mychartRequest.makeRequest({ url: candidateUrl });
      const finalUrl = new URL(resp.url || candidateUrl, candidateUrl);
      const html = await resp.text();

      if (finalUrl.host !== mychartRequest.hostname) {
        logger.debug(`Skipping ${candidate} probe: redirected off-host to ${finalUrl.host}`);
        continue;
      }

      if (resp.status >= 400) {
        continue;
      }

      const finalPathPart = finalUrl.pathname.split('/').filter(Boolean)[0];
      if ((finalPathPart && finalPathPart.toLowerCase() === candidate.toLowerCase()) && looksLikeLoginPage(html)) {
        logger.debug('Recovered firstPathPart by probing common login path:', finalPathPart || candidate);
        return finalPathPart || candidate;
      }
    } catch (error) {
      logger.debug(`Failed ${candidate} probe:`, error);
    }
  }

  return null;
}

/**
 * Does this URL serve a MyChart login page? Used to sanity-check a mount we
 * only guessed at — a link on a landing page, or a host a redirect handed us.
 */
export async function verifyMount(mychartRequest: MyChartRequest, mount: MountLocation): Promise<boolean> {
  const url = `${mychartRequest.protocol}://${mount.hostname}${mount.firstPathPart ? '/' + mount.firstPathPart : ''}/Authentication/Login`;
  try {
    const resp = await mychartRequest.makeRequest({ url });
    if (resp.status >= 400) {
      logger.debug('mount check failed:', url, resp.status);
      return false;
    }
    const ok = looksLikeLoginPage(await resp.text());
    logger.debug('mount check', ok ? 'passed:' : 'failed (not a login page):', url);
    return ok;
  } catch (e) {
    logger.debug('mount check errored:', url, e);
    return false;
  }
}

function mountFromUrl(url: URL): MountLocation {
  return { hostname: url.host, firstPathPart: firstPathPartFromPathname(url.pathname) };
}

/**
 * Walk the redirect chain from the root the way a browser would, and stop the
 * moment it lands on a MyChart route.
 *
 * Following the whole chain rather than just the first hop is what makes this
 * reliable. The canonical MyChart bounce is three hops, and only the last one
 * names the mount:
 *
 *   /                        302 → /MyChart/
 *   /MyChart/                302 → DefaultAsp          ← relative, no leading slash
 *   /MyChart/DefaultAsp      302 → /MyChart/Authentication/Login?
 *
 * Reading one hop is enough for the instances that redirect straight to
 * `/MyChart/`, but a root-mounted instance's first hop is the bare
 * `DefaultAsp` — which, read as a prefix, is nonsense. So we keep going, and
 * whatever precedes `/Authentication/` at the end of the chain is the answer.
 *
 * The chain is also allowed to leave the host: portals get consolidated, and a
 * vanity hostname redirecting to the deployment that now serves it is the norm,
 * not an anomaly. Whether to trust the new host is the caller's call.
 *
 * Returns the mount if the chain found one, plus the last page fetched so the
 * caller can mine a landing page for links when it didn't.
 */
export async function followChainToMyChartRoute(
  mychartRequest: MyChartRequest,
  startUrl: string,
): Promise<{ mount: MountLocation | null; finalUrl: string; html: string | null }> {
  let url = startUrl;
  let html: string | null = null;
  const seen = new Set<string>();

  for (let hop = 0; hop < MAX_DISCOVERY_HOPS; hop++) {
    if (seen.has(url)) {
      logger.debug('discovery: redirect loop back to', url);
      break;
    }
    seen.add(url);

    let response: Response;
    try {
      response = await mychartRequest.makeRequest({ followRedirects: false, url });
    } catch (e) {
      logger.debug('discovery: request failed', url, e);
      break;
    }

    // Some runtimes (iOS) ignore redirect:'manual' and follow the chain
    // themselves, in which case the response URL is already the end of it.
    const followedTo = !response.headers.get('Location') && response.url && response.url !== url
      ? response.url
      : null;
    const next = response.headers.get('Location') ?? followedTo;

    if (next) {
      let resolved: URL;
      try {
        resolved = new URL(next, url);
      } catch {
        logger.debug('discovery: uninterpretable redirect target', next);
        break;
      }
      logger.debug('discovery:', response.status, url, '->', resolved.href);
      if (landsOnMyChartRoute(resolved.pathname)) {
        return { mount: mountFromUrl(resolved), finalUrl: resolved.href, html: null };
      }
      url = resolved.href;
      continue;
    }

    html = await response.text().catch(() => '');
    logger.debug('discovery:', response.status, url, `(${html.length} bytes, no redirect)`);

    // Landed on the login page itself: this URL *is* the mount, and its own
    // `<meta refresh>` points at nojs.asp — following that would lose it.
    if (response.status < 400 && looksLikeLoginPage(html)) {
      return { mount: mountFromUrl(new URL(url)), finalUrl: url, html };
    }

    // Not a redirect at the HTTP level, but the page may still announce the
    // mount: a meta refresh (Renown) or a scripted window.location (Dovetale).
    const target = parseMetaRefreshTarget(html, undefined, url) ?? parseScriptRedirectTarget(html, url);
    if (!target) break;

    logger.debug('discovery: body redirect', url, '->', target.href);
    if (landsOnMyChartRoute(target.pathname)) {
      return { mount: mountFromUrl(target), finalUrl: target.href, html };
    }
    url = target.href;
  }

  return { mount: null, finalUrl: url, html };
}

/**
 * Pin a discovered mount onto the request, moving hosts if that's where the
 * deployment turned out to live.
 *
 * A host move is only ever accepted on the strength of a login page actually
 * being served there (`verified`) — the host we end up on is the one that gets
 * sent the user's password. The scheme is not up for grabs either: only the
 * host is taken from the chain, so a session that started on https stays there
 * even if some hop along the way was plain http.
 */
function applyMount(mychartRequest: MyChartRequest, mount: MountLocation, verified: boolean): boolean {
  if (mount.hostname !== mychartRequest.hostname) {
    if (!verified) return false;
    logger.debug('MyChart moved hosts:', mychartRequest.hostname, '->', mount.hostname);
    mychartRequest.setHostname(mount.hostname);
  }
  logger.debug('MyChart mount:', mychartRequest.hostname, mount.firstPathPart
    ? `is prefixed with ${mount.firstPathPart}`
    : 'is mounted at the domain root');
  mychartRequest.setFirstPathPart(mount.firstPathPart);
  return true;
}

export async function determineFirstPathPart(mychartRequest: MyChartRequest): Promise<MyChartRequest | null> {

  if (mychartRequest.firstPathPart) {
    logger.debug('first path part already determined', mychartRequest.firstPathPart)
    return mychartRequest;
  }

  const startedOnHostname = mychartRequest.hostname;
  const root = mychartRequest.protocol + '://' + mychartRequest.hostname;
  const { mount, html } = await followChainToMyChartRoute(mychartRequest, root);

  if (mount) {
    // A chain that stayed put proved the prefix by landing on it. One that
    // moved hosts has to prove the new host serves MyChart before we trust it.
    const sameHost = mount.hostname === startedOnHostname;
    if (applyMount(mychartRequest, mount, sameHost || await verifyMount(mychartRequest, mount))) {
      return mychartRequest;
    }
  }

  // The chain ran out on a page that isn't MyChart — an affiliate chooser, a
  // hospital homepage, an SSO stop. Those pages nearly always link at the real
  // mount, so read it off them rather than guessing.
  if (html) {
    for (const candidate of extractMountsFromLinks(html, startedOnHostname).slice(0, 5)) {
      logger.debug('trying mount linked from the landing page:', candidate.hostname, candidate.firstPathPart);
      if (await verifyMount(mychartRequest, candidate) && applyMount(mychartRequest, candidate, true)) {
        return mychartRequest;
      }
    }
  }

  const probed = await probeFirstPathPartByTryingCommonLoginPaths(mychartRequest);
  if (probed) {
    mychartRequest.setFirstPathPart(probed);
    return mychartRequest;
  }

  logger.debug('Could not work out where MyChart is mounted on', mychartRequest.hostname);
  return mychartRequest;
}

export type TwoFaDeliveryInfo = {
  method: 'email' | 'sms';
  contact?: string; // masked contact, e.g. "***-***-7204" or "ry***@gmail.com"
}

export type LoginResult = {
  state: 'logged_in' | 'need_2fa' | 'invalid_login' | 'error'
  error?: string
  mychartRequest: MyChartRequest;

  // only set if need2fa is true
  twoFaSentTime?: number;
  twoFaDelivery?: TwoFaDeliveryInfo;

}

/**
 * Parse the secondary validation (2FA) page to detect which delivery methods are available.
 * Real MyChart pages show buttons like "Email to me" or "Text to my phone".
 * Returns which methods are available and any masked contact info found near the buttons.
 */
export function parse2faDeliveryMethods(html: string): {
  hasEmail: boolean;
  hasSms: boolean;
  emailContact?: string;
  smsContact?: string;
} {
  const $ = cheerio.load(html);
  let hasEmail = false;
  let hasSms = false;
  let emailContact: string | undefined;
  let smsContact: string | undefined;

  // Look at all buttons and links on the page for delivery method indicators
  $('button, a, [role="button"]').each((_, el) => {
    const text = $(el).text().toLowerCase().trim();
    if (text.includes('email')) {
      hasEmail = true;
      // Try to extract masked email from button text or nearby elements
      const fullText = $(el).text().trim();
      const emailMatch = fullText.match(/[\w*]+\*+[\w*]*@[\w.]+/);
      if (emailMatch) emailContact = emailMatch[0];
    }
    if (text.includes('text') || text.includes('phone') || text.includes('sms')) {
      hasSms = true;
      // Try to extract masked phone from button text or nearby elements
      const fullText = $(el).text().trim();
      const phoneMatch = fullText.match(/[\d*][\d*-]+[\d*]/);
      if (phoneMatch) smsContact = phoneMatch[0];
    }
  });

  // Also look in paragraph/span text near the buttons for masked contact info
  $('p, span, div').each((_, el) => {
    const text = $(el).text();
    if (!emailContact) {
      const emailMatch = text.match(/[\w*]+\*+[\w*]*@[\w.]+/);
      if (emailMatch) emailContact = emailMatch[0];
    }
    if (!smsContact) {
      const phoneMatch = text.match(/\*{2,}[\d*-]*\d{4}/);
      if (phoneMatch) smsContact = phoneMatch[0];
    }
  });

  return { hasEmail, hasSms, emailContact, smsContact };
}

// takes in the user + pass
// and returns 1 of two things:
// 1. login success and were golden
// 2. we need 2fa code to complete login process
// Note that this flow will trigger the 2fa code to be sent to the user's email
// if were going the 2fa flow
/**
 * The hidden bookkeeping fields MyChart's login form posts back alongside the
 * credentials. They are page-load telemetry, not secrets, but an instance that
 * renders them expects them echoed — so they're read off the page rather than
 * invented, with the defaults MyChart's own JS uses when a field is absent.
 */
export function parseLoginPageFields(html: string) {
  const $ = cheerio.load(html);
  return {
    navRequestMetrics: $('input[name="__NavigationRequestMetrics"]').attr('value') || '',
    navRedirectMetrics: $('input[name="__NavigationRedirectMetrics"]').attr('value') || '[]',
    redirectChainIncludesLogin: $('input[name="__RedirectChainIncludesLogin"]').attr('value') || '0',
    currentPageLoadDescriptor: $('input[name="__CurrentPageLoadDescriptor"]').attr('value') || '',
    rttCaptureEnabled: $('input[name="__RttCaptureEnabled"]').attr('value') || '1',
  };
}

/** The name MyChart's login controller JS gives the username credential. */
export function usernameFieldFromControllerJs(js: string): 'LoginIdentifier' | 'Username' {
  const credMatch = js.match(/Credentials:\s*\{([^}]{0,300})\}/);
  if (credMatch && credMatch[1].includes('Username') && !credMatch[1].includes('LoginIdentifier')) {
    return 'Username';
  }
  return 'LoginIdentifier';
}

/**
 * Whether this instance calls the username credential `LoginIdentifier` (the
 * newer name) or `Username`, read out of the login controller JS the page
 * references. Falls back to the newer name when the script can't be fetched.
 */
export async function detectUsernameField(mychartRequest: MyChartRequest, loginPageHtml: string): Promise<'LoginIdentifier' | 'Username'> {
  const $ = cheerio.load(loginPageHtml);
  const loginControllerSrc = $('script[src*="loginpagecontroller"]').attr('src');
  if (!loginControllerSrc) return 'LoginIdentifier';

  try {
    const jsUrl = loginControllerSrc.startsWith('http')
      ? loginControllerSrc
      // mychartRequest.hostname, not the raw hostname the caller passed: that
      // one may still carry the scheme and path the user typed, and discovery
      // may since have moved the session to the host that serves MyChart.
      : mychartRequest.protocol + '://' + mychartRequest.hostname + loginControllerSrc;
    const jsResp = await mychartRequest.makeRequest({ url: jsUrl });
    const usernameField = usernameFieldFromControllerJs(await jsResp.text());
    logger.debug('Detected credential field:', usernameField);
    return usernameField;
  } catch (e) {
    logger.debug('Could not detect credential field, defaulting to LoginIdentifier', e);
    return 'LoginIdentifier';
  }
}

export async function myChartUserPassLogin ({hostname, user, pass, skipSendCode, protocol}: {hostname: string, user: string, pass: string, skipSendCode?: boolean, protocol?: string}): Promise<LoginResult> {
  // Fire-and-forget telemetry — never blocks or breaks the scraper
  sendTelemetryEvent('scraper_login_started', { hostname }, 'scraper');

  if (!hostname || !user || !pass) {
    // Which one is missing, never the values: the sink is whatever the host
    // wired up, and a plaintext password belongs in none of them.
    logger.debug('missing hostname, user, or pass', {
      hostname: hostname || '(missing)',
      user: user ? '(present)' : '(missing)',
      pass: pass ? '(present)' : '(missing)',
    })
    throw new Error('Missing hostname, user, or pass')
  }

  if (isBlockedInstance(hostname)) {
    throw new Error(`${hostname} is not supported. central.mychart.org is a portal aggregator and cannot be scraped directly. Please use the individual hospital MyChart instance instead.`);
  }


  // Use HTTP for localhost and hostnames without a dot (e.g. Docker service names like "fake-mychart:3000")
  const hostnameWithoutPort = hostname.split(':')[0];
  const effectiveProtocol = protocol ?? (hostnameWithoutPort === 'localhost' || !hostnameWithoutPort.includes('.') ? 'http' : 'https');
  const mychartRequest = new MyChartRequest(hostname, { protocol: effectiveProtocol });
  const firstPathPartFromInput = parseFirstPathPartFromInput(hostname);
  if (firstPathPartFromInput) {
    logger.debug('Using firstPathPart from user input:', firstPathPartFromInput);
    mychartRequest.setFirstPathPart(firstPathPartFromInput);
  }

  const foundMyChartFirstPathPart = await determineFirstPathPart(mychartRequest)

  if (!foundMyChartFirstPathPart) {
    logger.debug('could not determine first path part')
    return {state: 'error', error: 'could not determine first path part', mychartRequest}
  }


  // await mychartRequest.loadCookies('cookies.json');

  // The homepage has a __RequestVerificationToken that we need to extract.
  // Also get the cookies in the jar as well
  const firstRequst = await mychartRequest.makeRequest({path: '/Authentication/Login'})

  const loginPageHtml = await firstRequst.text()

  let requestVerificationToken = getRequestVerificationTokenFromBody(loginPageHtml)

  const { navRequestMetrics, navRedirectMetrics, redirectChainIncludesLogin, currentPageLoadDescriptor, rttCaptureEnabled } =
    parseLoginPageFields(loginPageHtml);

  const usernameField = await detectUsernameField(mychartRequest, loginPageHtml);

  // b64EncodeUnicode handles unicode chars properly (matching WP.Utils.b64EncodeUnicode from MyChart JS)
  const b64EncodeUnicode = (str: string) => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));

  const LoginInfo = encodeURIComponent(JSON.stringify({
    "Type": "StandardLogin",
    "Credentials": {
      [usernameField]: b64EncodeUnicode(user),
      "Password": b64EncodeUnicode(pass)
    }}
  ))

  const loginBody = "__RequestVerificationToken=" + requestVerificationToken
    + "&DeviceId=&postLoginUrl=&LoginInfo=" + LoginInfo
    + "&__NavigationRequestMetrics=" + encodeURIComponent(navRequestMetrics)
    + "&__NavigationRedirectMetrics=" + encodeURIComponent(navRedirectMetrics)
    + "&__RedirectChainIncludesLogin=" + redirectChainIncludesLogin
    + "&__CurrentPageLoadDescriptor=" + encodeURIComponent(currentPageLoadDescriptor)
    + "&__RttCaptureEnabled=" + rttCaptureEnabled;

  const res = await mychartRequest.makeRequest({
    path: "/Authentication/Login/DoLogin",
    "headers": {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    "body": loginBody,
    "method": "POST",
  });

  const secondaryAuthPage = await res.text()
  const responseUrl = res.url || '';

  logger.debug(`[login] DoLogin response: status=${res.status} url=${responseUrl}`);
  logger.debug(`[login] Page checks: has_secondaryvalidationcontroller=${secondaryAuthPage.includes('secondaryvalidationcontroller')} has_md_home_index=${secondaryAuthPage.toLowerCase().includes('md_home_index')} has_termsconditions=${responseUrl.toLowerCase().includes('termsconditions')}`);

  // If the user is required to set up 2fa but hasn't set up 2fa yet, there may be a message stating that they have to set up 2fa.

  // Check for login failure first (can appear in URL or body)
  const bodyLower = secondaryAuthPage.toLocaleLowerCase();
  const urlLower = responseUrl.toLocaleLowerCase();
  if (bodyLower.includes('login failed') || bodyLower.includes('login unsuccessful') || urlLower.includes('loginfailed')) {
    logger.debug('Login failed with username ', user, hostname)
    return {
      state: 'invalid_login',
      error: 'Username or password is incorrect',
      mychartRequest
    }
  }

  // If we need to do 2fa (check both body content and response URL):
  if (secondaryAuthPage.includes('secondaryvalidationcontroller') || urlLower.includes('secondaryvalidation')) {

    requestVerificationToken = getRequestVerificationTokenFromBody(secondaryAuthPage)
    if (!requestVerificationToken) {
      logger.debug('could not find request verification token on the 2FA page')
      return {state: 'error', error: 'could not find request verification token', mychartRequest}
    }

    const codeSendTimeBefore = Date.now()

    // Detect which 2FA delivery methods are available on the page
    const deliveryMethods = parse2faDeliveryMethods(secondaryAuthPage);
    logger.debug('2FA delivery methods:', JSON.stringify(deliveryMethods));

    let twoFaDelivery: TwoFaDeliveryInfo | undefined;

    // When using TOTP, we skip SendCode — the code is generated locally.
    if (!skipSendCode) {
      // I don't think we need to do this, but just in case
      await mychartRequest.makeRequest({path: '/Authentication/SecondaryValidation/GetSMSConsentStrings?noCache=' + Math.random()})

      // Determine delivery method:
      // - Both detected → use email (deliveryMethodEmail=true)
      // - Only one detected → use that one
      // - Neither detected (JS-rendered page) → try all three param formats
      //
      // MyChart instances use different SendCode parameter names:
      //   - deliveryMethodEmail=true  (send via email)
      //   - deliveryMethodEmail=false (send via SMS on older instances)
      //   - deliveryMethodSMS=true    (send via SMS on newer instances like bilh.org)
      let sentMethod: 'email' | 'sms' | null = null;

      const sendCodeHeaders = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        '__RequestVerificationToken': requestVerificationToken,
      };

      async function trySendCode(body: string, label: string): Promise<boolean> {
        const resp = await mychartRequest.makeRequest({
          path: "/Authentication/SecondaryValidation/SendCode?noCache=" + Math.random(),
          headers: sendCodeHeaders,
          body,
          method: "POST",
        });
        const respBody = await resp.text();
        const success = respBody.includes('"Success":true');
        logger.debug(`[login] SendCode ${label}: status=${resp.status} success=${success}`);
        return success;
      }

      if (deliveryMethods.hasEmail && deliveryMethods.hasSms) {
        logger.debug('[login] Both email and SMS detected, using email');
        if (await trySendCode('deliveryMethodEmail=true&resendCode=false&workflow=1', 'email')) {
          sentMethod = 'email';
        }
      } else if (deliveryMethods.hasEmail) {
        logger.debug('[login] Only email detected, using email');
        if (await trySendCode('deliveryMethodEmail=true&resendCode=false&workflow=1', 'email')) {
          sentMethod = 'email';
        }
      } else if (deliveryMethods.hasSms) {
        logger.debug('[login] Only SMS detected, using SMS');
        if (await trySendCode('deliveryMethodEmail=false&resendCode=false&workflow=1', 'sms-legacy')) {
          sentMethod = 'sms';
        }
      }

      // If nothing detected or detected method failed, try all formats
      if (!sentMethod) {
        logger.debug('[login] Trying all SendCode formats...');
        // Try SMS formats first (more common for text-only instances)
        if (await trySendCode('deliveryMethodSMS=true&resendCode=false&workflow=1', 'sms-new')) {
          sentMethod = 'sms';
        } else if (await trySendCode('deliveryMethodEmail=false&resendCode=false&workflow=1', 'sms-legacy')) {
          sentMethod = 'sms';
        } else if (await trySendCode('deliveryMethodEmail=true&resendCode=false&workflow=1', 'email')) {
          sentMethod = 'email';
        }
      }

      if (!sentMethod) {
        logger.debug('[login] All SendCode attempts failed — could not send 2FA code');
      }

      // Try to extract masked contact info
      let contact: string | undefined;
      if (sentMethod === 'email') {
        contact = deliveryMethods.emailContact;
        twoFaDelivery = { method: 'email', contact };
        logger.debug(`Asked for a 2FA code to be sent to email${contact ? ` (${contact})` : ''}, waiting for email to arrive`);
      } else {
        contact = deliveryMethods.smsContact;
        twoFaDelivery = { method: 'sms', contact };
        logger.debug(`Asked for a 2FA code to be sent via SMS${contact ? ` (${contact})` : ''}`);
      }
    } else {
      logger.debug("Skipping SendCode (using TOTP)")
    }

    return {
      state: 'need_2fa',
      twoFaSentTime: codeSendTimeBefore,
      twoFaDelivery,
      mychartRequest
    }

  }

  // We are logged in!
  if (bodyLower.includes('md_home_index')) {
    return {
      state: 'logged_in',
      mychartRequest
    }
  }

  // Check if we landed on Terms & Conditions page — auto-accept silently
  // Use the response URL to avoid false positives from pages that merely
  // reference "termsconditions" in CSS/JS/footer links.
  if (urlLower.includes('termsconditions') || (bodyLower.includes('terms and conditions') && !urlLower.includes('/home'))) {
    logger.debug('Landed on Terms & Conditions page after login, auto-accepting');
    const accepted = await acceptTermsAndConditions(mychartRequest);
    if (accepted) {
      return {
        state: 'logged_in',
        mychartRequest
      }
    }
    logger.debug('Failed to auto-accept Terms & Conditions');
    return {
      state: 'error',
      error: 'Failed to accept MyChart Terms & Conditions',
      mychartRequest
    }
  }

  logger.debug('i am at some page, i dont know what to do!')
  logger.debug('Response URL:', responseUrl)

  return {
    state: 'error',
    error: 'Login failed: ended up on an unexpected page',
    mychartRequest
  }

}


// We have the 2fa code from the user's email, now we need to complete the login flow and get the remaining cookies
// then we have full access to the user's mychart account.

export type TwoFaResult = {
  state: 'logged_in' | 'invalid_2fa' | 'error'
  mychartRequest: MyChartRequest
}

export async function complete2faFlow({mychartRequest, code, twofaCodeArray, isTOTP}: {mychartRequest: MyChartRequest, code?: string, twofaCodeArray?: {code: string; score: number}[], isTOTP?: boolean}): Promise<TwoFaResult> {

  // Accept either a single code string or an array of scored codes
  const codeArray = twofaCodeArray ?? (code ? [{code, score: 1}] : []);
  const sortedCodes = codeArray.sort((a, b) => b.score - a.score);

  // // To make sure we don't grab an old code from the user's email, we only look for emails that arrived after the above API request was made. 
  // // Also, look up to 5 seconds before the request was made.
  // // And check continously for a code to arrive for up to a minute. 
  // const code = await get2FaCodeFromEmail(codeSendTimeBefore - 1000 * 5, fromEmail!);



  // Make another HTTP call to the secondary auth page to get the request verification token. 
  // This isn't necessary, but is the easiest way if we want to split the before 2fa and after 2fa steps. 
  const res = await mychartRequest.makeRequest({path: "/Authentication/SecondaryValidation"});

  const secondaryAuthPage = await res.text()
  const requestVerificationToken = getRequestVerificationTokenFromBody(secondaryAuthPage)

  if (!requestVerificationToken) { 
    logger.debug('could not find request verification token on the 2FA page')
    return {
      state: 'error',
      mychartRequest
    }
  }


  // The codes themselves are live credentials — log how many arrived, not what they are.
  logger.debug("Got 2fa codes from email:", sortedCodes.length, "candidate(s), scores:", sortedCodes.map(c => c.score))

  let invalidCode = false;

  for (const candidate of sortedCodes) {
    logger.debug('Trying code with score', candidate.score)
    const resp = await mychartRequest.makeRequest({
      path: "/Authentication/SecondaryValidation/Validate?noCache=" + Math.random(),
      "headers": { 
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        '__RequestVerificationToken': requestVerificationToken,
      },
      "body": "TwoFactorCode=" + candidate.code + "&RememberMe=checked&IsPostLogin2FA=false&EnrollDeviceTrackingOnRemember=false&DeviceId=&Workflow=1&isTOTP=" + (isTOTP ? "true" : "false"),
      "method": "POST",
    });

    const respBody = await resp.json()

    if (respBody.Success === true) {
      const insideResp = await mychartRequest.makeRequest({path: '/inside.asp'})
      const insideBody = await insideResp.text();
      const insideBodyLower = insideBody.toLowerCase();

      // Check if we landed on Terms & Conditions page — auto-accept silently
      // Use the response URL (not just body content) to avoid false positives from
      // pages that merely reference "termsconditions" in CSS/JS/footer links.
      const insideUrl = (insideResp.url || '').toLowerCase();
      if (insideUrl.includes('termsconditions') || (insideBodyLower.includes('terms and conditions') && !insideUrl.includes('/home'))) {
        logger.debug('Landed on Terms & Conditions page after 2FA, auto-accepting');
        const accepted = await acceptTermsAndConditions(mychartRequest);
        if (!accepted) {
          logger.debug('Failed to auto-accept Terms & Conditions after 2FA');
          return {
            state: 'error',
            mychartRequest
          };
        }
      }

      return {
        state: 'logged_in',
        mychartRequest
      };

    }

    if (respBody.TwoFactorCodeFailReason === 'codewrong') {
      // wrong code!
      logger.debug('wrong code! score:', candidate.score)
      invalidCode = true;
    }
  }


  if (invalidCode) {
    return {
      state: 'invalid_2fa',
      mychartRequest
    };
  }

  logger.debug('i am at some page after 2fa validation call, i dont know what to do!')
  return {
    state: 'error',
    mychartRequest
  };

}


/**
 * Login to MyChart using a passkey credential.
 * This completely replaces username/password + 2FA with a single WebAuthn assertion.
 *
 * Flow:
 * 1. Get login page + CSRF token (same as password login)
 * 2. POST /Authentication/Login/GetPasskeyGetParams — get WebAuthn challenge
 * 3. Software authenticator signs the challenge
 * 4. POST /Authentication/Login/DoLogin with Type: "PasskeyLogin"
 */
export async function myChartPasskeyLogin({hostname, credential, protocol}: {
  hostname: string,
  credential: PasskeyCredential,
  protocol?: string,
}): Promise<LoginResult> {
  sendTelemetryEvent('scraper_passkey_login_started', { hostname }, 'scraper');

  if (!hostname || !credential) {
    throw new Error('Missing hostname or passkey credential');
  }

  if (isBlockedInstance(hostname)) {
    throw new Error(`${hostname} is not supported.`);
  }

  const hostnameWithoutPort = hostname.split(':')[0];
  const effectiveProtocol = protocol ?? (hostnameWithoutPort === 'localhost' || !hostnameWithoutPort.includes('.') ? 'http' : 'https');
  const mychartRequest = new MyChartRequest(hostname, { protocol: effectiveProtocol });
  const firstPathPartFromInput = parseFirstPathPartFromInput(hostname);
  if (firstPathPartFromInput) {
    logger.debug('Using firstPathPart from user input:', firstPathPartFromInput);
    mychartRequest.setFirstPathPart(firstPathPartFromInput);
  }

  const foundMyChartFirstPathPart = await determineFirstPathPart(mychartRequest);
  if (!foundMyChartFirstPathPart) {
    return { state: 'error', error: 'could not determine first path part', mychartRequest };
  }

  // Get login page + CSRF token
  const loginPageResp = await mychartRequest.makeRequest({ path: '/Authentication/Login' });
  const loginPageHtml = await loginPageResp.text();
  const requestVerificationToken = getRequestVerificationTokenFromBody(loginPageHtml);

  if (!requestVerificationToken) {
    return { state: 'error', error: 'could not find request verification token', mychartRequest };
  }

  // Get passkey challenge
  logger.debug('  Getting passkey challenge...');
  const getParamsResp = await mychartRequest.makeRequest({
    path: '/Authentication/Login/GetPasskeyGetParams?force=true&noCache=' + Math.random(),
    method: 'POST',
    headers: {
      '__RequestVerificationToken': requestVerificationToken,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  if (getParamsResp.status !== 200) {
    logger.debug('  GetPasskeyGetParams failed:', getParamsResp.status);
    return { state: 'error', error: 'Failed to get passkey challenge', mychartRequest };
  }

  const getParamsResult = await getParamsResp.json();
  if (!getParamsResult.Success || !getParamsResult.PasskeyGetParams) {
    logger.debug('  GetPasskeyGetParams unsuccessful. Success:', getParamsResult.Success);
    return { state: 'error', error: 'Passkey login not available on this instance', mychartRequest };
  }

  const passkeyParams = getParamsResult.PasskeyGetParams;
  logger.debug('  Got passkey challenge. RpId:', passkeyParams.RpId || '(default)');

  // Create assertion using software authenticator
  const origin = `${effectiveProtocol}://${mychartRequest.hostname}`;
  const assertion = createAssertion(credential, passkeyParams.Challenge, origin);

  // Extract additional hidden fields from the login page
  const { navRequestMetrics, navRedirectMetrics, redirectChainIncludesLogin, currentPageLoadDescriptor, rttCaptureEnabled } =
    parseLoginPageFields(loginPageHtml);

  // Submit passkey login
  const LoginInfo = encodeURIComponent(JSON.stringify({
    Type: 'PasskeyLogin',
    Credentials: assertion,
  }));

  const loginBody = '__RequestVerificationToken=' + requestVerificationToken
    + '&DeviceId=&postLoginUrl=&LoginInfo=' + LoginInfo
    + '&__NavigationRequestMetrics=' + encodeURIComponent(navRequestMetrics)
    + '&__NavigationRedirectMetrics=' + encodeURIComponent(navRedirectMetrics)
    + '&__RedirectChainIncludesLogin=' + redirectChainIncludesLogin
    + '&__CurrentPageLoadDescriptor=' + encodeURIComponent(currentPageLoadDescriptor)
    + '&__RttCaptureEnabled=' + rttCaptureEnabled;

  logger.debug('  Submitting passkey login...');
  const res = await mychartRequest.makeRequest({
    path: '/Authentication/Login/DoLogin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: loginBody,
    method: 'POST',
  });

  const responseBody = await res.text();
  const responseUrl = res.url || '';
  const bodyLower = responseBody.toLocaleLowerCase();
  const urlLower = responseUrl.toLocaleLowerCase();

  // Check for login failure
  if (bodyLower.includes('login failed') || bodyLower.includes('login unsuccessful') || urlLower.includes('loginfailed')) {
    logger.debug('  Passkey login failed');
    return { state: 'invalid_login', error: 'Passkey authentication failed', mychartRequest };
  }

  // Success — logged in directly (passkey bypasses 2FA)
  if (bodyLower.includes('md_home_index')) {
    logger.debug('  Passkey login successful!');
    return { state: 'logged_in', mychartRequest };
  }

  // Terms & Conditions
  if (urlLower.includes('termsconditions') || (bodyLower.includes('terms and conditions') && !urlLower.includes('/home'))) {
    logger.debug('  Landed on Terms & Conditions page, auto-accepting');
    const accepted = await acceptTermsAndConditions(mychartRequest);
    if (accepted) {
      return { state: 'logged_in', mychartRequest };
    }
    return { state: 'error', error: 'Failed to accept Terms & Conditions', mychartRequest };
  }

  // Unexpected page — might still need 2FA (shouldn't happen with passkey, but handle gracefully)
  if (responseBody.includes('secondaryvalidationcontroller') || urlLower.includes('secondaryvalidation')) {
    logger.debug('  Passkey login still requires 2FA — unexpected');
    return { state: 'need_2fa', mychartRequest };
  }

  logger.debug('  Passkey login ended on unexpected page');
  logger.debug('  Response URL:', responseUrl);
  return { state: 'error', error: 'Passkey login ended on unexpected page', mychartRequest };
}

export async function areCookiesValid(mychartRequest: MyChartRequest): Promise<boolean> {
  const res = await mychartRequest.makeRequest({path: '/Home', followRedirects: false})
  logger.debug("are cookies valid?", res.status === 200, res.headers.get('Location'))
  return res.status === 200
}

async function myChartRawLogin_TEST({hostname, user, pass}: {hostname: string, user: string, pass: string}): Promise<MyChartRequest> {

  const loginResult = await myChartUserPassLogin({hostname, user, pass})

  const mychartRequest = loginResult.mychartRequest;

  if (loginResult.state === 'need_2fa') {
    throw new Error('2FA required — gmail integration has been removed. Use the CLI or web app for 2FA.')
  }

  const cookiesValid = await areCookiesValid(mychartRequest)
  logger.debug('cookies valid?', cookiesValid)

  return mychartRequest;
}


export async function login_TEST(hostname: string): Promise<MyChartRequest> {
  changeDirToPackageRoot()


  let mychartRequest = new MyChartRequest(hostname);
  const firstPathPartFromInput = parseFirstPathPartFromInput(hostname);
  if (firstPathPartFromInput) {
    logger.debug('Using firstPathPart from user input:', firstPathPartFromInput);
    mychartRequest.setFirstPathPart(firstPathPartFromInput);
  }

  const foundMyChartFirstPathPart = await determineFirstPathPart(mychartRequest);

  if (!foundMyChartFirstPathPart) {
    logger.debug('could not determine first path part! exiting early')
    return mychartRequest
  }

  // First, figure out what the path is for the domain. 
  // Most mychart scrapers start at /MyChart, but some like Example Hospital use /MyChart-PRD
  // Fire an API request to determine it
  // mychartRequest.getPathFromDomain(domain);

  await mychartRequest.loadCookies_TEST('cookies.json');

  // Make a request to see if the cookies are valid or not 
  // There's basically three ways the cookies can go: 
  // 1. The cookies are valid, no more auth needed at all
  // 2. the are verified with 2fa, but we need to username + password auth again
  // 3. cookies are not valid at all, need to do username + password and 2fa again.

  const areCookiesValidBool = await areCookiesValid(mychartRequest);
  

  // If we got redirected somewhere, we need to relogin
  if (!areCookiesValidBool) {
    logger.debug('Cookies are not valid, going through login process again')
    // mychartRequest = await myChartRawLogin(hostname);
    const creds = await readTestCredentials_TEST_ONLY()
    mychartRequest = await myChartRawLogin_TEST({hostname, user: creds[hostname]['user'], pass: creds[hostname]['pass']})

  }
  else {
    logger.debug('Cookies are valid, re-using them')
  }

  await mychartRequest.saveCookies_TEST('cookies.json');  

  return mychartRequest
}


async function test() { 





}

if (import.meta.main) {
  void test()
}
