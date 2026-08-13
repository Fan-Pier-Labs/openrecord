import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import { type MyChartRequest } from "../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../core/util";
import { logger } from '../../../shared/logger';

export type Referral = {
  internalId: string;
  externalId: string;
  status: string;
  statusString: string;
  creationDate: string;
  startDate: string;
  endDate: string;
  referredByProviderName: string;
  referredToProviderName: string;
  referredToFacility: string;
}

type ReferralResponse = {
  internalId?: string;
  externalId?: string;
  status?: string;
  statusString?: string;
  creationDate?: string;
  start?: string;
  end?: string;
  referredByProviderName?: string;
  referredToProviderName?: string;
  referredToFacility?: string;
}

type ListReferralsResponse = {
  referralList?: ReferralResponse[];
}

export async function getReferrals(mychartRequest: MyChartRequest): Promise<Referral[]> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/referrals' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for referrals');
    return [];
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/referrals/listReferrals',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({}),
  });

  const json: ListReferralsResponse = await resp.json();

  return (json.referralList ?? []).map((ref: ReferralResponse) => ({
    internalId: ref.internalId || '',
    externalId: ref.externalId || '',
    status: ref.status || '',
    statusString: ref.statusString || '',
    creationDate: ref.creationDate || '',
    startDate: ref.start || '',
    endDate: ref.end || '',
    referredByProviderName: ref.referredByProviderName || '',
    referredToProviderName: ref.referredToProviderName || '',
    referredToFacility: ref.referredToFacility || '',
  }));
}
