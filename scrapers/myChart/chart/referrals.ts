import type { MyChartRequest } from '../core/myChartRequest';
import { RawCollector, type RawResponse } from '../core/rawResponse';
import { referralsProcessor, type ReferralsStandard } from './referrals.processor';

export type { ReferralsStandard, ReferralStandard } from './referrals.processor';
export { referralsProcessor } from './referrals.processor';

/** `GET /app/referrals` for the token, then `POST /api/referrals/listReferrals`. */
export async function fetchReferralsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/referrals');
  await collector.postJson('/api/referrals/listReferrals', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getReferrals(mychartRequest: MyChartRequest): Promise<ReferralsStandard> {
  return referralsProcessor.standard(await fetchReferralsRaw(mychartRequest));
}
