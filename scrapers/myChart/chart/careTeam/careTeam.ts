import type { MyChartRequest } from '../../core/myChartRequest';
import { SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { logger } from '../../../../shared/logger';
import { careTeamProcessor, type CareTeamStandard } from './careTeam.processor';

export type { CareTeamStandard, CareTeamProviderStandard } from './careTeam.processor';
export { careTeamProcessor } from './careTeam.processor';

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
 * on November 2025) rather than serving the data — and every parameter the
 * page's own JS sends (`hfrId`, `sources`, `actions`, `isPrimaryStandalone`)
 * is optional: a bare POST with `{}` returns exactly what the page's own
 * parameters return. Both require the antiforgery token from the activity
 * page, like the `/api/*` routes do. Field names and types were verified
 * against four live instances spanning both captured Epic releases; see
 * `docs/api-surface-gaps.md`, "Shipped: Care Team".
 *
 * Neither call depends on the other. Care Everywhere is optional per
 * deployment, so a failure on the outside-provider arm is not fatal: a failed
 * response is recorded as it came, and a call that throws (anything but an
 * expired session) is logged and leaves no `LoadExternal` record, which the
 * processor reports as `externalProvidersUnavailable`.
 */
export async function fetchCareTeamRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Clinical/CareTeam');

  await Promise.all([
    collector.postJson('/Clinical/CareTeam/Load', token, {}),
    collector.postJson('/Clinical/CareTeam/LoadExternal', token, {}).catch((err: unknown) => {
      if (err instanceof SessionExpiredError) throw err;
      logger.debug(`Could not read external care team providers: ${String(err)}`);
    }),
  ]);

  return collector.toRaw();
}

/**
 * The standard object — what `mode: 'json'` returns. Throws rather than
 * reporting an empty team when `Load` did not answer with a recognizable
 * envelope.
 */
export async function getCareTeam(mychartRequest: MyChartRequest): Promise<CareTeamStandard> {
  return careTeamProcessor.standard(await fetchCareTeamRaw(mychartRequest));
}
