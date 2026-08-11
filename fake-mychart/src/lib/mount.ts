/**
 * Two independent things about a real MyChart deployment that the scraper has
 * to work out before it can build a single URL — so both need to be exercised,
 * and both need to be exercised *in combination*.
 *
 * **Where MyChart lives** (`MountMode`):
 *
 *   - **prefixed** (default): every route lives under `/MyChart`. This is
 *     uhhospitals.org, UCSF, Renown, and most other instances.
 *   - **root**: routes are served straight from the domain root, so the first
 *     path segment is already a MyChart route rather than a deployment prefix.
 *     This is mychart.clevelandclinic.org.
 *
 * **How `/` announces it** (`DiscoveryMode`):
 *
 *   - **redirect** (default): a 302 with a `Location` header. Prefixed
 *     instances send an absolute `/MyChart/`; root-mounted ones send a
 *     relative `./Authentication/Login?`, byte-for-byte what Cleveland Clinic
 *     sends — the relative form and the trailing `?` both matter.
 *   - **meta-refresh**: 200 with no `Location` header at all and an *absolute*
 *     URL inside `<meta http-equiv="refresh">`. This is mychart.renown.org.
 *     The absolute form matters: a parser that strips slashes out of it folds
 *     the host into the prefix (`https:mychart.renown.orgmychart`).
 *   - **default-asp**: the most common shape of all, and the one that reads
 *     most like a trap. `/` bounces through a bare relative `DefaultAsp` before
 *     naming the route, so the mount is only announced on the *last* hop:
 *
 *       /                      302 → /MyChart/
 *       /MyChart/              302 → DefaultAsp        ← relative, no slash
 *       /MyChart/DefaultAsp    302 → /MyChart/Authentication/Login?
 *
 *     Root-mounted instances hop straight from `/` to `DefaultAsp`, so anything
 *     reading only the first hop concludes the prefix is "DefaultAsp". That is
 *     what adams.mychartcc.com and ~22 other instances do.
 *   - **script**: 200 whose body assigns `window.location` instead of carrying
 *     a refresh tag. This is mydovetale.ca.
 *   - **landing-page**: 200 with an affiliate chooser and no redirect of any
 *     kind — the mount is only discoverable from the links on the page. This is
 *     mychart.chihealth.com and mychart.northmemorial.com.
 *   - **moved-host**: `/` sends the client to a *different hostname* that
 *     serves the deployment. Vanity domains outlive the servers behind them:
 *     patients.mycslink.org → mycslink.cedars-sinai.org, login.wellspan.org →
 *     my.wellspan.org. Set the destination with `movedHost` (see
 *     `setMovedHost`); pointing it at another name for this same server
 *     (`127.0.0.1:4000` when the client came in on `localhost:4000`) is enough
 *     to exercise the move.
 *
 * Mount and discovery are orthogonal — Renown is prefixed-and-meta-refresh,
 * Cleveland Clinic is root-and-redirect — so they're stored and switched
 * separately rather than flattened into one enum of observed combinations.
 *
 * Switch at runtime via `POST /mode`; see `src/app/mode/route.ts`. All of it
 * lives in RAM alongside the rest of the fake's mutable state, and `/reset`
 * restores the defaults.
 */
export type MountMode = 'prefixed' | 'root';
export type DiscoveryMode = 'redirect' | 'meta-refresh' | 'default-asp' | 'script' | 'landing-page' | 'moved-host';

export const DISCOVERY_MODES: DiscoveryMode[] = ['redirect', 'meta-refresh', 'default-asp', 'script', 'landing-page', 'moved-host'];

export const DEFAULT_MOUNT_MODE: MountMode = 'prefixed';
export const DEFAULT_DISCOVERY_MODE: DiscoveryMode = 'redirect';

const mountState: { mode: MountMode; discovery: DiscoveryMode; movedHost: string | null } = {
  mode: DEFAULT_MOUNT_MODE,
  discovery: DEFAULT_DISCOVERY_MODE,
  movedHost: null,
};

export function getMountMode(): MountMode {
  return mountState.mode;
}

export function setMountMode(mode: MountMode): void {
  mountState.mode = mode;
}

export function getDiscoveryMode(): DiscoveryMode {
  return mountState.discovery;
}

export function setDiscoveryMode(discovery: DiscoveryMode): void {
  mountState.discovery = discovery;
}

/** Hostname `moved-host` discovery sends the client to, e.g. `127.0.0.1:4000`. */
export function getMovedHost(): string | null {
  return mountState.movedHost;
}

export function setMovedHost(host: string | null): void {
  mountState.movedHost = host;
}

export function resetMountMode(): void {
  mountState.mode = DEFAULT_MOUNT_MODE;
  mountState.discovery = DEFAULT_DISCOVERY_MODE;
  mountState.movedHost = null;
}

export function isRootMount(): boolean {
  return mountState.mode === 'root';
}

/** Does `/` announce the mount with a meta refresh instead of a redirect? */
export function isMetaRefreshDiscovery(): boolean {
  return mountState.discovery === 'meta-refresh';
}

/**
 * Does this instance bounce through `DefaultAsp` on the way to the login page?
 * Consulted by the mount handler as well as `/`, since the hop that matters
 * (`/MyChart/` → `DefaultAsp`) happens below the prefix.
 */
export function isDefaultAspDiscovery(): boolean {
  return mountState.discovery === 'default-asp';
}

/**
 * Path prefix to put in front of MyChart routes: `/MyChart` in prefixed mode,
 * empty when root-mounted.
 */
export function mountPrefix(): string {
  return isRootMount() ? '' : '/MyChart';
}
