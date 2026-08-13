/**
 * Which Epic release generation this instance behaves like.
 *
 * Real deployments split into two observable generations, captured on three
 * live instances:
 *
 * - `modern` (two of the three): an unknown `/api/*` path or an API POST with
 *   no `__RequestVerificationToken` answers with ASP.NET's redirect dance —
 *   302 to `/Home/FourOhFour` (unknown path) or `/Home/FiveHundred` (bad
 *   request), each of which 302s on to `/Home/Error?code=14`, which renders a
 *   200 error page. `keepalive.asp` answers `"0"` even for a live session
 *   (only `/Home/KeepAlive` is trustworthy — see `sessionStore.ts`, which
 *   already knows this). Responses additionally carry the newer per-result
 *   fields (`canGenerateLLMSummary`, `feedbackSubmitted`, `isBedsideTablet`).
 *
 * - `legacy` (the third): the same failures return a bare 500 HTML error page
 *   with no redirect, `keepalive.asp` answers `"1"`, and the newer fields are
 *   absent.
 *
 * `modern` is the default because it is the majority shape and the richer
 * behavior. Switch with `POST /mode {"epicVersion":"legacy"}`. Global to the
 * process and restored by `/reset`.
 */

export const EPIC_VERSIONS = ['modern', 'legacy'] as const;
export type EpicVersion = (typeof EPIC_VERSIONS)[number];

export const DEFAULT_EPIC_VERSION: EpicVersion = 'modern';

const versionState: { epicVersion: EpicVersion } = {
  epicVersion: DEFAULT_EPIC_VERSION,
};

export function getEpicVersion(): EpicVersion {
  return versionState.epicVersion;
}

export function setEpicVersion(version: EpicVersion): void {
  versionState.epicVersion = version;
}

export function resetEpicVersion(): void {
  versionState.epicVersion = DEFAULT_EPIC_VERSION;
}
