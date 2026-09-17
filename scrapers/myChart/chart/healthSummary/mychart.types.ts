/**
 * Raw MyChart responses for the `healthSummary` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/health-summary/fetchh2gheader, /api/health-summary/fetchhealthsummary
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** Repeated shape. Appears in: chart/healthSummary. */
export type Department = {
  id?: string;
  name?: string;
  address?: string[];
  hasAddress?: boolean;
  phoneNumber?: string;
  instructions?: unknown[];
  shouldShowInstructions?: boolean;
  timeZone?: string;
  arrivalLocation?: string;
  specialty?: {
    value?: string;
    title?: string;
    abbreviation?: string;
  };
  canShowDrivingDirections?: boolean;
  isPreadmissionLocation?: boolean;
};

/** Repeated shape. Appears in: chart/healthSummary. */
export type Provider = {
  encryptedId?: string;
  name?: string;
  type?: number;
  photoUrl?: string;
  photoLink?: string;
  webPageUrl?: string;
  hasPhotoOnBlob?: boolean;
  photoBlobToken?: string;
  isPerson?: boolean;
  department?: {
    id?: string;
    name?: string;
    address?: string[];
    hasAddress?: boolean;
    phoneNumber?: string;
    instructions?: unknown[];
    shouldShowInstructions?: boolean;
    timeZone?: string;
    arrivalLocation?: string;
    specialty?: {
      value?: string;
      title?: string;
      abbreviation?: string;
    };
    canShowDrivingDirections?: boolean;
    isPreadmissionLocation?: boolean;
  };
  photoClass?: string;
};

/** Repeated shape. Appears in: chart/healthSummary. */
export type HealthSummarySpecialty = {
  value?: string;
  title?: string;
  abbreviation?: string;
};

/** Repeated shape. Appears in: chart/healthSummary. */
export type HealthSummaryOrganization = {
  organizationId?: string;
  hasChildOrgs?: boolean;
  organizationName?: string;
  isLocal?: boolean;
  logoUrl?: string;
  address?: string[];
  isSSO?: boolean;
  incompleteH2GSetup?: boolean;
  isGeneric?: boolean;
  payerOrgDetails?: {
    isPayerOnly?: boolean;
    isPayvider?: boolean;
    isPayer?: boolean;
    isPayerLicensedForMyChart?: boolean;
  };
  isMyChartCentral?: boolean;
  isSameOrganization?: boolean;
};

/** Repeated shape. Appears in: chart/healthSummary. */
export type LastVisit = {
  date?: string;
  visitType?: string;
  visitDetailsURL?: string;
  visitCategory?: string;
  openRemotely?: boolean;
  mode?: string;
};

