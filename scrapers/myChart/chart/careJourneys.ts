import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import { type MyChartRequest } from "../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../core/util";
import { logger } from '../../../shared/logger';

export type CareJourney = {
  id: string;
  name: string;
  description: string;
  status: string;
  providerName: string;
}

type CareJourneyResponse = {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  providerName?: string;
}

type GetCareJourneysResponse = {
  careJourneys?: CareJourneyResponse[];
}

export async function getCareJourneys(mychartRequest: MyChartRequest): Promise<CareJourney[]> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/care-journeys' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for care journeys');
    return [];
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/care-journeys/GetCareJourneys',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({}),
  });

  const json: GetCareJourneysResponse = await resp.json();

  return (json.careJourneys || []).map((cj: CareJourneyResponse) => ({
    id: cj.id || '',
    name: cj.name || '',
    description: cj.description || '',
    status: cj.status || '',
    providerName: cj.providerName || '',
  }));
}
