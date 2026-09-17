/**
 * Linked accounts processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_linked_accounts`.
 *
 * `LoadCommunityLinks` returns `OrgList` as a map of ~50-field organization
 * records keyed by id; the standard object emits the map's values (the id is
 * on every row as `OrganizationId`). `LastEncounterDetail` is the one clinical
 * fact in the payload and is `null` on an organization with no visit.
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, num, rec, strings, textOrNull } from '../../processors/read';
import type { LoadCommunityLinks } from './mychart.types';
import type { LastEncounterDetailStandard, LinkedAccountsStandard } from './standardized.types';

export type { LastEncounterDetailStandard, LinkedAccountsStandard, LinkedOrganizationStandard } from './standardized.types';

function lastEncounterDetail(value: unknown): LastEncounterDetailStandard | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = rec(value);
  return {
    Patient: textOrNull(d.Patient),
    Physician: textOrNull(d.Physician),
    Department: textOrNull(d.Department),
    Date: textOrNull(d.Date),
    Time: textOrNull(d.Time),
  };
}

export const linkedAccountsProcessor: Processor<LinkedAccountsStandard> = {
  standard(raw: RawResponse): LinkedAccountsStandard {
    const body = rec<LoadCommunityLinks>(bodyOf(raw, 'LoadCommunityLinks'));
    return {
      HomeOrgName: textOrNull(body.HomeOrgName),
      CEOptOut: boolOrNull(body.CEOptOut),
      ForwardedLinks: list(body.ForwardedLinks),
      OrgList: Object.values(rec(body.OrgList)).map((value) => {
        const org = rec(value);
        return {
          OrganizationName: textOrNull(org.OrganizationName),
          LastEncounterDetail: lastEncounterDetail(org.LastEncounterDetail),
          OrganizationId: textOrNull(org.OrganizationId),
          LinkType: num(org.LinkType),
          UserActionStatus: num(org.UserActionStatus),
          UserMyChartStatus: num(org.UserMyChartStatus),
          DisplayAddress: strings(org.DisplayAddress),
          LastAccessTokenDateTime: textOrNull(org.LastAccessTokenDateTime),
          IsDisabled: boolOrNull(org.IsDisabled),
          IsInvalidCeLink: boolOrNull(org.IsInvalidCeLink),
          InvalidLinkReason: num(org.InvalidLinkReason),
          InvalidLinkRetryDate: textOrNull(org.InvalidLinkRetryDate),
          ErrorMessage: textOrNull(org.ErrorMessage),
          NeedCeAuth: boolOrNull(org.NeedCeAuth),
          LinkErrorCode: textOrNull(org.LinkErrorCode),
        };
      }),
    };
  },
  concise(standard) {
    return {
      OrgList: standard.OrgList.map((org) => ({
        OrganizationName: org.OrganizationName,
        LastEncounterDetail: org.LastEncounterDetail,
      })),
    };
  },
};