/** `/api/health-summary/fetchh2gheader` */
export type FetchH2GHeader = {
  lastVisit?: LastVisit;
  nextVisit?: LastVisit;
  upcomingVisitsList?: Array<{
    hasPaymentFeature?: boolean;
    hasQuestionnaireFeature?: boolean;
    hasNewPvdFeature?: boolean;
    primaryDate?: string;
    csnForECheckIn?: string;
    isNoShow?: boolean;
    leftWithoutSeen?: boolean;
    hasDownloadSummaryLink?: boolean;
    hasTransmitSummaryLink?: boolean;
    canRedirectToApptDetails?: boolean;
    isClinicalInformationAvailable?: boolean;
    ownedBy?: number;
    isApptDetailsEnabled?: boolean;
    isRequestCancelEnabled?: boolean;
    isDirectCancelEnabled?: boolean;
    isRescheduleEnabled?: boolean;
    isCopayEnabled?: boolean;
    isVisitSummaryEnabled?: boolean;
    isDownloadSummaryEnabled?: boolean;
    isTransmitCEEnabled?: boolean;
    isTransmitDirectEnabled?: boolean;
    isDischargeInstrEnabled?: boolean;
    isPatHandoutsEnabled?: boolean;
    isIPReviewEnabled?: boolean;
    isDischargeSummaryEnabled?: boolean;
    isProviderLinkEnabled?: boolean;
    isPreadmissionEnabled?: boolean;
    isEcheckInCompleted?: boolean;
    csn?: string;
    id?: string;
    referenceID?: string;
    organizationLinks?: unknown[];
    organization?: HealthSummaryOrganization;
    month?: number;
    dateOfMonth?: string;
    year?: string;
    isLocal?: boolean;
    isNonEpic?: boolean;
    isSingleProvider?: boolean;
    canShowTelemedicine?: boolean;
    dat?: string;
    date?: string;
    time?: string;
    isAM?: boolean;
    isClientTime?: boolean;
    clientTimeZoneMarker?: string;
    encounterType?: number;
    visitTypeName?: string;
    instant?: string;
    canShowArrivalTime?: boolean;
    hasDuration?: boolean;
    canShowPayments?: boolean;
    shortDate?: string;
    isTimeToBeDetermined?: boolean;
    isHideVisitTime?: boolean;
    canShowAppointmentTime?: boolean;
    timeZone?: string;
    providers?: Provider[];
    otherProviders?: unknown[];
    numberOfOthers?: number;
    primaryProvider?: Provider;
    primaryProviderName?: string;
    primaryDepartment?: Department;
    canRequestCancel?: boolean;
    isCanceled?: boolean;
    canReschedule?: boolean;
    rescheduledDat?: string;
    isDetailsEnabled?: boolean;
    isInHomeVisit?: boolean;
    eCheckIn?: {
      status?: HealthSummarySpecialty;
      isNotStarted?: boolean;
      isInProgress?: boolean;
      isComplete?: boolean;
      barcode?: string;
      hasBarcodeStep?: boolean;
      clinicSteps?: unknown[];
      requiredECheckInSteps?: unknown[];
      hasQuestionnaireLink?: boolean;
      isAdmission?: boolean;
      isSurgery?: boolean;
      isQnrAfterBarcode?: boolean;
      isConfirmationView?: boolean;
      hasSignUpLink?: boolean;
      isRequiredForTelemedicine?: boolean;
      canShow?: boolean;
      hasPaymentECheckInStep?: boolean;
      hasQuestionnaireStep?: boolean;
      isInHelloPatientWindow?: boolean;
      multiPhaseOn?: boolean;
    };
    canShowECheckIn?: boolean;
    shouldDeprecateECheckInBrand?: boolean;
    canShowECheckInComplete?: boolean;
    isECheckInComplete?: boolean;
    isEcheckInEnabled?: boolean;
    isECheckInIncomplete?: boolean;
    canECheckIn?: boolean;
    shouldShowECheckInInGuideBanner?: boolean;
    canShowAddToCalendar?: boolean;
    isPastVisit?: boolean;
    highlightDate?: string;
    isDrivingDirectionsEnabled?: boolean;
    confirmationStatus?: number;
    isConfirmed?: boolean;
    isCancelRequestSent?: boolean;
    canDirectlyCancel?: boolean;
    isUsingFallbackVisitTypeName?: boolean;
    chiefComplaint?: string;
    hasSentUpgradeRequest?: boolean;
    canSendUpgradeRequest?: boolean;
    isUserInitiatedArrivalAllowed?: boolean;
    selfArrivalMechanism?: number;
    geolocationArrival?: number;
    arrivalStatus?: number;
    patientNextStepInstructions?: string;
    arrivalAdditionalActions?: unknown[];
    isProxyRequestMinorFormOn?: boolean;
    proxyRequestMinorForm?: string;
    telehealthMode?: number;
    isUnverifiedOnDemandVideoVisit?: boolean;
    inProgress?: boolean;
    isResidentialMed?: boolean;
    showPFIOLink?: boolean;
    isCEOptedIn?: boolean;
    userMyChartStatus?: number;
    encounterIsSurgery?: boolean;
    encounterIsEDVisit?: boolean;
    isPreadmission?: boolean;
    isHovPreadmission?: boolean;
    hasProcedures?: boolean;
    numberOfProcedures?: number;
    hasComponentVisits?: boolean;
    hasPaymentInfo?: boolean;
    isFullyPaid?: boolean;
    completeECheckInCount?: number;
    totalECheckInCount?: number;
  }>;
  pastVisitsList?: Array<{
    hasPaymentFeature?: boolean;
    hasQuestionnaireFeature?: boolean;
    hasNewPvdFeature?: boolean;
    isNotViewed?: boolean;
    isViewStatusVisible?: boolean;
    isClinicalNoteAvailable?: boolean;
    isNotesOnly?: boolean;
    isVisitAmbulatory?: boolean;
    feedbackQnrIDs?: unknown[];
    isAmbPastVisitDetailsEnabled?: boolean;
    isAllIPSecurityPointsDisabled?: boolean;
    isIPPastVisitDetailsEnabled?: boolean;
    isPastVisitDetailsEnabled?: boolean;
    showVisitDetails?: boolean;
    primaryDate?: string;
    csnForECheckIn?: string;
    isNoShow?: boolean;
    leftWithoutSeen?: boolean;
    hasDownloadSummaryLink?: boolean;
    hasTransmitSummaryLink?: boolean;
    canRedirectToApptDetails?: boolean;
    pastVisitBucket?: string;
    isClinicalInformationAvailable?: boolean;
    ownedBy?: number;
    isApptDetailsEnabled?: boolean;
    isRequestCancelEnabled?: boolean;
    isDirectCancelEnabled?: boolean;
    isRescheduleEnabled?: boolean;
    isCopayEnabled?: boolean;
    isVisitSummaryEnabled?: boolean;
    isDownloadSummaryEnabled?: boolean;
    isTransmitCEEnabled?: boolean;
    isTransmitDirectEnabled?: boolean;
    isDischargeInstrEnabled?: boolean;
    isPatHandoutsEnabled?: boolean;
    isIPReviewEnabled?: boolean;
    isDischargeSummaryEnabled?: boolean;
    isProviderLinkEnabled?: boolean;
    isPreadmissionEnabled?: boolean;
    isEcheckInCompleted?: boolean;
    csn?: string;
    id?: string;
    referenceID?: string;
    organizationLinks?: unknown[];
    organization?: HealthSummaryOrganization;
    month?: number;
    dateOfMonth?: string;
    year?: string;
    isLocal?: boolean;
    isNonEpic?: boolean;
    isSingleProvider?: boolean;
    canShowTelemedicine?: boolean;
    dat?: string;
    date?: string;
    time?: string;
    isAM?: boolean;
    isClientTime?: boolean;
    clientTimeZoneMarker?: string;
    encounterType?: number;
    visitTypeName?: string;
    instant?: string;
    canShowArrivalTime?: boolean;
    hasDuration?: boolean;
    canShowPayments?: boolean;
    shortDate?: string;
    isTimeToBeDetermined?: boolean;
    isHideVisitTime?: boolean;
    canShowAppointmentTime?: boolean;
    timeZone?: string;
    providers?: Provider[];
    otherProviders?: unknown[];
    numberOfOthers?: number;
    primaryProvider?: Provider;
    primaryProviderName?: string;
    primaryDepartment?: Department;
    canRequestCancel?: boolean;
    isCanceled?: boolean;
    canReschedule?: boolean;
    rescheduledDat?: string;
    isDetailsEnabled?: boolean;
    isInHomeVisit?: boolean;
    canShowECheckIn?: boolean;
    shouldDeprecateECheckInBrand?: boolean;
    canShowECheckInComplete?: boolean;
    isECheckInComplete?: boolean;
    isEcheckInEnabled?: boolean;
    isECheckInIncomplete?: boolean;
    canECheckIn?: boolean;
    shouldShowECheckInInGuideBanner?: boolean;
    canShowAddToCalendar?: boolean;
    isPastVisit?: boolean;
    highlightDate?: string;
    isDrivingDirectionsEnabled?: boolean;
    confirmationStatus?: number;
    isConfirmed?: boolean;
    isCancelRequestSent?: boolean;
    canDirectlyCancel?: boolean;
    isUsingFallbackVisitTypeName?: boolean;
    chiefComplaint?: string;
    hasSentUpgradeRequest?: boolean;
    canSendUpgradeRequest?: boolean;
    isUserInitiatedArrivalAllowed?: boolean;
    selfArrivalMechanism?: number;
    geolocationArrival?: number;
    patientNextStepInstructions?: string;
    arrivalAdditionalActions?: unknown[];
    isProxyRequestMinorFormOn?: boolean;
    proxyRequestMinorForm?: string;
    telehealthMode?: number;
    isUnverifiedOnDemandVideoVisit?: boolean;
    inProgress?: boolean;
    isResidentialMed?: boolean;
    showPFIOLink?: boolean;
    isCEOptedIn?: boolean;
    userMyChartStatus?: number;
    encounterIsSurgery?: boolean;
    encounterIsEDVisit?: boolean;
    isPreadmission?: boolean;
    isHovPreadmission?: boolean;
    hasProcedures?: boolean;
    numberOfProcedures?: number;
    hasComponentVisits?: boolean;
    hasPaymentInfo?: boolean;
    isFullyPaid?: boolean;
    completeECheckInCount?: number;
    totalECheckInCount?: number;
  }>;
};

/** `/api/health-summary/fetchhealthsummary` */
export type FetchHealthSummary = {
  header?: {
    patientAge?: string;
    height?: {
      value?: string;
      dateRecorded?: string;
    };
    weight?: {
      value?: string;
      dateRecorded?: string;
    };
    bloodType?: string;
  };
  isPatientAdmitted?: boolean;
  isProxyContext?: boolean;
  patientFirstName?: string;
  schoolReportInfo?: {
    schoolReportTitle?: string;
    schoolReportID?: string;
  };
  actionPlans?: unknown[];
  canAccessSharingHub?: boolean;
  quickLinkDictionary?: {
    HealthIssues?: string;
    Allergies?: string;
    Immunizations?: string;
    Visits?: string;
    PreventiveCare?: string;
    SchoolHealthSummary?: string;
    CareJourneyDetails?: string;
    SendAMessage?: string;
    CareTeam?: string;
    MyConditions?: string;
  };
  conditionList?: unknown[];
  journeyList?: unknown[];
};
