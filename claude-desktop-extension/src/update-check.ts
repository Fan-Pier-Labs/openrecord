/**
 * Update checking for the OpenRecord Claude Desktop extension.
 *
 * Sideloaded .mcpb bundles have no auto-update channel: Claude Desktop only
 * auto-updates extensions installed from the Anthropic directory, and the
 * manifest spec has no update-feed field. So the server checks GitHub
 * Releases itself and tells the model, which tells the user — the closest
 * thing to an update prompt an MCP server can produce.
 *
 * Mechanics:
 *   - Releases are GitHub Releases on Fan-Pier-Labs/openrecord whose tag
 *     starts with `mcpb-v` (other release trains share the repo, so the
 *     prefix is the filter — "latest release" alone would be wrong the day
 *     the npm package gets a GitHub release).
 *   - The check runs fire-and-forget at server startup, and at most once per
 *     24h across processes (state in ~/.openrecord-mcpb/update-check.json —
 *     Claude Desktop starts a fresh server process per session, so an
 *     in-memory throttle alone would re-hit GitHub every session).
 *   - A found update is surfaced ONCE per process: takeUpdateNotice() hands
 *     the notice line to the first successful tool result after the check
 *     resolves (tools.ts appends it centrally), and the explicit
 *     check_for_updates tool bypasses the throttle when the user asks.
 *   - Failures are silent. An update check must never break a health-data
 *     tool call, so every path degrades to "no notice" — and nothing here
 *     writes to stdout, which belongs to the JSON-RPC framing.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EXTENSION_VERSION } from './version';

const REPO = 'Fan-Pier-Labs/openrecord';
const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
export const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`;
const TAG_PREFIX = 'mcpb-v';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

/** Lives under the credential-store root so tests intercept it via memfs. */
export const _STATE_PATH = path.join(os.homedir(), '.openrecord-mcpb', 'update-check.json');

export interface UpdateCheckResult {
  installedVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  /** True when GitHub could not be reached or answered garbage. */
  checkFailed: boolean;
}

interface UpdateState {
  checkedAt: number;
  latestVersion: string | null;
  downloadUrl: string | null;
}

interface GithubAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubRelease {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: GithubAsset[];
}

/**
 * Numeric semver comparison: -1 / 0 / 1. Tolerates a leading `v` and ignores
 * prerelease suffixes; anything unparseable compares equal, so a malformed
 * tag can never claim to be an update.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

let pendingNotice: string | null = null;

/**
 * The one-shot update notice: returns the pending line the first time it is
 * called after a check found a newer release, then null until another check
 * finds one. tools.ts calls this after every tool handler.
 */
export function takeUpdateNotice(): string | null {
  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}

export function _resetForTests(): void {
  pendingNotice = null;
}

/**
 * Check GitHub for a newer mcpb release. Throttled to one live fetch per 24h
 * unless `force` (the check_for_updates tool). Never throws.
 */
export async function checkForUpdate(
  opts: { force?: boolean; fetchFn?: typeof fetch } = {},
): Promise<UpdateCheckResult> {
  const now = Date.now();
  let latestVersion: string | null = null;
  let downloadUrl: string | null = null;
  let checkFailed = false;

  const cached = opts.force ? null : readFreshState(now);
  if (cached) {
    latestVersion = cached.latestVersion;
    downloadUrl = cached.downloadUrl;
  } else {
    try {
      const fetched = await fetchLatestMcpbRelease(opts.fetchFn ?? globalThis.fetch);
      latestVersion = fetched.latestVersion;
      downloadUrl = fetched.downloadUrl;
      writeState({ checkedAt: now, latestVersion, downloadUrl });
    } catch {
      checkFailed = true;
    }
  }

  const updateAvailable =
    latestVersion !== null && compareVersions(EXTENSION_VERSION, latestVersion) < 0;

  if (updateAvailable) {
    pendingNotice =
      `An OpenRecord extension update is available: v${latestVersion} (installed: v${EXTENSION_VERSION}). ` +
      `Let the user know they can update by downloading ${downloadUrl ?? RELEASES_PAGE_URL} ` +
      'and opening the .mcpb file — it upgrades in place and keeps saved accounts, passkeys and sessions.';
  }

  return {
    installedVersion: EXTENSION_VERSION,
    latestVersion,
    updateAvailable,
    downloadUrl,
    checkFailed,
  };
}

async function fetchLatestMcpbRelease(
  fetchFn: typeof fetch,
): Promise<{ latestVersion: string | null; downloadUrl: string | null }> {
  const res = await fetchFn(RELEASES_API_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': `openrecord-mcpb/${EXTENSION_VERSION}`,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub releases API returned ${res.status}`);
  const releases = (await res.json()) as GithubRelease[];
  if (!Array.isArray(releases)) throw new Error('unexpected releases payload');

  // The API returns newest first; the first published mcpb-tagged release wins.
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const tag = release.tag_name ?? '';
    if (!tag.startsWith(TAG_PREFIX)) continue;
    const asset = (release.assets ?? []).find(
      a => a.name?.endsWith('.mcpb') && a.browser_download_url,
    );
    return {
      latestVersion: tag.slice(TAG_PREFIX.length),
      downloadUrl: asset?.browser_download_url ?? release.html_url ?? null,
    };
  }
  // No mcpb release published yet is a legitimate "you're current", not a
  // failure — cache it like any other answer.
  return { latestVersion: null, downloadUrl: null };
}

function readFreshState(now: number): UpdateState | null {
  try {
    const parsed = JSON.parse(String(fs.readFileSync(_STATE_PATH, 'utf-8'))) as UpdateState;
    if (typeof parsed?.checkedAt !== 'number') return null;
    // A clock that moved backwards makes checkedAt > now; treat as stale.
    if (parsed.checkedAt > now || now - parsed.checkedAt >= CHECK_INTERVAL_MS) return null;
    return {
      checkedAt: parsed.checkedAt,
      latestVersion: typeof parsed.latestVersion === 'string' ? parsed.latestVersion : null,
      downloadUrl: typeof parsed.downloadUrl === 'string' ? parsed.downloadUrl : null,
    };
  } catch {
    return null;
  }
}

function writeState(state: UpdateState): void {
  try {
    fs.mkdirSync(path.dirname(_STATE_PATH), { recursive: true });
    fs.writeFileSync(_STATE_PATH, JSON.stringify(state, null, 2));
  } catch {
    // A failed cache write must not break the check.
  }
}
