import { CookieJar } from 'tough-cookie'
import fs from 'fs';
import { type RequestConfig } from './types';
import { logger } from '../../../shared/logger';
import { PLATFORM_OWNS_COOKIES, scraperFetch, type Transport } from '../../http';

/**
 * Options for creating a MyChartRequest.
 *
 * There is deliberately no "pass me a fetch" option: which network call to
 * make, and whether to keep our own cookie jar, are platform questions that
 * `scrapers/http.ts` answers at runtime. Callers say where they're going, not
 * how to get there.
 */
export type MyChartRequestOptions = {
  protocol?: string;
};

// Redirect statuses worth following. 303/307/308 are rare on MyChart but do
// show up in front of it (SSO stops, load balancers), and dropping them turns
// a working instance into an unexplained blank response.
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

// Matches what browsers allow before declaring a redirect loop.
const MAX_REDIRECTS = 20;

// Class to keep track of variables used when making requests
// to MyChart's Site.
export class MyChartRequest {

  // Cookie jar to keep track of all the cookies received.
  // On platforms that handle cookies natively (iOS), this jar stays empty
  // and is only used for getCookieInfo() / serialize() compatibility.
  cookieJar: CookieJar;

  // Test seam. Null in production — scraperFetch picks the transport from the
  // platform. Assigning a function here intercepts this session's requests
  // without losing the headers, the jar or the per-host permit, all of which
  // live above the transport.
  transport: Transport | null = null;

  // The hostname of the MyChart site, eg. mychart.example.org
  hostname: string;

  // Protocol to use for requests. Defaults to 'https'. Set to 'http' for local fake-mychart server.
  protocol: string;

  // The deployment prefix every MyChart route sits under: '/MyChart' for most
  // instances, '/MyChart-PRD' or '/UCSFMyChart' for others. null means the
  // instance is mounted at the domain root and there is no prefix at all
  // (e.g. mychart.clevelandclinic.org), or that we haven't discovered one yet.
  firstPathPart: string | null = null;

  /**
   * Restore this session to a logged-in state, wired by each client after
   * login (the CLI, the desktop extension and the mobile app each know where
   * their own credentials live — this class deliberately doesn't).
   *
   * Called by `makeAuthenticatedRequest` when a request bounces to the login
   * page. The hook must log back in and adopt the fresh state onto THIS
   * instance (see `adoptStateFrom`), returning true on success and false when
   * a silent re-login isn't possible (e.g. the account requires interactive
   * 2FA). Left unset, an expired session surfaces as `SessionExpiredError`
   * instead of being renewed.
   */
  reauthenticate?: () => Promise<boolean>;

  /**
   * Opt out of the automatic keepalive enrollment makeAuthenticatedRequest
   * performs after successful requests. Set by clients that explicitly asked
   * for no background pings (MyChartClient's `keepalive: false`).
   */
  disableAutoKeepalive?: boolean;

  /**
   * The patient record this session was last deliberately switched to,
   * recorded by `switchProxyTarget`. Re-login resets MyChart's server-side
   * proxy context to the account holder, so automatic session renewal consults
   * this to put the context back before any caller retries — without it, a
   * renewed session would silently read the wrong patient's chart.
   */
  activeProxyTarget?: { id: string; isSelf: boolean; displayName: string };

  /**
   * Re-runs the verified proxy switch that produced `activeProxyTarget`,
   * with autoRenew: false. Armed by proxyContext together with
   * `activeProxyTarget`; called by session renewal (`sessionRenewal.ts`)
   * after a silent re-login, which resets MyChart's server-side context to
   * the account holder. A closure on the request — rather than an import of
   * proxyContext from the renewal path — so the renewal module stays a leaf
   * and the module graph stays acyclic.
   */
  restoreProxyContext?: () => Promise<void>;

  constructor(hostname: string, options?: string | MyChartRequestOptions) {
    // Support old signature: new MyChartRequest(hostname, protocol?)
    const opts: MyChartRequestOptions = typeof options === 'string'
      ? { protocol: options }
      : (options ?? {});

    this.cookieJar = new CookieJar();
    this.hostname = MyChartRequest.normalizeHostname(hostname);
    this.protocol = opts.protocol ?? 'https';
  }

  /**
   * Strip protocol/path from user input so only the bare hostname remains.
   * e.g. "https://mychart.example.org/MyChart" → "mychart.example.org"
   */
  static normalizeHostname(input: string): string {
    const trimmed = input.trim();
    try {
      const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      // Use host (includes port) instead of hostname (strips port)
      // so that "localhost:4000" is preserved for local development
      return parsed.host;
    } catch {
      return trimmed;
    }
  }

  getCookieInfo(): { count: number; names: string[] } {
    const serialized = this.cookieJar.serializeSync() as unknown as { cookies?: { key: string; domain?: string; path?: string }[] };
    const cookies = serialized?.cookies ?? [];
    return {
      count: cookies.length,
      names: cookies.map(c => `${c.key}=${c.domain ?? ''}${c.path ?? ''}`),
    };
  }

  // Promise-typed for API stability (npm-package exposes it); the work is synchronous.
  serialize(): Promise<string> {
    return Promise.resolve(JSON.stringify({
      firstPathPart: this.firstPathPart,
      hostname: this.hostname,
      protocol: this.protocol,
      cookies: this.cookieJar.serializeSync()
    }))
  }

