/**
 * Raw MyChart responses for the `otherMyCharts` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /community/shared/loadcommunitylinks
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: chart/otherMyCharts. */
export type OtherMyChartPayerOrgDetail = {
  IsPayerOnly: boolean;
  IsPayvider: boolean;
  IsPayer: boolean;
  IsPayerLicensedForMyChart: boolean;
  PayerChildWebsiteName: string;
  PayerCvgLogo: string;
  PayerCvgToken: string;
  PayerCvgName: string;
  PayerCvgLogoMagicId: string;
};

/** `/community/shared/loadcommunitylinks` */
export type LoadCommunityLinks = {
  IsConsentNeeded: boolean;
  HideAskLater: boolean;
  HasSearchableOrgs: boolean;
  OrgList: Record<string, {
    OrganizationName: string;
    OrganizationId: string;
    CELocationId: string;
    RelatedOrganizations: unknown;
    HasChildOrgs: boolean;
    LinkType: number;
    LogoUrl: string;
    TermsAndConditionsUrl: string;
    ProxyTermsAndConditionsUrl: string;
    UserActionStatus: number;
    IsDisabled: boolean;
    ShowSignup: boolean;
    ShowSignUpUnavailableMessage: boolean;
    Accept: boolean;
    UserMyChartStatus: number;
    CanScheduleCrossOrgVideoVisit: boolean;
    IsSSO: boolean;
    IncompleteH2GSetup: boolean;
    LastEncounterDetail: {
      Patient: string;
      Physician: string;
      Department: string;
      Date: string;
      Time: string;
    };
    LastAccessTokenDateTime: unknown;
    DisplayAutoRefresh: boolean;
    DisplayAddress: string[];
    ShowUnavailableMsg: boolean;
    CurrentlyLoadingDxrData: boolean;
    ErrorLoadingDxrData: boolean;
    CanJump: boolean;
    HiddenFromMyChart: number;
    CanCreateCELink: boolean;
    InProgressOrgNotSeen: boolean;
    LinkErrorCode: string;
    HasValidRefreshToken: boolean;
    IsWithinThrottlingTime: boolean;
    ShouldRemindForUpdate: boolean;
    ShowInRefreshBanner: boolean;
    IsInvalidCeLink: boolean;
    InvalidLinkReason: number;
    InvalidLinkRetryDate: string;
    IsMyChartCentral: boolean;
    IdentityRelationship: number;
    H2GRemoteAuthLinkWorkflow: number;
    ShouldDisableLink: boolean;
    ErrorMessage: unknown;
    DisclaimerOverride: boolean;
    NeedCeAuth: boolean;
    IsPPOC: boolean;
    PayerOrgDetails: OtherMyChartPayerOrgDetail;
    NewSubjectList: unknown;
  }>;
  AutoQueryList: Record<string, unknown>;
  Spotlight: Array<{
    OrganizationName: string;
    ChildOrganizationName: string;
    OrganizationId: string;
    ChildId: string;
    LogoUrl: string;
    DisplayAddress: string[];
    ShowUnavailableMsg: boolean;
    UnavailableMsg: number;
    ShowAssociations: boolean;
    EpicStatus: boolean;
    PayerOrgDetails: OtherMyChartPayerOrgDetail;
    ShouldDisableLink: boolean;
    DisclaimerOverride: boolean;
  }>;
  H2GHasBeenViewed: boolean;
  CEOptOut: boolean;
  IsNPP: boolean;
  InProgressList: Record<string, unknown>;
  FhirUpdateFrequency: number;
  FhirSessionThrottlingTime: number;
  IsSelfVerified: boolean;
  ForwardedLinks: unknown[];
  HomeOrgName: string;
};
