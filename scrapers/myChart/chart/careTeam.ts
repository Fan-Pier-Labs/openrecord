import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../core/myChartRequest';
import { getRequestVerificationTokenFromBody } from '../core/util';
import { logger } from '../../../shared/logger';

/**
 * Care Team.
 *
 * This is a legacy jQuery/Handlebars activity, not one of the React `/app/*`
 * ones, so it does not live under `/api/*` and its envelope is PascalCase
 * rather than the camelCase the `/api` routes use:
 *
 *   POST /Clinical/CareTeam/Load          → this organization's providers
 *   POST /Clinical/CareTeam/LoadExternal  → outside / Care Everywhere providers
 *
 * Both are POST-only (GET answers 500 on every query-string variant), and every
 * parameter the page's own JS sends (`hfrId`, `sources`, `actions`,
 * `isPrimaryStandalone`) is optional — a bare POST with `{}` returns the full
 * list. Field names below are the ones a real instance returned; see
 * `docs/api-surface-gaps.md` §1a for the capture they came from.
 *
 * The previous version of this scraper was withdrawn (#313) for guessing at all
 * of that, because a wrong guess here does not fail visibly — it renders to the
 * patient as "you have no care team". So this one never treats an unrecognized
 * response as an empty care team: a missing `ProvidersList` throws.
 */
export type CareTeamMember = {
  /** Opaque provider id (`ID`), as used by the rest of the Care Team activity. */
  id: string;
  name: string;
  /** The provider's role on this care team, e.g. the PCP designation. */
  relation: string;
  specialty: string;
  nationalProviderId: string;
  departmentId: string;
  photoUrl: string;
  webPageUrl: string;
  aboutMe: string;
  canMessage: boolean;
  /** An outside provider — from `LoadExternal`, or flagged `IsExternal`. */
  isExternal: boolean;
};

export type CareTeam = {
  members: CareTeamMember[];
  /**
   * True when the outside-provider list could not be read, so `members` covers
   * only this organization's providers. A partial care team presented as the
   * whole one is the failure this flag exists to prevent.
   */
  externalProvidersUnavailable: boolean;
};

/** One entry of `ProvidersList`, as captured. Every field is optional: an instance may omit any of them. */
type ProviderResponse = {
  ID?: unknown;
  Name?: unknown;
  Photo?: unknown;
  NationalProviderID?: unknown;
  WebPageUrl?: unknown;
  AboutMeBlurb?: unknown;
  CanMessage?: unknown;
  Specialty?: unknown;
  Relation?: unknown;
  DepartmentID?: unknown;
  IsExternal?: unknown;
};

type CareTeamResponse = {
  ProvidersList?: ProviderResponse[];
};

/** Scalars arrive as strings on the captured instance, but ids are the kind of field that turns numeric elsewhere. */
function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function toMember(provider: ProviderResponse, fromExternalList: boolean): CareTeamMember {
  return {
    id: str(provider.ID),
    name: str(provider.Name),
    relation: str(provider.Relation),
    specialty: str(provider.Specialty),
    nationalProviderId: str(provider.NationalProviderID),
    departmentId: str(provider.DepartmentID),
    photoUrl: str(provider.Photo),
    webPageUrl: str(provider.WebPageUrl),
    aboutMe: str(provider.AboutMeBlurb),
    canMessage: provider.CanMessage === true,
    isExternal: fromExternalList || provider.IsExternal === true,
  };
}

/**
 * POST one of the two Care Team endpoints and return its `ProvidersList`.
 *
 * Throws on anything that isn't a recognizable envelope — a non-2xx status, a
 * non-JSON body (an expired session serves the login page here), or a payload
 * with no `ProvidersList` array. None of those mean "no care team", so none of
 * them may return an empty list.
 */
async function loadProviders(
  mychartRequest: MyChartRequest,
  path: string,
  token: string | undefined,
): Promise<ProviderResponse[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['__RequestVerificationToken'] = token;

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path,
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    throw new Error(`${path} returned HTTP ${resp.status}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(
      `${path} returned ${contentType || 'no content-type'} rather than JSON. ` +
      `The session may have expired, or this instance does not serve the Care Team activity.`,
    );
  }

  const list = (payload as CareTeamResponse | null)?.ProvidersList;
  if (!Array.isArray(list)) {
    throw new Error(
      `${path} returned JSON with no ProvidersList array. Refusing to report an ` +
      `empty care team from a response shape we don't recognize.`,
    );
  }
  return list;
}

/**
 * The patient's care team: this organization's providers, plus the outside
 * providers the instance knows about.
 */
export async function getCareTeam(mychartRequest: MyChartRequest): Promise<CareTeam> {
  // The activity page carries the antiforgery token its own JS posts back. The
  // endpoint is not under /api/*, so instances differ on whether they enforce
  // it; send it when the page has one and let the POST fail loudly if it is
  // both required and absent.
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/Clinical/CareTeam' });
  const token = getRequestVerificationTokenFromBody(await pageResp.text());

  const members = (await loadProviders(mychartRequest, '/Clinical/CareTeam/Load', token))
    .map((provider) => toMember(provider, false));

  // Care Everywhere is optional per deployment, so a failure here is not fatal
  // to the internal list — but it is reported rather than swallowed.
  let externalProvidersUnavailable = false;
  try {
    const external = await loadProviders(mychartRequest, '/Clinical/CareTeam/LoadExternal', token);
    members.push(...external.map((provider) => toMember(provider, true)));
  } catch (err) {
    externalProvidersUnavailable = true;
    logger.debug(`Could not read external care team providers: ${String(err)}`);
  }

  return { members, externalProvidersUnavailable };
}
