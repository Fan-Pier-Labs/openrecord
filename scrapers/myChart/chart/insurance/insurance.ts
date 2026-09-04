import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { GET_COVERAGES_PATH, insuranceProcessor, type InsuranceStandard } from './insurance.processor';

export type { InsuranceStandard, InsuranceCoverageStandard, CoverageBucket } from './insurance.processor';
export { insuranceProcessor, COVERAGE_BUCKETS, GET_COVERAGES_PATH } from './insurance.processor';

/**
 * The patient's insurance coverages.
 *
 * `GET /Insurance` is a shell page — the coverage list is an empty
 * `<div id="coverages-list">` that `$$WP.Insurance.CoveragesController` fills
 * over AJAX, so scraping the page's markup returns nothing on every real
 * instance. The page is still fetched, because it carries the antiforgery
 * token the POST requires, and it is recorded as `purpose: 'token'` so `raw`
 * mode unwraps to the coverage payload rather than to a page of markup.
 *
 * The four form fields are the controller's own (`_loadCoverages`):
 * `isStandAlone` is true on the standalone Insurance activity, and the three
 * `encounter*` fields carry the pre-visit verification context when the same
 * component runs inside eCheck-In. All three are empty here, exactly as the
 * standalone page sends them.
 */
export async function fetchInsuranceRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Insurance');

  await collector.send({
    path: GET_COVERAGES_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      __RequestVerificationToken: token,
    },
    body: new URLSearchParams({
      isStandAlone: 'true',
      encounterCsn: '',
      encounterDepartmentId: '',
      encounterDTE: '',
    }).toString(),
  });

  return collector.toRaw();
}

/**
 * The standard object — what `mode: 'json'` returns. Throws rather than
 * reporting "no insurance on file" when the endpoint did not answer with a
 * recognizable envelope.
 */
export async function getInsurance(mychartRequest: MyChartRequest): Promise<InsuranceStandard> {
  return insuranceProcessor.standard(await fetchInsuranceRaw(mychartRequest));
}
