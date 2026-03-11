import { MyChartRequest } from './myChartRequest';
import { getRequestVerificationTokenFromBody } from './util';

export type RefillRequestResult = {
  success: boolean;
  error?: string;
}

export async function requestMedicationRefill(mychartRequest: MyChartRequest, medicationKey: string): Promise<RefillRequestResult> {
  const pageResp = await mychartRequest.makeRequest({ path: '/Clinical/Medications' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    console.log('Could not find request verification token for medication refill');
    return { success: false, error: 'Could not get verification token' };
  }

  const resp = await mychartRequest.makeRequest({
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
