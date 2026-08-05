/**
 * Which of the two real MyChart deployment shapes this server is pretending to
 * be. The scraper has to discover the shape before it can build a single URL,
 * so both need to be exercised:
 *
 *   - **path-prefixed** (default): `/` redirects to `/MyChart/`, and every
 *     route lives under that prefix. This is uhhospitals.org, UCSF, and most
 *     other instances.
 *   - **root-mounted**: `/` redirects to a relative `./Authentication/Login?`
 *     and routes are served straight from the domain root. This is
 *     mychart.clevelandclinic.org. Here the first path segment is already a
 *     MyChart route, not a deployment prefix.
 *
 * Switch at runtime via `POST /mode`; see `src/app/mode/route.ts`. The mode
 * lives in RAM alongside the rest of the fake's mutable state, and `/reset`
 * restores the default.
 */
export type MountMode = 'prefixed' | 'root';

export const DEFAULT_MOUNT_MODE: MountMode = 'prefixed';

const mountState: { mode: MountMode } = { mode: DEFAULT_MOUNT_MODE };

export function getMountMode(): MountMode {
  return mountState.mode;
}

export function setMountMode(mode: MountMode): void {
  mountState.mode = mode;
}

export function resetMountMode(): void {
  mountState.mode = DEFAULT_MOUNT_MODE;
}

export function isRootMount(): boolean {
  return mountState.mode === 'root';
}

/**
 * Path prefix to put in front of MyChart routes: `/MyChart` in prefixed mode,
 * empty when root-mounted.
 */
export function mountPrefix(): string {
  return isRootMount() ? '' : '/MyChart';
}
