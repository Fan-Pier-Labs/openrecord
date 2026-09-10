import type { MyChartRequest } from '../../core/myChartRequest';
import { SessionExpiredError } from '../../core/makeAuthenticatedRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { rec } from '../../processors/read';
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
 * `scrapers/myChart/api-surface-gaps.md`, "Shipped: Care Team".
 *
 * Neither call depends on the other. Care Everywhere is optional per
 * deployment, so a failure on the outside-provider arm is not fatal: a failed
 * response is recorded as it came, and a call that throws (anything but an
 * expired session) is logged and leaves no `LoadExternal` record, which the
 * processor reports as `externalProvidersUnavailable`.
 *
 * Then one more call per provider, the one the page's own "provider details"
 * link leads to:
 *
 *   POST /api/Providers/GetProviderBioPrivate  { id: <the row's ID> }
 *
 * The care team's `NationalProviderID` is an Epic-encrypted token, but this
 * React endpoint takes the row's (equally encrypted) `ID` and answers with the
 * provider's bio, `npi` in plain digits included — the server holds the key,
 * so the server is asked. It is called only where the page itself would link
 * (`CanViewProviderDetails`, and not `HasNoProviderRecord`), and an unknown or
 * foreign id is a 500 `{"Message":"An error has occurred."}`, recorded rather
 * than thrown: a missing bio costs one provider's `npi`, not the care team.
 * See README.md for the capture.
 */
export async function fetchCareTeamRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Clinical/CareTeam');

  const [load, loadExternal] = await Promise.all([
    collector.postJson('/Clinical/CareTeam/Load', token, {}),
    collector.postJson('/Clinical/CareTeam/LoadExternal', token, {}, { tolerateFailure: true }).catch((err: unknown) => {
      if (err instanceof SessionExpiredError) throw err;
      logger.debug(`Could not read external care team providers: ${String(err)}`);
      return undefined;
    }),
  ]);

  const ids = [...providersOf(load), ...providersOf(loadExternal)].map(detailsIdOf).filter((id): id is string => id !== null);
  await Promise.all(
    ids.map((id) =>
      collector.postJson('/api/Providers/GetProviderBioPrivate', token, { id }, { tolerateFailure: true }).catch((err: unknown) => {
        if (err instanceof SessionExpiredError) throw err;
        logger.debug(`Could not read a care team provider's bio: ${String(err)}`);
      }),
    ),
  );

  return collector.toRaw();
}

function providersOf(body: unknown): unknown[] {
  const list = rec(body).ProvidersList;
  return Array.isArray(list) ? list : [];
}

/** The row's `ID` when the page would link it to `/app/providers/details?id=<ID>` (the conditions are `careteam.min.js`'s), else null. */
function detailsIdOf(provider: unknown): string | null {
  const p = rec(provider);
  const links = p.CanViewProviderDetails === true && p.HasNoProviderRecord !== true;
  return links && typeof p.ID === 'string' && p.ID !== '' ? p.ID : null;
}

/**
 * The standard object — what `mode: 'json'` returns. Throws rather than
 * reporting an empty team when `Load` did not answer with a recognizable
 * envelope.
 */
export async function getCareTeam(mychartRequest: MyChartRequest): Promise<CareTeamStandard> {
  return careTeamProcessor.standard(await fetchCareTeamRaw(mychartRequest));
}
