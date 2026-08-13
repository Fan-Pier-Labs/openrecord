/**
 * How this server advertises the patient records an account can access
 * ("proxy access" in Epic's terminology — a parent seeing a child's chart, an
 * adult child seeing a parent's).
 *
 * Real MyChart instances do not all expose the same surface, and the scraper
 * has three discovery paths because of it. All three need to be exercisable
 * against the fake, so the shape is switchable at runtime the same way the
 * mount mode is:
 *
 *   - **json** (default): `GET /ProxySwitch` returns the `ProxySubjectList`
 *     JSON, and `/Home` also renders the proxy-selector anchors. This is the
 *     modern surface and what the scraper tries first.
 *   - **html**: `/ProxySwitch` 404s; `/Home` still renders the anchors, with
 *     `currentContext` marking the active record. The scraper's first HTML
 *     fallback.
 *   - **script**: `/ProxySwitch` 404s and `/Home` carries no anchors — only the
 *     minified `EpicPx.ReactContext.personalizations.proxySubjects.push(...)`
 *     blocks. This payload lists the records but says nothing about which is
 *     active, which is exactly the ambiguity the scraper has to handle.
 *
 * Switch at runtime via `POST /mode {"proxyDiscovery":"html"}`. Lives in RAM
 * with the rest of the mutable state; `/reset` restores the default.
 */
export type ProxyDiscoveryMode = 'json' | 'html' | 'script';

export const DEFAULT_PROXY_DISCOVERY_MODE: ProxyDiscoveryMode = 'json';

export const PROXY_DISCOVERY_MODES: ProxyDiscoveryMode[] = ['json', 'html', 'script'];

const proxyState: { mode: ProxyDiscoveryMode } = { mode: DEFAULT_PROXY_DISCOVERY_MODE };

export function getProxyDiscoveryMode(): ProxyDiscoveryMode {
  return proxyState.mode;
}

export function setProxyDiscoveryMode(mode: ProxyDiscoveryMode): void {
  proxyState.mode = mode;
}

export function resetProxyDiscoveryMode(): void {
  proxyState.mode = DEFAULT_PROXY_DISCOVERY_MODE;
}

/** Whether `GET /ProxySwitch` should serve JSON rather than 404. */
export function servesProxySwitchJson(): boolean {
  return proxyState.mode === 'json';
}

/** Whether `/Home` should render the `.proxySubjectLink` anchor markup. */
export function rendersProxyAnchors(): boolean {
  return proxyState.mode === 'json' || proxyState.mode === 'html';
}
