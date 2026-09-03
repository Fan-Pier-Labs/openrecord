/**
 * Billing entities and facilities, from the guest price-estimate flow.
 *
 * `/<mount>/GuestEstimates` is the CMS price-transparency tool, open to
 * anyone. Its first two steps are plain pages with their data inlined in a
 * script block, which is all this module reads:
 *
 *   GET GuestEstimates              → 302 → GuestEstimates/SelectServiceArea
 *   GET GuestEstimates/SelectServiceArea
 *       $$WP.Estimates.RecentSAs = [...];  $$WP.Estimates.OtherSAs = [{Id,Title,Phone,PhoneText,LogoURL,SelectLocations,…}]
 *   GET GuestEstimates/SelectLocation?svcArea=<id>&isMultiSA=true      (only when SelectLocations is true)
 *       var model = {"Locations":[{Id,Title,…}],"ServiceArea":…,"IsGuest":true,"HasCompletedCaptcha":false,…}
 *
 * A "service area" is a billing entity — the hospital system, a physicians'
 * group, an affiliated practice — each with its own customer-service line.
 * `SelectLocation` then lists the hospitals and campuses under it.
 *
 * The flow continues to `AcceptDisclaimer` and, two steps later, the payer
 * picker. That is where accepted insurance lives, and it is not read here:
 * the disclaimer's accept step runs an invisible reCAPTCHA (the location
 * model says so — `HasCompletedCaptcha`), and the scraper does not solve
 * captchas. See `types.ts` `InsuranceAvailability`.
 *
 * Verified on five instances; the inlined field set is identical on all of
 * them. The page keeps `RecentSAs` (areas this visitor used before, always
 * empty for a fresh session) apart from `OtherSAs`; both are read.
 */

import type { MyChartRequest } from '../core/myChartRequest';
import { logger } from '../../../shared/logger';
import { parseInlineScripts, readAssignedLiteral, readDeclaredLiteral } from './inlineScript';
import { openPreloginPage } from './preloginSession';
import type { BillingEntity } from './types';

export const GUEST_ESTIMATES_PATH = '/GuestEstimates';
const SERVICE_AREA_PATH = '/GuestEstimates/SelectServiceArea';

/** Where the two pages put their data: an assignment, then a local variable. */
const ESTIMATES_NAMESPACE = '$$WP.Estimates.';
const MODEL_VARIABLE = 'model';

export type RawServiceArea = {
  Id: string;
  Title: string;
  Phone?: string | null;
  PhoneText?: string | null;
  LogoURL?: string | null;
  SelectLocations?: boolean;
};

type RawLocationModel = {
  Locations?: RawServiceArea[] | null;
  HasCompletedCaptcha?: boolean;
};

/** The billing entities on the service-area page, or null if it isn't one. */
export function parseServiceAreas(html: string): RawServiceArea[] | null {
  const scripts = parseInlineScripts(html, ESTIMATES_NAMESPACE);
  const recent = readAssignedLiteral(scripts, `${ESTIMATES_NAMESPACE}RecentSAs`);
  const other = readAssignedLiteral(scripts, `${ESTIMATES_NAMESPACE}OtherSAs`);
  if (!Array.isArray(recent) && !Array.isArray(other)) return null;
  const all = [...(Array.isArray(recent) ? recent : []), ...(Array.isArray(other) ? other : [])] as RawServiceArea[];
  return all.filter((a) => typeof a?.Id === 'string' && typeof a?.Title === 'string');
}

/** The `var model = {...}` on the location page, or null if it isn't one. */
export function parseLocationModel(html: string): RawLocationModel | null {
  const model = readDeclaredLiteral(parseInlineScripts(html, MODEL_VARIABLE), MODEL_VARIABLE);
  return model && typeof model === 'object' ? model : null;
}

export function toBillingEntity(area: RawServiceArea, facilities: { id: string; name: string }[]): BillingEntity {
  return {
    id: area.Id,
    name: area.Title.trim(),
    phone: area.Phone?.trim() || null,
    logoUrl: area.LogoURL?.trim() || null,
    facilities,
  };
}

/**
 * Every billing entity the estimate tool offers, with the facilities under
 * each one that groups by location. Returns null when the instance has the
 * tool switched off (the page that comes back is the login shell, or a
 * different activity, with no service areas in it).
 */
export async function fetchBillingEntities(request: MyChartRequest): Promise<BillingEntity[] | null> {
  const page = await openPreloginPage(request, GUEST_ESTIMATES_PATH);
  const areas = parseServiceAreas(page.html);
  if (!areas) {
    logger.debug('guest estimates is not available on', request.hostname);
    return null;
  }

  const entities = await Promise.all(
    areas.map(async (area) => {
      if (!area.SelectLocations) return toBillingEntity(area, []);
      const svcArea = encodeURIComponent(area.Id);
      const location = await openPreloginPage(request, `/GuestEstimates/SelectLocation?svcArea=${svcArea}&isMultiSA=true`);
      const model = parseLocationModel(location.html);
      const facilities = (model?.Locations ?? [])
        .filter((l) => typeof l?.Id === 'string' && typeof l?.Title === 'string')
        .map((l) => ({ id: l.Id, name: l.Title.trim() }));
      return toBillingEntity(area, facilities);
    }),
  );
  return entities;
}

// Exported for the fake and the tests: the page the flow starts on.
export { SERVICE_AREA_PATH };
