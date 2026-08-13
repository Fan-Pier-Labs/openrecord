import { makeAuthenticatedRequest } from './makeAuthenticatedRequest';
import { type MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";
import { logger } from '../../shared/logger';

export type EhiTemplate = {
  id: string;
  name: string;
  description: string;
}

type EhiTemplateResponse = {
  id?: string;
  name?: string;
  description?: string;
}

// Real responses key the list as `ehieTemplates`. (An earlier version read a
// `templates` key that only the fake served, so this scraper returned nothing
// against every real instance.)
type GetEhiTemplatesResponse = {
  ehieTemplates?: EhiTemplateResponse[];
}

export async function getEhiExportTemplates(mychartRequest: MyChartRequest): Promise<EhiTemplate[]> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/release-of-information' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for EHI export');
    return [];
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/release-of-information/GetEHIETemplates',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({}),
  });

  const json: GetEhiTemplatesResponse = await resp.json();

  return (json.ehieTemplates || []).map((t: EhiTemplateResponse) => ({
    id: t.id || '',
    name: t.name || '',
    description: t.description || '',
  }));
}
