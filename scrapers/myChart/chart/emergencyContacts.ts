import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../core/util";
import { logger } from '../../../shared/logger';

export type EmergencyContact = {
  id?: string;
  name: string;
  relationshipType: string;
  phoneNumber: string;
  isEmergencyContact: boolean;
};

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

// Real GetRelationships responses key the list as `contacts`, with the name
// under `formattedName`, the relationship under `relationToPatient` and the
// phone numbers under `contactInformation.phoneNumbers`. (An earlier version
// read a flat `relationships` array that only the fake served, so this
// scraper returned nothing against every real instance.) `isEmergencyContact`
// itself appears on only some instances; contacts listed here without it are
// treated as emergency contacts, which is what the page is for.
type RelationshipResponse = {
  id?: string;
  formattedName?: string;
  relationToPatient?: { name?: string };
  contactInformation?: {
    phoneNumbers?: Array<{ phoneNumber?: string; type?: string }>;
  };
  isEmergencyContact?: boolean;
};

type GetRelationshipsResponse = {
  contacts?: RelationshipResponse[];
};

async function getToken(mychartRequest: MyChartRequest): Promise<string | null> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/personal-information' });
  const html = await pageResp.text();
  return getRequestVerificationTokenFromBody(html) ?? null;
}

export async function getEmergencyContacts(mychartRequest: MyChartRequest): Promise<EmergencyContact[]> {
  const token = await getToken(mychartRequest);

  if (!token) {
    logger.debug('Could not find request verification token for emergency contacts');
    return [];
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/personalInformation/GetRelationships',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({}),
  });

  const json: GetRelationshipsResponse = await resp.json();

  return (json.contacts ?? []).map((rel: RelationshipResponse) => ({
    ...(rel.id && { id: rel.id }),
    name: rel.formattedName || '',
    relationshipType: rel.relationToPatient?.name || '',
    phoneNumber: rel.contactInformation?.phoneNumbers?.[0]?.phoneNumber || '',
    isEmergencyContact: rel.isEmergencyContact ?? true,
  }));
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