  static unserialize(serializedData: string, options?: MyChartRequestOptions): Promise<MyChartRequest | null> {
    try {
      const data = JSON.parse(serializedData);
      // firstPathPart is null for root-mounted instances, so check for presence
      // rather than truthiness.
      if (data?.hostname && data.firstPathPart !== undefined && data.cookies) {
        const request = new MyChartRequest(data.hostname, { ...options, protocol: data.protocol });
        request.firstPathPart = data.firstPathPart;
        if (Object.keys(data.cookies).length > 0) {
          request.cookieJar = CookieJar.deserializeSync(data.cookies);
        }
        return Promise.resolve(request);
      } else {
        // `data` holds the serialized cookie jar — log its shape, never its contents.
        logger.error(
          'Invalid data for MyChartRequest unserialization. Fields present:',
          data && typeof data === 'object' ? Object.keys(data).join(', ') : typeof data,
        );
      }
    } catch (error) {
      logger.error('Error unserializing MyChartRequest:', error);
    }
    return Promise.resolve(null);
  }

  setFirstPathPart(firstPathPart: string | null) {
    this.firstPathPart = firstPathPart;
  }

  /**
   * Point every subsequent request at a different host.
   *
   * Vanity hostnames outlive the deployments behind them — `login.wellspan.org`
   * redirects to `my.wellspan.org`, `patients.mycslink.org` to
   * `mycslink.cedars-sinai.org`. Discovery follows those moves so the rest of
   * the session talks to the host that actually serves the chart.
   */
  setHostname(hostname: string) {
    this.hostname = MyChartRequest.normalizeHostname(hostname);
  }

  /**
   * Adopt a freshly logged-in instance's session state onto this one, in
   * place.
   *
   * The login functions construct and return a brand-new MyChartRequest, but
   * everything holding a reference mid-scrape (in-flight scrapers, the session
   * stores, the keepalive) points at the old object — so a re-login hook copies
   * the new state across rather than swapping references. Hostname and mount
   * come along too, because discovery during the fresh login may legitimately
   * have followed a vanity-host move.
   *
   * `transport` is deliberately NOT copied: it's a per-instance test seam, and
   * production requests read `this.cookieJar` at call time anyway — reassigning
   * the jar is enough.
   */
  adoptStateFrom(other: MyChartRequest) {
    this.cookieJar = other.cookieJar;
    this.hostname = other.hostname;
    this.protocol = other.protocol;
    this.firstPathPart = other.firstPathPart;
  }


  // Save the current state of the cookie jar to a JSON file.
  // Only used for local testing.
  public async saveCookies_TEST(filePath: string): Promise<void> {
    const serializedJar = this.cookieJar.serializeSync();
    await fs.promises.writeFile(filePath, JSON.stringify(serializedJar, null, 2));
  }

  // Load cookies from a JSON file into the cookie jar.
  // Only used for local testing.
  public async loadCookies_TEST(filePath: string): Promise<void> {
    let data;
    try {
      data = await fs.promises.readFile(filePath, 'utf8');
    }
    catch (e) {
      logger.debug('Error loading cookies:', e);
      return
    }
    const serializedJar = JSON.parse(data);

    // Deserialize into a new CookieJar instance
    this.cookieJar = CookieJar.deserializeSync(serializedJar);
  }

  // Make a request with the given config.
  // Returns the raw response object.
  //
  // `redirectsFollowed` is bookkeeping for the recursive redirect follow below;
  // callers pass one argument and let it default.
  async makeRequest(config: RequestConfig, redirectsFollowed = 0): Promise<Response> {
    config.method ??= 'GET';

    if (!config.url && !config.path) {
      throw new Error("Either url or path must be defined in the config object.");
    }

    // The Chrome header block, the cookie jar and the per-host permit are all
    // scraperFetch's job; this only says what MyChart is being asked for.
    const finalConfig = {
      method: config.method ?? 'GET',
      redirect: "manual" as const,
      body: config.body,
      headers: config.headers ?? {},
    }

    // No prefix (root-mounted instance) means nothing goes in front of the
    // path — not even the separating slash, which would leave a double slash
    // that some servers redirect on.
    const mountPath = this.firstPathPart ? '/' + this.firstPathPart : '';
    const url = config.url ?? (this.protocol + '://' + this.hostname + mountPath + config.path);

    const response = await scraperFetch(url, finalConfig, {
      // Who keeps the cookies is a property of the runtime, not of the
      // caller — see PLATFORM_OWNS_COOKIES.
      cookieJar: PLATFORM_OWNS_COOKIES ? null : this.cookieJar,
      transport: this.transport ?? undefined,
    })
    // Log each request and its status code.
    logger.debug(response.status, url)

    // Follow redirects, if necessary.
    if (REDIRECT_STATUSES.includes(response.status) && config.followRedirects !== false) {

      let newLocation = response.headers.get('Location');

      if (!newLocation) {
        throw new Error("302 didn't have a location header" + url)
      }

      // Some instances redirect a URL straight back to itself and never stop —
      // mychart.crossingrivers.org does this on /MyChart/, cookies and all.
      // Without a cap this recurses until the process runs out of stack.
      if (redirectsFollowed >= MAX_REDIRECTS) {
        logger.debug(`Giving up after ${MAX_REDIRECTS} redirects, last hop:`, url);
        return response;
      }

      // If the Location header returned doesn't isn't absolute, make it absolute.
      newLocation = new URL(newLocation, url).href

      // 307/308 exist precisely to preserve the method and body; everything
      // else turns into a GET, which is what browsers do with a 302 too.
      const preserveMethod = response.status === 307 || response.status === 308;
      return this.makeRequest({
        ...config,
        url: newLocation,
        method: preserveMethod ? config.method : 'GET',
        body: preserveMethod ? config.body : undefined,
      }, redirectsFollowed + 1)
    }

    return response;
  }
}
