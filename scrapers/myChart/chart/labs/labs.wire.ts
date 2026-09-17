/**
 * Raw MyChart responses for the `labs` scraper.
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
 * Endpoints: /api/past-results/getmultiplehistoricalresultcomponents, /api/test-results/getdetails, /api/test-results/getlist
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: chart/labs. */
export type Narrative = {
  isRTF: boolean;
  hasContent: boolean;
  contentAsString: string;
  contentAsHtml: string;
  signingInstantTimestamp: string;
};

/** Repeated shape. Appears in: chart/labs. */
export type ReferenceRange = {
  low: number;
  high: number;
  displayLow: string;
  displayHigh: string;
  lowerBoundExclusive: boolean;
  upperBoundExclusive: boolean;
  formattedReferenceRange: string;
};

/** `/api/past-results/getmultiplehistoricalresultcomponents` */
export type GetMultipleHistoricalResultComponents = {
  historicalResults: Record<string, {
    oldestResultISO: string;
    hideGraph: boolean;
    showAbnormalFlag: boolean;
    historicalResultData: Array<{
      value: string;
      isValueRtf: boolean;
      numericValue: number;
      referenceRange: ReferenceRange;
      abnormalFlagCategoryValue: string;
      dateISO: string;
    }>;
    componentID: string;
    name: string;
    commonName: string;
    units: string;
  }>;
  orderedComponentIDs: string[];
  reportID: string;
  shouldShowBedsideActiveView: boolean;
};

/** `/api/test-results/getdetails` */
export type TestResultDetails = {
  orderName: string;
  key: string;
  results: Array<{
    name: string;
    key: string;
    showName: boolean;
    showDetails: boolean;
    orderMetadata: {
      orderProviderName: string;
      readingProviderName: string;
      resultTimestampDisplay: string;
      prioritizedInstantISO: string;
      prioritizedInstantDisplay: string;
      latestUpdateInstantISO: string;
      collectionTimestampsDisplay: string;
      specimensDisplay: string;
      resultStatus: string;
      resultingLab: {
        name: string;
        address: string[];
        phoneNumber: string;
        labDirector: string;
        cliaNumber: string;
        accreditationType: string;
      };
      resultType: string;
      read: string;
      associatedDiagnoses: string[];
    };
    resultComponents: Array<{
      componentInfo: {
        componentID: string;
        name: string;
        commonName: string;
        units: string;
      };
      componentResultInfo: {
        value: string;
        isValueRtf: boolean;
        numericValue: number;
        referenceRange: ReferenceRange;
        abnormalFlagCategoryValue: string;
      };
      componentComments: {
        isRTF: boolean;
        hasContent: boolean;
        contentAsString: string;
        contentAsHtml: string;
      };
    }>;
    studyResult: {
      narrative: Narrative;
      impression: Narrative;
      combinedRTFNarrativeImpression: Narrative;
      addenda: unknown[];
      isFullResultText: boolean;
      transcriptions: unknown[];
      ecgDiagnosis: unknown[];
      hasStudyContent: boolean;
    };
    shouldHideHistoricalData: boolean;
    resultNote: Narrative;
    hiddenProxies: string;
    reportDetails: {
      isDownloadablePDFReport: boolean;
      reportID: string;
      openRemotely: boolean;
      reportContext: string;
      reportVars: {
        ordId: string;
        ordDat: string;
      };
    };
    scans: unknown[];
    imageStudies: unknown[];
    indicators: unknown[];
    geneticProfileLink: string;
    shareEverywhereLogin: boolean;
    showProviderNotReviewed: boolean;
    providerComments: unknown[];
    resultLetter: Narrative;
    warningType: string;
    warningMessage: string;
    variants: unknown[];
    tooManyVariants: boolean;
    hasComment: boolean;
    hasAllDetails: boolean;
    isAbnormal: boolean;
    baseSingleMessageUrl: string;
    fullMultipleMessagesUrl: string;
    relatedConversationIds: unknown[];
  }>;
  orderLimitReached: boolean;
  ordersDeduplicated: boolean;
  isEnhancedAskAQuestionActive: boolean;
  hideEncInfo: boolean;
};

/** `/api/test-results/getlist` */
export type TestResultList = {
  areResultsFullyLoaded: boolean;
  isGroupingFullyLoaded: boolean;
  groupBy: string;
  newResultGroups: Array<{
    key: string;
    contactType: string;
    resultList: string[];
    isInpatient: boolean;
    isEDVisit: boolean;
    isCurrentAdmission: boolean;
    formattedAdmitDate: string;
    formattedDischargeDate: string;
    visitProviderID: string;
    organizationID: string;
    sortDate: string;
    admitInstant: {
      instantISO: string;
      includesTime: boolean;
    };
    dischargeInstant: {
      instantISO: string;
      includesTime: boolean;
    };
    formattedDate: string;
    isLargeGroup: boolean;
  }>;
  organizationLoadMoreInfo: Record<string, unknown>;
  newResults: Record<string, {
    name: string;
    key: string;
    showName: boolean;
    showDetails: boolean;
    orderMetadata: {
      orderProviderName: string;
      authorizingProviderName: string;
      authorizingProviderID: string;
      prioritizedInstantISO: string;
      prioritizedInstantDisplay: string;
      resultType: string;
      read: string;
    };
    resultComponents: unknown[];
    shouldHideHistoricalData: boolean;
    scans: unknown[];
    shareEverywhereLogin: boolean;
    showProviderNotReviewed: boolean;
    providerComments: unknown[];
    tooManyVariants: boolean;
    hasComment: boolean;
    hasAllDetails: boolean;
    isAbnormal: boolean;
  }>;
  newProviderPhotoInfo: Record<string, {
    name: string;
    empId: string;
    remoteEncrypted: boolean;
    photoUrl: string;
    providerId: string;
    organizationId: string;
  }>;
  newComments: Record<string, unknown>;
};
