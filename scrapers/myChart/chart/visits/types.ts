/**
 * Raw MyChart responses for the `visits` scraper.
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
 * Endpoints: /visits/visitslist/loadpast, /visits/visitslist/loadupcoming
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** Repeated shape. Appears in: chart/visits. */
export type VisitDepartment = {
  Id?: string;
  Name?: string;
  Address?: string[];
  HasAddress?: boolean;
  PhoneNumber?: string;
  Instructions?: unknown[];
  ShouldShowInstructions?: boolean;
  TimeZone?: string;
  ArrivalLocation?: string;
  Specialty?: {
    Value?: string;
    Title?: string;
    TitleUtf8?: unknown;
    Abbreviation?: string;
  };
  CanShowDrivingDirections?: boolean;
  IsPreadmissionLocation?: boolean;
};

/** Repeated shape. Appears in: chart/visits. */
export type VisitOrganization = {
  OrganizationId?: string;
  OrganizationIdentifier?: unknown;
  RelatedOrganizations?: unknown;
  HasChildOrgs?: boolean;
  CELocationId?: unknown;
  CELocationHSI?: unknown;
  WebsiteName?: unknown;
  OrganizationName?: string;
  MyChartAppName?: unknown;
  SsnLabel?: unknown;
  IsLocal?: boolean;
  LogoUrl?: string;
  TermsAndConditionsUrl?: unknown;
  ProxyTermsAndConditionsUrl?: unknown;
  Address?: string[];
  DisplayAddress?: unknown;
  DiscreteAddress?: {
    StreetAddress?: string[];
    City?: string;
    State?: string;
    StateName?: string;
    Zip?: string;
    Country?: string;
  };
  ContactInformation?: unknown;
  UrlList?: unknown;
  IsSSO?: boolean;
  IncompleteH2GSetup?: boolean;
  LastEncounterInfo?: unknown;
  IsGeneric?: boolean;
  PayerOrgDetails?: {
    OrganizationId?: unknown;
    IsPayerOnly?: boolean;
    IsPayvider?: boolean;
    IsPayer?: boolean;
    IsPayerLicensedForMyChart?: boolean;
    PayerChildWebsiteName?: unknown;
    PayerDXO?: unknown;
    PayerCvgLogo?: unknown;
    PayerCvgLogoMagicId?: unknown;
    PayerCvgToken?: unknown;
    PayerCvgName?: unknown;
  };
  IsMyChartCentral?: boolean;
  IsSameOrganization?: boolean;
};

/** Repeated shape. Appears in: chart/visits. */
export type PayerOrgDetail = {
  OrganizationId?: unknown;
  IsPayerOnly?: boolean;
  IsPayvider?: boolean;
  IsPayer?: boolean;
  IsPayerLicensedForMyChart?: boolean;
  PayerChildWebsiteName?: unknown;
  PayerDXO?: unknown;
  PayerCvgLogo?: unknown;
  PayerCvgLogoMagicId?: unknown;
  PayerCvgToken?: unknown;
  PayerCvgName?: unknown;
};

/** Repeated shape. Appears in: chart/visits. */
export type VisitProvider = {
  EncryptedId?: string;
  Name?: string;
  Type?: number;
  PhotoUrl?: string;
  PhotoLink?: string | null;
  WebPageUrl?: string;
  HasPhotoOnBlob?: boolean;
  PhotoBlobToken?: string;
  IsPerson?: boolean;
  Department?: {
    Id?: string;
    Name?: string;
    Address?: string[];
    HasAddress?: boolean;
    PhoneNumber?: string;
    Instructions?: unknown[];
    ShouldShowInstructions?: boolean;
    TimeZone?: string;
    ArrivalLocation?: string;
    Specialty?: {
      Value?: string;
      Title?: string;
      TitleUtf8?: unknown;
      Abbreviation?: string;
    };
    CanShowDrivingDirections?: boolean;
    IsPreadmissionLocation?: boolean;
  };
  PhotoClass?: string;
};

/** Repeated shape. Appears in: chart/visits. */
export type Specialty = {
  Value?: string;
  Title?: string;
  TitleUtf8?: unknown;
  Abbreviation?: string;
};

