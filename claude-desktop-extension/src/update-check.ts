/**
 * Update checking for the OpenRecord Claude Desktop extension.
 *
 * Sideloaded .mcpb bundles have no auto-update channel: Claude Desktop only
 * auto-updates extensions installed from the Anthropic directory, and the
 * manifest spec has no update-feed field. So the server checks our own
 * distribution point and tells the model, which tells the user — the closest
 * thing to an update prompt an MCP server can produce.
 *
 * Mechanics:
 *   - Releases live on the splash site's S3 bucket, next to the page that
 *     advertises the product: `mcpb/latest.json` names the current version
 *     and its download URL, and `claude-desktop-extension/release.sh` is the
 *     one thing that writes them. No third-party release infrastructure.
 *   - The check runs fire-and-forget at server startup, and at most once per
 *     24h across processes (state in ~/.openrecord-mcpb/update-check.json —
 *     Claude Desktop starts a fresh server process per session, so an
 *     in-memory throttle alone would re-poll every session).
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

const SITE_ORIGIN = 'https://openrecord.fanpierlabs.com';
const LATEST_JSON_URL = `${SITE_ORIGIN}/mcpb/latest.json`;
/** Stable URL of the current bundle — release.sh overwrites it every release. */
export const STABLE_DOWNLOAD_URL = `${SITE_ORIGIN}/mcpb/openrecord.mcpb`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

/** Lives under the credential-store root so tests intercept it via memfs. */
export const _STATE_PATH = path.join(os.homedir(), '.openrecord-mcpb', 'update-check.json');

export interface UpdateCheckResult {
  installedVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  /** True when the release manifest could not be reached or was garbage. */
  checkFailed: boolean;
  /** True when OPENRECORD_DISABLE_UPDATE_CHECK suppressed the check. */
  disabled: boolean;
}

/**
 * The opt-out. This server's pitch is that health data stays local, so the
 * one outbound connection it makes on its own (the release manifest on
 * openrecord.fanpierlabs.com, once per 24h) has an off switch: the `disable_update_check` toggle in the extension's
 * settings (wired through manifest.json user_config), or this env var
 * directly. Disabled means NO update traffic at all — the explicit
 * check_for_updates tool reports "disabled" instead of fetching.
 */
export function updateCheckDisabled(): boolean {
  const value = (process.env.OPENRECORD_DISABLE_UPDATE_CHECK ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

interface UpdateState {
  checkedAt: number;
  latestVersion: string | null;
  downloadUrl: string | null;
}

/** Shape of mcpb/latest.json, written by claude-desktop-extension/release.sh. */
interface LatestManifest {
  version?: string;
  url?: string;
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
 * Check the site's release manifest for a newer bundle. Throttled to one
 * live fetch per 24h unless `force` (the check_for_updates tool). Never throws.
 */
export async function checkForUpdate(
  opts: { force?: boolean; fetchFn?: typeof fetch } = {},
): Promise<UpdateCheckResult> {
  if (updateCheckDisabled()) {
    return {
      installedVersion: EXTENSION_VERSION,
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      checkFailed: false,
      disabled: true,
    };
  }

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
      const fetched = await fetchLatestManifest(opts.fetchFn ?? globalThis.fetch);
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
      `Let the user know they can update by downloading ${downloadUrl ?? STABLE_DOWNLOAD_URL} ` +
      'and opening the .mcpb file — it upgrades in place and keeps saved accounts, passkeys and sessions.';
  }

  return {
    installedVersion: EXTENSION_VERSION,
    latestVersion,
    updateAvailable,
    downloadUrl,
    checkFailed,
    disabled: false,
  };
}

async function fetchLatestManifest(
  fetchFn: typeof fetch,
): Promise<{ latestVersion: string | null; downloadUrl: string | null }> {
  const res = await fetchFn(LATEST_JSON_URL, {
    headers: { accept: 'application/json', 'user-agent': `openrecord-mcpb/${EXTENSION_VERSION}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // 404/403 means no release has been published yet (or S3 answered for a
  // missing key) — a legitimate "you're current", cached like any answer.
  if (res.status === 404 || res.status === 403) {
    return { latestVersion: null, downloadUrl: null };
  }
  if (!res.ok) throw new Error(`release manifest returned ${res.status}`);
  const manifest = (await res.json()) as LatestManifest;

  // Both fields end up in a notice the model reads, so nothing unvalidated
  // gets through: the version must be digits-and-dots, and the download URL
  // must live on our own origin — a tampered manifest must not be able to
  // put arbitrary text or a third-party link into the conversation.
  const version = manifest?.version;
  if (typeof version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error('release manifest has no valid version');
  }
  const url =
    typeof manifest.url === 'string' && manifest.url.startsWith(`${SITE_ORIGIN}/`)
      ? manifest.url
      : STABLE_DOWNLOAD_URL;
  return { latestVersion: version, downloadUrl: url };
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
