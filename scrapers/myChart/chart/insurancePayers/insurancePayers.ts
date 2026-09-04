import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { insurancePayersProcessor, type InsurancePayersStandard } from './insurancePayers.processor';

export type { InsurancePayersStandard, InsurancePayerStandard } from './insurancePayers.processor';
export { insurancePayersProcessor, GET_PAYORS_PATH } from './insurancePayers.processor';

/**
 * The organization's insurance payer catalogue — the payers MyChart offers
 * when a patient adds a coverage.
 *
 * This is a legacy jQuery activity, not one of the React `/app/*` ones. The
 * React insurance activity's `POST /api/insurance/LoadPayers` is *not* the
 * endpoint: none of the four captured instances serves that activity at all
 * (`GET /app/insurance` answers 200 with the Home page), and LoadPayers
 * answers 500 there whatever it is sent — the bundle calls it with no request
 * data, so no payload fixes it. `$$WP.Insurance.CoveragesController` in
 * `bundles/insurance-controllers` loads the payer dropdown from:
 *
 *   POST /Insurance/Coverages/GetPayors   → { Payors: [...] }
 *
 * form-encoded with `encounterCsn` and `encounterDepartmentId`, both empty on
 * the standalone Insurance page (they carry the pre-visit insurance
 * verification context when the same component runs inside eCheck-In). The
 * antiforgery token off the `/Insurance` activity page is required exactly as
 * on `/api/*`.
 *
 * The catalogue is organization-level as far as the capture can show: no
 * patient identifier in the request, an identical list with a real department
 * id, and zero payer ids shared between the four organizations. See
 * `scrapers/myChart/api-surface-gaps.md`, "Insurance payer catalogue".
 *
 * Two answers are recorded rather than raised here, because reading either as
 * "no payers" is the failure this capability has to avoid, and both are the
 * processor's to reject: an expired session serves the login page, and an
 * encounter context the instance does not recognize is answered with a 200
 * and an **empty body**.
 */
export async function fetchInsurancePayersRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Insurance');

  await collector.send({
    path: '/Insurance/Coverages/GetPayors',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      __RequestVerificationToken: token,
    },
    body: new URLSearchParams({ encounterCsn: '', encounterDepartmentId: '' }).toString(),
  });

  return collector.toRaw();
}

/**
 * The standard object — what `mode: 'json'` returns. Throws rather than
 * reporting an empty catalogue when the endpoint did not answer with a
 * recognizable envelope.
 */
export async function getInsurancePayers(mychartRequest: MyChartRequest): Promise<InsurancePayersStandard> {
  return insurancePayersProcessor.standard(await fetchInsurancePayersRaw(mychartRequest));
}
