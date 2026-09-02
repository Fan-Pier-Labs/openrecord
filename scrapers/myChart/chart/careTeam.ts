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
 * Both are POST-only — a GET is refused with the instance's ASP.NET error
 * surface (a bare 500 on the August 2025 release, a 302 to `/Home/FiveHundred`
 * on November 2025) rather than serving the data — and every
 * parameter the page's own JS sends (`hfrId`, `sources`, `actions`,
 * `isPrimaryStandalone`) is optional — a bare POST with `{}` returns exactly
 * what the page's own parameters return. Both endpoints require the
 * antiforgery token from the activity page, like the `/api/*` routes do.
 * Field names and types below were verified against two live instances (one on
 * each captured Epic release); see `docs/api-surface-gaps.md` §1a.
 *
 * The previous version of this scraper was withdrawn (#313) for guessing at all
 * of that, because a wrong guess here does not fail visibly — it renders to the
 * patient as "you have no care team". So this one never treats an unrecognized
 * response as an empty care team: a missing `ProvidersList` throws.
 *
 * Three response fields are deliberately not surfaced: `AboutMeBlurb` (an
 * array, empty on every provider of both instances, so its element shape is
 * unknown) and `Organizations` / `SchedulableVisitTypes` (both `null` on
 * both). They get added the day a capture shows one populated — guessing at
 * them is the mistake this scraper exists to not repeat.
 */
export type CareTeamMember = {
  /** Opaque provider id (`ID`): an ~86-character token, not a number. */
  id: string;
  name: string;
  /** The provider's role on this care team, e.g. the PCP designation. */
  relation: string;
  specialty: string;
  nationalProviderId: string;
  departmentId: string;
  photoUrl: string;
  webPageUrl: string;
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

/**
 * One entry of `ProvidersList`, typed as both instances returned it. Every
 * field is optional because an instance may omit a key; the types are not
 * hedged, because the capture says what they are.
 */
type ProviderResponse = {
  ID?: string;
  Name?: string;
  Photo?: string;
  NationalProviderID?: string;
  WebPageUrl?: string;
  CanMessage?: boolean;
  Specialty?: string;
  /** Null on a provider with no stated role, which most of one account's were. */
  Relation?: string | null;
  DepartmentID?: string;
  IsExternal?: boolean;
};

type CareTeamResponse = {
  ProvidersList?: ProviderResponse[];
};

function toMember(provider: ProviderResponse, fromExternalList: boolean): CareTeamMember {
  return {
    id: provider.ID ?? '',
    name: provider.Name ?? '',
    relation: provider.Relation ?? '',
    specialty: provider.Specialty ?? '',
    nationalProviderId: provider.NationalProviderID ?? '',
    departmentId: provider.DepartmentID ?? '',
    photoUrl: provider.Photo ?? '',
    webPageUrl: provider.WebPageUrl ?? '',
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
  token: string,
): Promise<ProviderResponse[]> {
  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
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
  // The activity page carries the antiforgery token its own JS posts back, and
  // both endpoints refuse a request without it. A page with no token is an
  // unrecognized state, and this scraper never turns one of those into an
  // empty care team.
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/Clinical/CareTeam' });
  const token = getRequestVerificationTokenFromBody(await pageResp.text());
  if (!token) {
    throw new Error(
      'No request verification token on /Clinical/CareTeam, which both endpoints require. ' +
      'The session may have expired, or this instance does not serve the Care Team activity.',
    );
  }

  // Neither call depends on the other. Care Everywhere is optional per
  // deployment, so a failure on the outside-provider arm is not fatal to the
  // internal list — but it is reported rather than swallowed.
  const [internal, external] = await Promise.all([
    loadProviders(mychartRequest, '/Clinical/CareTeam/Load', token),
    loadProviders(mychartRequest, '/Clinical/CareTeam/LoadExternal', token).catch((err: unknown) => {
      logger.debug(`Could not read external care team providers: ${String(err)}`);
      return null;
    }),
  ]);

  return {
    members: [
      ...internal.map((provider) => toMember(provider, false)),
      ...(external ?? []).map((provider) => toMember(provider, true)),
    ],
    externalProvidersUnavailable: external === null,
  };
}
