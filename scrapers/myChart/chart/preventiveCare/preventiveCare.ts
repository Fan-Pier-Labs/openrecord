import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import {
  ADVISORIES_PAGE_PATH,
  GET_TOPICS_PATH,
  preventiveCareProcessor,
  type PreventiveCareStandard,
} from './preventiveCare.processor';

export type { PreventiveCareStandard, PreventiveCareItemStandard, PreventiveCareStatus } from './preventiveCare.processor';
export {
  preventiveCareProcessor,
  parsePreventiveCareHtml,
  statusFromCode,
  ADVISORIES_PAGE_PATH,
  GET_TOPICS_PATH,
} from './preventiveCare.processor';

/**
 * `GET /HealthAdvisories` for the token, then `POST /HealthAdvisories/GetTopics`.
 *
 * The page used to be the whole scraper, and on a real instance it is an empty
 * client-rendered shell — `<div id="hm-list-activity">` with a comment in it,
 * and not one `<table>`, `<tr>` or `<td>` in 111KB. Parsing it for a table
 * returned "no screenings due" for a chart with thirteen advisories. The
 * advisories come from the legacy `Area/Controller/Action` endpoint the
 * activity's own controller calls (`healthadvisoriescontroller.min.js`):
 *
 *   POST /HealthAdvisories/GetTopics   → { HealthAdvisoryViewModelList, HealthAdvisorySettings }
 *
 * form-encoded with `registryID`, which the standalone activity passes as the
 * empty string. Verified against the live instance: the antiforgery token is
 * required (without it, and with it in the query string, the endpoint answers
 * 500) and works either as the `__RequestVerificationToken` header or in the
 * form body — the header, as `Insurance/Coverages/GetPayors` sends it. Nothing
 * else in the request matters there: absent, lowercased and bogus `registryID`
 * all returned the same thirteen topics, as did dropping `X-Requested-With`.
 * `registryID` is sent as the controller sends it rather than trimmed to what
 * one instance ignores.
 *
 * The failure is tolerated rather than thrown so the processor can still try
 * the page, for an instance that renders the table server-side; it reports
 * `unavailable: ['/HealthAdvisories/GetTopics']` when neither answered, so an
 * unread page can never come back as a chart with nothing due.
 */
export async function fetchPreventiveCareRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken(ADVISORIES_PAGE_PATH);

  await collector.send(
    {
      path: GET_TOPICS_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        __RequestVerificationToken: token,
      },
      body: new URLSearchParams({ registryID: '' }).toString(),
    },
    { tolerateFailure: true },
  );

  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getPreventiveCare(mychartRequest: MyChartRequest): Promise<PreventiveCareStandard> {
  return preventiveCareProcessor.standard(await fetchPreventiveCareRaw(mychartRequest));
}
