import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import { MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import { logger } from '../../shared/logger';

export type EducationMaterial = {
  id: string;
  title: string;
  category: string;
  assignedDate: string;
  providerName: string;
}

type EducationResponse = {
  id?: string;
  title?: string;
  category?: string;
  assignedDate?: string;
  providerName?: string;
}

type GetEducationResponse = {
  educationTitles?: EducationResponse[];
}

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

  return (json.educationTitles || []).map((ed: EducationResponse) => ({
    id: ed.id || '',
    title: ed.title || '',
    category: ed.category || '',
    assignedDate: ed.assignedDate || '',
    providerName: ed.providerName || '',
  }));
}
