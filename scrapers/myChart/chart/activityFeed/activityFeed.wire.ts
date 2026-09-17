/**
 * Raw MyChart responses for the `activityFeed` scraper.
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
 * Endpoints: /api/item-feed/fetchitemfeed
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: chart/activityFeed. */
export type PrimaryAction = {
  uriId: string;
  uri: string;
  uriType: number;
  uriDisplayText: string;
  uriAccessibleText: string;
  uriIconKey: string;
  isHidden: boolean;
};

/** `/api/item-feed/fetchitemfeed` */
export type FetchItemFeed = {
  singleItemFeedViewModels: Array<{
    eptId: string;
    displayName: string;
    photoUrl: string;
    tabColor: number;
    zeroStateIconKey: string;
    isSelected: boolean;
    feedItems: Array<{
      phone: string;
      smsActive: boolean;
      allTextEnabled: boolean;
      email: string;
      allEmailEnabled: boolean;
      canEditInfo: boolean;
      displayText: string;
      type: string;
      defaultType: string;
      groupCount: number;
      priority: number;
      priorityInstant: number;
      iconKey: string;
      subiconKey: string;
      shouldShowWatermark: boolean;
      primaryAction: PrimaryAction;
      secondaryAction: PrimaryAction;
      tertiaryAction: {
        uriId: string;
        uriType: number;
        uriDisplayText: string;
        uriAccessibleText: string;
        uriIconKey: string;
        isHidden: boolean;
      };
      defaultAction: PrimaryAction;
      identifier: string;
      topicId: number;
      isH2GEnabled: boolean;
    }>;
  }>;
  linkedAccountsViewModel: {
    externalAlertWidget: {
      hasAlerts: boolean;
      isLoadingFailed: boolean;
      patientIndex: number;
      linkType: number;
      canAccessManageMyAccounts: boolean;
      skipSignup: boolean;
      isWaitingForResponse: boolean;
    };
    externalAlertsList: unknown[];
    noActionCommunityList: unknown[];
    inActiveCommunityList: Array<{
      organization: {
        organizationId: string;
        hasChildOrgs: boolean;
        organizationName: string;
        isLocal: boolean;
        logoUrl: string;
        address: string[];
        isSSO: boolean;
        incompleteH2GSetup: boolean;
        isGeneric: boolean;
        payerOrgDetails: {
          isPayerOnly: boolean;
          isPayvider: boolean;
          isPayer: boolean;
          isPayerLicensedForMyChart: boolean;
          payerChildWebsiteName: string;
          payerDXO: string;
          payerCvgLogo: string;
          payerCvgToken: string;
          payerCvgName: string;
        };
        isMyChartCentral: boolean;
        isSameOrganization: boolean;
      };
      payerOrgDetails: {
        isPayerOnly: boolean;
        isPayvider: boolean;
        isPayer: boolean;
        isPayerLicensedForMyChart: boolean;
        payerChildWebsiteName: string;
        payerCvgLogo: string;
        payerCvgToken: string;
        payerCvgName: string;
        payerCvgLogoMagicId: string;
      };
      userMyChartStatus: number;
      isSignupAllowed: boolean;
      hasCrossOrgVideoVisit: boolean;
    }>;
    subjectName: string;
    isNonPatient: boolean;
  };
};