/** Repeated shape. Appears in: chart/visits. */
export type DiscreteAddress = {
  StreetAddress?: string[];
  City?: string;
  State?: string;
  StateName?: string;
  Zip?: string;
  Country?: string;
};

/** `/visits/visitslist/loadpast` */
export type VisitsLoadPast = {
  ViewBagProperties?: {
    LoadingOrgNames?: string;
    ErrorOrgNames?: string;
    ManualOrgNames?: string;
  };
  SerializedIndex?: string;
  List?: Record<string, {
    ViewbagProperties?: Record<string, unknown>;
    Organization?: VisitOrganization;
    List?: Array<{
      HasPaymentFeature?: boolean;
      HasQuestionnaireFeature?: boolean;
      HasNewPvdFeature?: boolean;
      IsNotViewed?: boolean;
      IsViewStatusVisible?: boolean;
      IsClinicalNoteAvailable?: boolean;
      IsNotesOnly?: boolean;
      IsVisitAmbulatory?: boolean;
      FeedbackQnrIDs?: unknown[];
      IsAmbPastVisitDetailsEnabled?: boolean;
      IsAllIPSecurityPointsDisabled?: boolean;
      IsIPPastVisitDetailsEnabled?: boolean;
      IsPastVisitDetailsEnabled?: boolean;
      ShowVisitDetails?: boolean;
      PrimaryDate?: string;
      CsnForECheckIn?: string;
      UnverifiedProxyJumpUrl?: unknown;
      RescheduledDatString?: unknown;
      IsNoShow?: boolean;
      LeftWithoutSeen?: boolean;
      DischargeDate?: unknown;
      HasDownloadSummaryLink?: boolean;
      HasTransmitSummaryLink?: boolean;
      CanRedirectToApptDetails?: boolean;
      PastVisitBucket?: string;
      IsClinicalInformationAvailable?: boolean;
      OwnedBy?: number;
      /** Never captured populated; shape from the original hand-written types. */
      AdmissionDateRange?: { Start: string; End: string };
      IsApptDetailsEnabled?: boolean;
      IsRequestCancelEnabled?: boolean;
      IsDirectCancelEnabled?: boolean;
      IsRescheduleEnabled?: boolean;
      IsCopayEnabled?: boolean;
      IsVisitSummaryEnabled?: boolean;
      IsDownloadSummaryEnabled?: boolean;
      IsTransmitCEEnabled?: boolean;
      IsTransmitDirectEnabled?: boolean;
      IsDischargeInstrEnabled?: boolean;
      IsPatHandoutsEnabled?: boolean;
      IsIPReviewEnabled?: boolean;
      IsDischargeSummaryEnabled?: boolean;
      IsProviderLinkEnabled?: boolean;
      IsPreadmissionEnabled?: boolean;
      IsEcheckInCompleted?: boolean;
      Csn?: string;
      Id?: string;
      ReferenceID?: string;
      OrganizationLinks?: unknown[];
      PrimaryOrganizationLink?: unknown;
      Organization?: VisitOrganization;
      EncodedOrgID?: unknown;
      Month?: number;
      DateOfMonth?: string;
      Year?: string;
      IsLocal?: boolean;
      IsNonEpic?: boolean;
      IsSingleProvider?: boolean;
      /** Never captured populated; shape from the original hand-written types. */
      Telemedicine?: { IsTelemedicine: boolean; TelemedicineUrl: unknown; TelemedicineMode: number };
      /** Never captured populated; shape from the original hand-written types. */
      EVisit?: { IsEVisit: boolean };
      CanShowTelemedicine?: boolean;
      Dat?: string;
      Date?: string;
      Time?: string;
      IsClientTime?: boolean;
      ClientTimeZoneMarker?: string;
      EncounterType?: number;
      VisitTypeName?: string;
      Instant?: string;
      ArrivalTime?: unknown;
      CanShowArrivalTime?: boolean;
      EarlyArrivalReason?: unknown;
      DurationInMinutes?: unknown;
      HasDuration?: boolean;
      /** Never captured populated; shape from the original hand-written types. */
      Copay?: { Amount: string; IsPaid: boolean };
      CanShowPayments?: boolean;
      ShortDate?: string;
      IsTimeToBeDetermined?: boolean;
      IsHideVisitTime?: boolean;
      CanShowAppointmentTime?: boolean;
      TimeZone?: string;
      Providers?: VisitProvider[];
      OtherProviders?: unknown[];
      NumberOfOthers?: number;
      PrimaryProvider?: VisitProvider;
      PrimaryProviderName?: string;
      PrimaryDepartment?: VisitDepartment;
      CanRequestCancel?: boolean;
      IsCanceled?: boolean;
      CanReschedule?: boolean;
      RescheduledDat?: string;
      IsDetailsEnabled?: boolean;
      IsInHomeVisit?: boolean;
      ECheckIn?: unknown;
      CanShowECheckIn?: boolean;
      ShouldDeprecateECheckInBrand?: boolean;
      IsMultiPhaseOn?: boolean;
      CanShowECheckInComplete?: boolean;
      IsECheckInComplete?: boolean;
      HasChildrenNeedingECheckIn?: boolean;
      NextIncompleteVisitECheckInCsn?: unknown;
      IsEcheckInEnabled?: boolean;
      IsECheckInIncomplete?: boolean;
      CanECheckIn?: boolean;
      ShouldShowECheckInInGuideBanner?: boolean;
      CanShowAddToCalendar?: boolean;
      IsPastVisit?: boolean;
      HighlightDate?: string;
      IsDrivingDirectionsEnabled?: boolean;
      ConfirmationStatus?: number;
      IsConfirmed?: boolean;
      IsCancelRequestSent?: boolean;
      CanDirectlyCancel?: boolean;
      IsUsingFallbackVisitTypeName?: boolean;
      ChiefComplaint?: string;
      Diagnoses?: unknown;
      HasSentUpgradeRequest?: boolean;
      CanSendUpgradeRequest?: boolean;
      IsUserInitiatedArrivalAllowed?: boolean;
      SelfArrivalMechanism?: number;
      SelfArrivalBannerViewModel?: unknown;
      GeolocationArrival?: number;
      ArrivalStatus?: unknown;
      PatientNextStepInstructions?: string;
      ArrivalAdditionalActions?: unknown[];
      IsArrived?: boolean;
      IsProxyRequestMinorFormOn?: boolean;
      ProxyRequestMinorForm?: string;
      GuestPatientFirstName?: unknown;
      TelehealthMode?: number;
      IsUnverifiedOnDemandVideoVisit?: boolean;
      EncryptedLvvId?: unknown;
      InProgress?: boolean;
      IsResidentialMed?: boolean;
      ShowPFIOLink?: boolean;
      IsCEOptedIn?: boolean;
      UserMyChartStatus?: number;
      EncounterIsSurgery?: boolean;
      EncounterIsEDVisit?: boolean;
      IsPreadmission?: boolean;
      SurgeryTimeOfDay?: number;
      PreadmissionLocation?: unknown;
      /** Never captured populated; shape from the original hand-written types. */
      Cases?: { CaseId: string; Description: string }[];
      IsHovPreadmission?: boolean;
      HasProcedures?: boolean;
      NumberOfProcedures?: number;
      SurgicalProcedures?: unknown;
      /** Never captured populated; shape from the original hand-written types. */
      ComponentVisits?: { Csn: string; VisitTypeName: string; PrimaryDate: string }[];
      HasComponentVisits?: boolean;
      HasPaymentInfo?: boolean;
      IsFullyPaid?: boolean;
      CompleteECheckInCount?: number;
      TotalECheckInCount?: number;
      EpisodeDetails?: {
        GestationalAge?: string;
      };
    }>;
    ListSize?: number;
    HasMoreData?: boolean;
    CanSearch?: boolean;
    SkippedSomeResults?: boolean;
    SerializedIndex?: string;
  }>;
  CanSearch?: boolean;
  CanAllSearch?: boolean;
  CanSort?: boolean;
  AutoRenderThisSet?: boolean;
  SkippedSomeResults?: boolean;
  Organizations?: Record<string, VisitOrganization>;
};

