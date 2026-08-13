import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import type { MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import { logger } from '../../shared/logger';

export type EducationMaterial = {
  id: string;
  title: string;
  assignedDate: string;
  numTopics: number;
}

// Real GetPatEducationTitles responses are a bare ARRAY of titles whose text
// lives in `displayName` and whose id is `elementId`/`eduKey`. (An earlier
// version read an `educationTitles` wrapper that only the fake served, so
// this scraper returned nothing against every real instance.)
type EducationResponse = {
  elementId?: string;
  eduKey?: string;
  displayName?: string;
  assignedDate?: string;
  numTopics?: number;
}

type GetEducationResponse = EducationResponse[];

export async function getEducationMaterials(mychartRequest: MyChartRequest): Promise<EducationMaterial[]> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/education' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for education materials');
    return [];
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/education/GetPatEducationTitles',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({}),
  });

  const json: GetEducationResponse = await resp.json();

  return (Array.isArray(json) ? json : []).map((ed: EducationResponse) => ({
    id: ed.elementId || ed.eduKey || '',
    title: ed.displayName || '',
    assignedDate: ed.assignedDate || '',
    numTopics: ed.numTopics ?? 0,
  }));
}
