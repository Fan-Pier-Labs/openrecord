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
import { openPreloginPage } from './preloginSession';
import type { BillingEntity } from './types';

export const GUEST_ESTIMATES_PATH = '/GuestEstimates';
const SERVICE_AREA_PATH = '/GuestEstimates/SelectServiceArea';

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

/**
 * The JSON value that starts at `start`: the shortest prefix `JSON.parse`
 * accepts.
 *
 * A value starting with `[` or `{` has no proper prefix that is itself valid
 * JSON — a prefix only parses once its brackets balance, which is the whole
 * value — so the first prefix that parses is the end of it. Letting the real
 * parser decide is what keeps a `]` inside a title, an escaped quote, or a
 * second statement on the same line from ending the value early.
 */
function valueAt(html: string, start: number): unknown {
  for (let end = start + 1; end <= html.length; end++) {
    const ch = html[end - 1];
    if (ch !== ']' && ch !== '}') continue;
    try {
      return JSON.parse(html.slice(start, end));
    } catch {
      // Not the end of the value yet.
    }
  }
  return undefined;
}

/** Read one `$$WP.Estimates.<name> = [...]` assignment out of the page. */
function readAssignment(html: string, name: string): unknown {
  const m = new RegExp(`\\$\\$WP\\.Estimates\\.${name}\\s*=\\s*`).exec(html);
  return m ? valueAt(html, m.index + m[0].length) : undefined;
}

/** The billing entities on the service-area page, or null if it isn't one. */
export function parseServiceAreas(html: string): RawServiceArea[] | null {
  const recent = readAssignment(html, 'RecentSAs');
  const other = readAssignment(html, 'OtherSAs');
  if (!Array.isArray(recent) && !Array.isArray(other)) return null;
  const all = [...(Array.isArray(recent) ? recent : []), ...(Array.isArray(other) ? other : [])] as RawServiceArea[];
  return all.filter((a) => typeof a?.Id === 'string' && typeof a?.Title === 'string');
}

/** The `var model = {...}` on the location page, or null if it isn't one. */
export function parseLocationModel(html: string): RawLocationModel | null {
  // Not a `$$WP.` assignment: the page wraps it in `$(function () { … })`,
  // with more statements after it on the same line.
  const m = /var\s+model\s*=\s*/.exec(html);
  if (!m) return null;
  const model = valueAt(html, m.index + m[0].length);
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
