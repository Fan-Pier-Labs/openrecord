import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { getRequestVerificationTokenFromBody } from '../../core/util';
import { logger } from '../../../../shared/logger';

export type RefillRequestResult = {
  success: boolean;
  error?: string;
}

export async function requestMedicationRefill(mychartRequest: MyChartRequest, medicationKey: string): Promise<RefillRequestResult> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/Clinical/Medications' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    logger.debug('Could not find request verification token for medication refill');
    return { success: false, error: 'Could not get verification token' };
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/medications/RequestRefill',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({ medicationKey }),
  });

  if (resp.status === 200) {
    return { success: true };
  }

  const text = await resp.text();
  return { success: false, error: `Refill request failed with status ${resp.status}: ${text}` };
}