/** `/visits/visitslist/loadupcoming` */
export type VisitsLoadUpcoming = {
  LaterVisitsList?: Array<{
    HasPaymentFeature?: boolean;
    HasQuestionnaireFeature?: boolean;
    HasNewPvdFeature?: boolean;
    PrimaryDate?: string;
    CsnForECheckIn?: string;
    UnverifiedProxyJumpUrl?: unknown;
    RescheduledDatString?: unknown;
    IsNoShow?: boolean;
    LeftWithoutSeen?: boolean;
    DischargeDate?: unknown;
    HasDownloadSummaryLink?: boolean;
    HasTransmitSummaryLink?: boolean;
    CanRedirectToApptDetails?: boolean;
    PastVisitBucket?: unknown;
    IsClinicalInformationAvailable?: boolean;
    OwnedBy?: number;
    /** Never captured populated; shape from the original hand-written types. */
    AdmissionDateRange?: { Start: string; End: string };
    IsApptDetailsEnabled?: boolean;
    IsRequestCancelEnabled?: boolean;
    IsDirectCancelEnabled?: boolean;
    IsRescheduleEnabled?: boolean;
    IsCopayEnabled?: boolean;
    IsVisitSummaryEnabled?: boolean;
    IsDownloadSummaryEnabled?: boolean;
    IsTransmitCEEnabled?: boolean;
    IsTransmitDirectEnabled?: boolean;
    IsDischargeInstrEnabled?: boolean;
    IsPatHandoutsEnabled?: boolean;
    IsIPReviewEnabled?: boolean;
    IsDischargeSummaryEnabled?: boolean;
    IsProviderLinkEnabled?: boolean;
    IsPreadmissionEnabled?: boolean;
    IsEcheckInCompleted?: boolean;
    Csn?: string;
    Id?: string;
    ReferenceID?: string;
    OrganizationLinks?: unknown[];
    PrimaryOrganizationLink?: unknown;
    Organization?: {
      OrganizationId?: string;
      OrganizationIdentifier?: unknown;
      RelatedOrganizations?: unknown;
      HasChildOrgs?: boolean;
      CELocationId?: unknown;
      WebsiteName?: unknown;
      OrganizationName?: string;
      MyChartAppName?: unknown;
      SsnLabel?: unknown;
      IsLocal?: boolean;
      LogoUrl?: string;
      TermsAndConditionsUrl?: unknown;
      ProxyTermsAndConditionsUrl?: unknown;
      Address?: string[];
      DisplayAddress?: unknown;
      ContactInformation?: unknown;
      UrlList?: unknown;
      IsSSO?: boolean;
      IncompleteH2GSetup?: boolean;
      LastEncounterInfo?: unknown;
      IsGeneric?: boolean;
      PayerOrgDetails?: PayerOrgDetail;
      IsMyChartCentral?: boolean;
      IsSameOrganization?: boolean;
    };
    EncodedOrgID?: unknown;
    Month?: number;
    DateOfMonth?: string;
    Year?: string;
    IsLocal?: boolean;
    IsNonEpic?: boolean;
    IsSingleProvider?: boolean;
    /** Never captured populated; shape from the original hand-written types. */
    Telemedicine?: { IsTelemedicine: boolean; TelemedicineUrl: unknown; TelemedicineMode: number };
    /** Never captured populated; shape from the original hand-written types. */
    EVisit?: { IsEVisit: boolean };
    CanShowTelemedicine?: boolean;
    Dat?: string;
    Date?: string;
    Time?: string;
    IsAM?: boolean;
    IsClientTime?: boolean;
    ClientTimeZoneMarker?: string;
    EncounterType?: number;
    VisitTypeName?: string;
    Instant?: string;
    ArrivalTime?: unknown;
    CanShowArrivalTime?: boolean;
    EarlyArrivalReason?: unknown;
    DurationInMinutes?: unknown;
    HasDuration?: boolean;
    /** Never captured populated; shape from the original hand-written types. */
    Copay?: { Amount: string; IsPaid: boolean };
    CanShowPayments?: boolean;
    ShortDate?: string;
    IsTimeToBeDetermined?: boolean;
    IsHideVisitTime?: boolean;
    CanShowAppointmentTime?: boolean;
    TimeZone?: string;
    Providers?: VisitProvider[];
    OtherProviders?: unknown[];
    NumberOfOthers?: number;
    PrimaryProvider?: VisitProvider;
    PrimaryProviderName?: string;
    PrimaryDepartment?: VisitDepartment;
    CanRequestCancel?: boolean;
    IsCanceled?: boolean;
    CanReschedule?: boolean;
    RescheduledDat?: string;
    IsDetailsEnabled?: boolean;
    IsInHomeVisit?: boolean;
    ECheckIn?: {
      Status?: {
        Value?: string;
        Title?: string;
        Abbreviation?: string;
      };
      IsNotStarted?: boolean;
      IsInProgress?: boolean;
      IsComplete?: boolean;
      Barcode?: string;
      HasBarcodeStep?: boolean;
      ClinicSteps?: unknown[];
      RequiredECheckInSteps?: unknown[];
      OptionalECheckInSteps?: unknown;
      UnavailableECheckInSteps?: unknown;
      HasQuestionnaireLink?: boolean;
      IsAdmission?: boolean;
      IsSurgery?: boolean;
      IsQnrAfterBarcode?: boolean;
      IsConfirmationView?: boolean;
      SignUpLink?: unknown;
      HasSignUpLink?: boolean;
      IsRequiredForTelemedicine?: boolean;
      CanShow?: boolean;
      HasPaymentECheckInStep?: boolean;
      HasQuestionnaireStep?: boolean;
      IsInHelloPatientWindow?: boolean;
      MultiPhaseOn?: boolean;
    };
    CanShowECheckIn?: boolean;
    ShouldDeprecateECheckInBrand?: boolean;
    CanShowECheckInComplete?: boolean;
    IsECheckInComplete?: boolean;
    NextIncompleteVisitECheckInCsn?: unknown;
    IsEcheckInEnabled?: boolean;
    IsECheckInIncomplete?: boolean;
    CanECheckIn?: boolean;
    ShouldShowECheckInInGuideBanner?: boolean;
    CanShowAddToCalendar?: boolean;
    IsPastVisit?: boolean;
    HighlightDate?: string;
    IsDrivingDirectionsEnabled?: boolean;
    ConfirmationStatus?: number;
    IsConfirmed?: boolean;
    IsCancelRequestSent?: boolean;
    CanDirectlyCancel?: boolean;
    IsUsingFallbackVisitTypeName?: boolean;
    ChiefComplaint?: string;
    Diagnoses?: unknown;
    HasSentUpgradeRequest?: boolean;
    CanSendUpgradeRequest?: boolean;
    IsUserInitiatedArrivalAllowed?: boolean;
    SelfArrivalMechanism?: number;
    SelfArrivalBannerViewModel?: unknown;
    GeolocationArrival?: number;
    ArrivalStatus?: number;
    PatientNextStepInstructions?: string;
    ArrivalAdditionalActions?: unknown[];
    IsProxyRequestMinorFormOn?: boolean;
    ProxyRequestMinorForm?: string;
    GuestPatientFirstName?: unknown;
    TelehealthMode?: number;
    IsUnverifiedOnDemandVideoVisit?: boolean;
    EncryptedLvvId?: unknown;
    InProgress?: boolean;
    IsResidentialMed?: boolean;
    ShowPFIOLink?: boolean;
    IsCEOptedIn?: boolean;
    UserMyChartStatus?: number;
    EncounterIsSurgery?: boolean;
    EncounterIsEDVisit?: boolean;
    IsPreadmission?: boolean;
    SurgeryTimeOfDay?: unknown;
    PreadmissionLocation?: unknown;
    /** Never captured populated; shape from the original hand-written types. */
    Cases?: { CaseId: string; Description: string }[];
    IsHovPreadmission?: boolean;
    HasProcedures?: boolean;
    NumberOfProcedures?: number;
    SurgicalProcedures?: unknown;
    /** Never captured populated; shape from the original hand-written types. */
    ComponentVisits?: { Csn: string; VisitTypeName: string; PrimaryDate: string }[];
    HasComponentVisits?: boolean;
    HasPaymentInfo?: boolean;
    IsFullyPaid?: boolean;
    CompleteECheckInCount?: number;
    TotalECheckInCount?: number;
  }>;
  NextNDaysVisits?: unknown[];
  InProgressVisits?: unknown[];
  HighlightDays?: string[];
  HasPVG?: boolean;
};
