/**
 * What the `otherMyCharts` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface LastEncounterDetailStandard {
  Patient: string | null;
  Physician: string | null;
  Department: string | null;
  Date: string | null;
  Time: string | null;
}

export interface LinkedOrganizationStandard {
  OrganizationName: string | null;
  LastEncounterDetail: LastEncounterDetailStandard | null;
  OrganizationId: string | null;
  LinkType: number | null;
  UserActionStatus: number | null;
  UserMyChartStatus: number | null;
  DisplayAddress: string[];
  /** When the link last refreshed; says how stale the linked data is. */
  LastAccessTokenDateTime: string | null;
  IsDisabled: boolean | null;
  IsInvalidCeLink: boolean | null;
  InvalidLinkReason: number | null;
  InvalidLinkRetryDate: string | null;
  ErrorMessage: string | null;
  NeedCeAuth: boolean | null;
  LinkErrorCode: string | null;
}

export interface LinkedAccountsStandard {
  HomeOrgName: string | null;
  CEOptOut: boolean | null;
  /** Uncaptured element shape (`[]` on every capture); passed through whole. */
  ForwardedLinks: unknown[];
  OrgList: LinkedOrganizationStandard[];
}
