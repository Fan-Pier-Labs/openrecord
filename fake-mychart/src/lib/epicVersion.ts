/**
 * Which Epic release this instance behaves like.
 *
 * The two values are real Epic releases, named the way Epic names them and
 * read from each captured organization's public FHIR `metadata` endpoint
 * (`software: { name: "Epic", version: ... }`). Three live instances were
 * captured; their observable MyChart-web behavior splits cleanly on the
 * release:
 *
 * - `November 2025`: an unknown `/api/*` path or an API POST with no
 *   `__RequestVerificationToken` answers with ASP.NET's redirect dance —
 *   302 to `/Home/FourOhFour` (unknown path) or `/Home/FiveHundred` (bad
 *   request), each of which 302s on to `/Home/Error?code=14`, which renders a
 *   200 error page. `keepalive.asp` answers `"0"` even for a live session
 *   (only `/Home/KeepAlive` is trustworthy — see `sessionStore.ts`, which
 *   already knows this). Responses additionally carry the newer per-result
 *   fields (`canGenerateLLMSummary`, `feedbackSubmitted`, `isBedsideTablet`).
 *   Two of the three instances behave this way; one reports the November 2025
 *   release, and the other's exact release could not be read but its behavior
 *   is byte-compatible.
 *
 * - `August 2025`: the same failures return a bare 500 HTML error page with
 *   no redirect, `keepalive.asp` answers honestly, and the newer fields are
 *   absent.
 *
 * `November 2025` is the default because it is the majority shape and the
 * richer behavior. Switch with `POST /mode {"epicVersion":"August 2025"}`.
 * Global to the process and restored by `/reset`.
 */

export const EPIC_VERSIONS = ['November 2025', 'August 2025'] as const;
export type EpicVersion = (typeof EPIC_VERSIONS)[number];

export const DEFAULT_EPIC_VERSION: EpicVersion = 'November 2025';

const versionState: { epicVersion: EpicVersion } = {
  epicVersion: DEFAULT_EPIC_VERSION,
};

export function getEpicVersion(): EpicVersion {
  return versionState.epicVersion;
}

/** The August 2025 release, the older of the two captured generations. */
export function isLegacyEpicVersion(): boolean {
  return versionState.epicVersion === 'August 2025';
}

export function setEpicVersion(version: EpicVersion): void {
  versionState.epicVersion = version;
}

export function resetEpicVersion(): void {
  versionState.epicVersion = DEFAULT_EPIC_VERSION;
}
