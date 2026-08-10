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
 *
 * These are orthogonal — Renown is prefixed-and-meta-refresh, Cleveland Clinic
 * is root-and-redirect — so they're stored and switched separately rather than
 * flattened into one enum of observed combinations.
 *
 * Switch at runtime via `POST /mode`; see `src/app/mode/route.ts`. Both live in
 * RAM alongside the rest of the fake's mutable state, and `/reset` restores the
 * defaults.
 */
export type MountMode = 'prefixed' | 'root';
export type DiscoveryMode = 'redirect' | 'meta-refresh';

export const DEFAULT_MOUNT_MODE: MountMode = 'prefixed';
export const DEFAULT_DISCOVERY_MODE: DiscoveryMode = 'redirect';

const mountState: { mode: MountMode; discovery: DiscoveryMode } = {
  mode: DEFAULT_MOUNT_MODE,
  discovery: DEFAULT_DISCOVERY_MODE,
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

export function resetMountMode(): void {
  mountState.mode = DEFAULT_MOUNT_MODE;
  mountState.discovery = DEFAULT_DISCOVERY_MODE;
}

export function isRootMount(): boolean {
  return mountState.mode === 'root';
}

/** Does `/` announce the mount with a meta refresh instead of a redirect? */
export function isMetaRefreshDiscovery(): boolean {
  return mountState.discovery === 'meta-refresh';
}

/**
 * Path prefix to put in front of MyChart routes: `/MyChart` in prefixed mode,
 * empty when root-mounted.
 */
export function mountPrefix(): string {
  return isRootMount() ? '' : '/MyChart';
}
