import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { linkedAccountsProcessor, type LinkedAccountsStandard } from './otherMyCharts.processor';

export type {
  LinkedAccountsStandard,
  LinkedOrganizationStandard,
  LastEncounterDetailStandard,
} from './otherMyCharts.processor';
export { linkedAccountsProcessor } from './otherMyCharts.processor';

/**
 * `GET /Community/Manage` for the token, then the legacy form-encoded
 * `POST /Community/Shared/LoadCommunityLinks` with the lower-case
 * `__requestverificationtoken` header the page's own JS sends. The
 * cache-buster keeps a repeat call from being served a stale org list.
 */
export async function fetchLinkedAccountsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/Community/Manage');
  await collector.send({
    path: `/Community/Shared/LoadCommunityLinks?noCache=${Math.random()}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      __requestverificationtoken: token,
    },
    body: 'controllerType=2&showDXROrgInMO=false',
  });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getLinkedMyChartAccounts(mychartRequest: MyChartRequest): Promise<LinkedAccountsStandard> {
  return linkedAccountsProcessor.standard(await fetchLinkedAccountsRaw(mychartRequest));
}
