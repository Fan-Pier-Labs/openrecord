import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { getRequestVerificationTokenFromBody } from '../../core/util';
import { emergencyContactsProcessor, type EmergencyContactsStandard } from './emergencyContacts.processor';

export type {
  EmergencyContactsStandard,
  EmergencyContactStandard,
  PhoneNumberStandard,
} from './emergencyContacts.processor';
export { emergencyContactsProcessor } from './emergencyContacts.processor';

export type EmergencyContactInput = {
  name: string;
  relationshipType: string;
  phoneNumber: string;
};

/**
 * Callers build this from optional capability args, so a field the user didn't
 * supply arrives as an explicit undefined. `updateEmergencyContact` keys the
 * outbound body off `!== undefined`, so those fields stay out of the payload.
 */
export type EmergencyContactUpdateInput = {
  id: string;
  name?: string | undefined;
  relationshipType?: string | undefined;
  phoneNumber?: string | undefined;
};

export type EmergencyContactResult = {
  success: boolean;
  error?: string;
};

const PERSONAL_INFORMATION = '/app/personal-information';

/** `GET /app/personal-information` for the token, then `POST /api/personalInformation/GetRelationships`. */
export async function fetchEmergencyContactsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken(PERSONAL_INFORMATION);
  await collector.postJson('/api/personalInformation/GetRelationships', token, {});
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function getEmergencyContacts(mychartRequest: MyChartRequest): Promise<EmergencyContactsStandard> {
  return emergencyContactsProcessor.standard(await fetchEmergencyContactsRaw(mychartRequest));
}

/** Token for the write endpoints below, or null when the page has none. */
async function getToken(mychartRequest: MyChartRequest): Promise<string | null> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: PERSONAL_INFORMATION });
  const html = await pageResp.text();
  return getRequestVerificationTokenFromBody(html) ?? null;
}

export async function addEmergencyContact(
  mychartRequest: MyChartRequest,
  input: EmergencyContactInput
): Promise<EmergencyContactResult> {
  const token = await getToken(mychartRequest);

  if (!token) {
    return { success: false, error: 'Could not get verification token' };
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/personalInformation/AddRelationship',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({
      name: input.name,
      relationshipType: input.relationshipType,
      phoneNumber: input.phoneNumber,
      isEmergencyContact: true,
    }),
  });

  if (resp.status === 200) {
    return { success: true };
  }

  const text = await resp.text();
  return { success: false, error: `Add failed with status ${resp.status}: ${text}` };
}

export async function updateEmergencyContact(
  mychartRequest: MyChartRequest,
  input: EmergencyContactUpdateInput
): Promise<EmergencyContactResult> {
  const token = await getToken(mychartRequest);

  if (!token) {
    return { success: false, error: 'Could not get verification token' };
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/personalInformation/UpdateRelationship',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({
      id: input.id,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.relationshipType !== undefined && { relationshipType: input.relationshipType }),
      ...(input.phoneNumber !== undefined && { phoneNumber: input.phoneNumber }),
      isEmergencyContact: true,
    }),
  });

  if (resp.status === 200) {
    return { success: true };
  }

  const text = await resp.text();
  return { success: false, error: `Update failed with status ${resp.status}: ${text}` };
}

export async function removeEmergencyContact(
  mychartRequest: MyChartRequest,
  id: string
): Promise<EmergencyContactResult> {
  const token = await getToken(mychartRequest);

  if (!token) {
    return { success: false, error: 'Could not get verification token' };
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/personalInformation/RemoveRelationship',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({ id }),
  });

  if (resp.status === 200) {
    return { success: true };
  }

  const text = await resp.text();
  return { success: false, error: `Remove failed with status ${resp.status}: ${text}` };
}
