import { MyChartRequest } from "./myChartRequest";
import { getRequestVerificationTokenFromBody } from "./util";

export type EmergencyContact = {
  name: string;
  relationshipType: string;
  phoneNumber: string;
  isEmergencyContact: boolean;
};

type RelationshipResponse = {
  name?: string;
  relationshipType?: string;
  phoneNumber?: string;
  isEmergencyContact?: boolean;
};

type GetRelationshipsResponse = {
  relationships?: RelationshipResponse[];
};

export async function getEmergencyContacts(mychartRequest: MyChartRequest): Promise<EmergencyContact[]> {
  const pageResp = await mychartRequest.makeRequest({ path: '/app/personal-information' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  if (!token) {
    console.log('Could not find request verification token for emergency contacts');
    return [];
  }

  const resp = await mychartRequest.makeRequest({
    path: '/api/personalInformation/GetRelationships',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({}),
  });

  const json: GetRelationshipsResponse = await resp.json();

  return (json.relationships || []).map((rel: RelationshipResponse) => ({
    name: rel.name || '',
    relationshipType: rel.relationshipType || '',
    phoneNumber: rel.phoneNumber || '',
    isEmergencyContact: rel.isEmergencyContact || false,
  }));
}
