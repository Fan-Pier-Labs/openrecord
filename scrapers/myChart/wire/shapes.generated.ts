// GENERATED from fake-mychart/src/data/realShapes.ts — do not edit by hand.
// Regenerate with `bun run wire-types`; `bun run wire-types --check` fails on drift.
//
// What MyChart answered on the instances we captured, as TypeScript. A leaf
// typed `unknown` is one the captures never saw carry a value (it was null, or
// its array was always empty) — not a licence to assume anything about it.
//
// These describe observed behaviour on three instances, not a contract. Read a
// payload through the readers in ../processors/read.ts, which never throw; do
// not assert a payload into one of these with `as`.

/** `/Scheduling/Anonymous/GetSchedulingWorkflowData` */
export type AnonymousSchedulingWorkflowData = {
  WorkflowSettings: {
    WorkflowType: number;
    FromMinutesOffset: unknown;
    FromDaysOffset: number;
    ToDaysOffset: number;
    NewProvFromDaysOffset: number;
    NewProvToDaysOffset: number;
    TicketId: unknown;
    Csn: unknown;
    RootDecisionTreeId: string;
    DecisionTreeNodeId: string;
    DecisionTreeAnswerId: unknown;
    DecisionTreeNodeCsn: string;
    AllowedProviderIds: unknown;
    PreselectedProviderIds: unknown;
    AllowedDepartmentIds: unknown;
    PreselectedDepartmentIds: unknown;
    PreselectedPatientType: number;
    AllowedReasonForVisitIds: unknown;
    AllowedVisitTypeIds: unknown;
    PreselectedReasonForVisitIds: unknown;
    AllowedSpecialtyIds: unknown[];
    PreselectedSpecialtyId: unknown;
    PreselectedSlotUID: unknown;
    PromotedSpecialtyIds: string[];
    StartDate: unknown;
    EndDate: unknown;
    CampaignId: string;
    LinkSource: unknown;
    ReferringPage: unknown;
    TermIds: unknown;
    InsuranceId: unknown;
    ProviderStepSettings: {
      ReadOnly: boolean;
      Hide: boolean;
      HideIfOne: boolean;
      Collapse: boolean;
      CollapseIfOne: boolean;
    };
    DepartmentStepSettings: {
      ReadOnly: boolean;
      Hide: boolean;
      HideIfOne: boolean;
      Collapse: boolean;
      CollapseIfOne: boolean;
    };
    ReasonForVisitStepSettings: {
      ReadOnly: boolean;
      Hide: boolean;
      HideIfOne: boolean;
      Collapse: boolean;
      CollapseIfOne: boolean;
    };
    QuickScheduleStepSettings: unknown;
    SpecialtyStepSettings: {
      ReadOnly: boolean;
      Hide: boolean;
      HideIfOne: boolean;
      Collapse: boolean;
      CollapseIfOne: boolean;
    };
    DateRangeSettings: unknown;
    TimePreferences: unknown;
    UseOnFileTimePreferences: boolean;
    SchedulePreferences: {
      Days: unknown[];
      Times: unknown[];
      TimeStrings: unknown[];
    };
    DaysOfWeekList: string[];
    PreselectedFilters: unknown[];
    AvailableFilters: unknown[];
    AllowTeamScheduling: number;
    ShowTeamBeforeSearch: number;
    SchedulingVerificationSteps: unknown;
    AllowODVVComments: boolean;
    RequireODVVComments: boolean;
    RequireRequestComments: boolean;
    ShowOtherProviderOption: boolean;
    ShowOtherRfvOption: boolean;
    MaxCommentsLength: number;
    RequireECheckInForTelemedicine: boolean;
    MultiPhaseECheckInOn: boolean;
    AllowOpenSchedulingWizard: boolean;
    CanShowProviderFinderDefaultLink: boolean;
    CanShowLocationFinderDefaultLink: boolean;
    AllowOnMyWay: boolean;
    DisableFavoriteAppointments: boolean;
    RequestReasons: unknown[];
    RequireRescheduleReason: boolean;
    RescheduleReasons: Array<{
      Value: string;
      Number: string;
      Title: string;
      Abbreviation: string;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: string;
      AbbreviationUtf8: string;
      IsFallbackUsed: boolean;
    }>;
    LocationGroupMethod: number;
    LocationGroupingBehavior: number;
    ProviderNameDisplayFormat: number;
    Viewers: unknown[];
    AllowSelectViewers: boolean;
    ShowViewers: boolean;
    ShowInsuranceVerificationStep: boolean;
    ShowDemographicVerificationStep: boolean;
    HasOnDemandVideoVisitSecurity: boolean;
    ShowVideoVisitSidebar: boolean;
    HasQuickScheduleSecurity: boolean;
    ShowEVisitSidebar: boolean;
    HasAppointmentDetailsSecurity: boolean;
    HasProviderDetailsSecurity: boolean;
    IsAlwaysSelfPay: boolean;
    ShowSidebarLinks: boolean;
    GeolocationNumLocationsToSelect: number;
    GeolocationInnerRadius: number;
    GeolocationOuterRadius: number;
    MaxOpenSchedulingApptCount: number;
    CurrentDTE: number;
    IsReservationAllowed: boolean;
    GeolocationDistanceUnits: number;
    GeolocationStreetAddress: unknown[];
    Banners: unknown[];
    AllowSelfSignup: boolean;
    IsLoginEnabled: boolean;
    TopicIds: unknown[];
    TopicNames: unknown[];
    IsWorkflowTurnedOn: boolean;
    IsSortingByAvailability: boolean;
    ServiceAreas: unknown;
    StringKey: unknown;
    DisableScheduleAsGuest: boolean;
    DefaultProviderLanguages: unknown[];
    IsStandaloneWidget: boolean;
    IsFromPrelogin: boolean;
    IsFromShopperState: boolean;
    HasSeparateLocationSelectionInTicketBundles: boolean;
    IsPatientLocationStepRequired: boolean;
    AccessCode: unknown;
    IsProxy: boolean;
    ProxyContextName: unknown;
    IsAdminLoginFromHyperspace: boolean;
    SkipMobileLogout: boolean;
    AllowMobileSchedulingInlineRedirects: boolean;
    HasPatientLocationRule: boolean;
    EmbeddedConsecutiveSlotLoadLimit: number;
    CanUseCadenceAppointmentRequests: boolean;
    IsInSchedulingDebugMode: boolean;
    DebugModeBanner: unknown;
    SourceWorkflow: number;
    HideBackNavigation: boolean;
    IsDemoMode: boolean;
    FinderType: unknown;
  };
  Providers: unknown[];
  Departments: unknown[];
  Locations: unknown[];
  TelehealthLocations: unknown;
  HomeOrganizationName: string;
  ProviderDepartmentPairs: unknown[];
  ReasonsForVisit: unknown[];
  ReasonForVisitDepartmentOverrides: unknown[];
  VisitTypes: unknown[];
  ActionPreviews: unknown[];
  VisitTypeDepartmentOverrides: unknown[];
  Specialties: Array<{
    Id: string;
    Name: string;
    HelpText: unknown;
    PhotoUrl: unknown;
    StandardSpecialtyValue: unknown;
  }>;
  Tickets: unknown[];
  OrderMap: Record<string, unknown>;
  OriginalAppointmentInfo: {
    BundleId: unknown;
    FromDte: unknown;
    ToDte: unknown;
    Dat: unknown;
    SingleReasonForVisitId: unknown;
    BundleReasonForVisitId: unknown;
    OriginalAppointments: unknown;
    IsForceSameDay: boolean;
  };
  OnDemandTelehealthData: {
    TelehealthLocations: Array<{
      Number: string;
      Value: string;
      Title: string;
      Abbreviation: string;
      SelectedByDefault: boolean;
      SubLocations: unknown[];
      ID: unknown;
      Name: unknown;
      NameUTF8: unknown;
    }>;
    VideoVisitWaitTime: unknown;
    OnDemandVideoVisitCSN: unknown;
    XOrgId: unknown;
    XOrgCSN: unknown;
    ExistingVideoVisitCSN: unknown;
    ExistingVideoVisitProviders: unknown;
    ShowEmailOption: boolean;
    ShowSMSOption: boolean;
    CheckEmailOption: boolean;
    CheckSMSOption: boolean;
    EmailAddress: unknown;
    PhoneNumber: unknown;
    AreNewODVVsEnabled: boolean;
    IsPushNotificationEnabled: boolean;
    IsXOrgEnabled: boolean;
    InXOrgQueue: boolean;
    OnDemandVideoVisitError: boolean;
    HideInsuranceStepForXOrg: boolean;
    HideSchedulingOptions: boolean;
    ExpandSplashPageByDefault: boolean;
    HideEstimatedWait: boolean;
    HideEstimatedCost: boolean;
    ShowEstimatedCostForXORG: boolean;
    RequireLocationConfirmation: boolean;
    HomeLogoURL: unknown;
  };
  FavoriteAppointments: unknown[];
  SchedulingMenusViewModels: unknown[];
  LoadError: unknown;
  IsWidget: boolean;
  PreselectedTicketStatus: number;
  OtherRfvUrl: unknown;
  OtherRfvFilename: string;
};

/** `/Scheduling/Anonymous/GetSpecialtyData` */
export type AnonymousSpecialtyData = {
  WorkflowSettings: unknown;
  Providers: Array<{
    Name: string;
    NameLastFirst: string;
    BioSlug: string;
    BioId: string;
    PcpType: unknown;
    SpecialtyIds: string[];
    Specialties: Array<{
      Value: string;
      Number: string;
      Title: string;
      Abbreviation: string;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: string;
      AbbreviationUtf8: string;
      IsFallbackUsed: boolean;
    }>;
    PhotoUrl: string;
    WebPageUrl: string;
    AllowedTelemedicineLocations: string;
    PhotoClass: string;
    IsStandardProvider: boolean;
    IsPCP: boolean;
    TeamProviders: Array<{
      ProviderId: string;
      DepartmentId: string;
      ChildProviderIds: unknown[];
      IsTeamMember: boolean;
      CanRequest: boolean;
      CanScheduleTelemedicine: boolean;
      CanLoginToSchedule: boolean;
      VisitTypeInformation: unknown[];
      IsInNetwork: boolean;
      PoolLine: unknown;
      PoolTier: unknown;
    }>;
    Languages: unknown[];
    Gender: string;
    Credentials: string;
    ClinicalInterests: unknown[];
    Affiliations: unknown;
    ID: string;
    NameUTF8: unknown;
  }>;
  Departments: Array<{
    Name: string;
    Address: string[];
    Coordinates: {
      Latitude: number;
      Longitude: number;
    };
    PhoneNumber: string;
    OverridePhoneNumber: string;
    IsUsingOverridePhoneNumber: boolean;
    TimeZone: {
      CacheTimeZone: {
        Value: unknown;
        Number: string;
        Title: string;
        Abbreviation: unknown;
        Abbr: string;
        Comment: string;
        IsInactive: boolean;
        TitleUtf8: unknown;
        AbbreviationUtf8: unknown;
        IsFallbackUsed: boolean;
      };
      DisplayName: string;
    };
    FromMinutesOffset: unknown;
    FromDaysOffset: number;
    ToDaysOffset: number;
    LookbackDays: number;
    AllowTeamScheduling: unknown;
    AllowAppointmentRequest: boolean;
    DistanceFromHome: unknown;
    SpecialtyGroupId: string;
    IsEnabledForNewProviderWorkflow: boolean;
    HoursOfOperation: unknown[];
    PhotoUrl: string;
    CanLoginToSchedule: boolean;
    ID: string;
    NameUTF8: unknown;
  }>;
  Locations: Array<{
    Name: string;
    Address: unknown[];
    Coordinates: {
      Latitude: unknown;
      Longitude: unknown;
    };
    DistanceFromHome: unknown;
    DepartmentIds: string[];
    ID: string;
    NameUTF8: unknown;
  }>;
  TelehealthLocations: unknown;
  HomeOrganizationName: string;
  ProviderDepartmentPairs: Array<{
    ProviderId: string;
    DepartmentId: string;
    ChildProviderIds: unknown[];
    IsTeamMember: boolean;
    CanRequest: boolean;
    CanScheduleTelemedicine: boolean;
    CanLoginToSchedule: boolean;
    VisitTypeInformation: Array<{
      SeesChildren: string;
      SeesAdolescents: string;
      VisitTypeID: string;
    }>;
    IsInNetwork: boolean;
    PoolLine: unknown;
    PoolTier: unknown;
  }>;
  ReasonsForVisit: Array<{
    Id: string;
    CategoryValue: string;
    Title: string;
    DisplayName: string;
    CanDirectSchedule: boolean;
    CanRequest: boolean;
    CanRequestWithoutOverrides: boolean;
    DefaultVisitTypeId: string;
    AllowProviderSelect: boolean;
    ReasonForVisitFirst: boolean;
    ProviderFirst: boolean;
    ProviderDisplayString: unknown;
    LocationDisplayString: unknown;
    NumberOfAvailableProviders: number;
    NumberOfAvailableLocations: number;
    ProviderIds: unknown;
    DepartmentIds: unknown;
    DirectProviderDepartmentPairIDs: string[];
    RequestProviderDepartmentPairIDs: unknown[];
    QuickScheduleProviderDepartmentPairIDs: unknown[];
    RawApptComponents: unknown;
    ApptComponentItems: {
      FromDte: number;
      ExpirationDte: number;
    };
    PhotoUrl: unknown;
    PhotoFileName: string;
    SortOrder: number;
    AppointmentRequestIds: unknown[];
    AccessCode: unknown;
    AccessCodeFirstName: unknown;
    IsDemographicAuthRequired: boolean;
    SpecialtyGroupId: string;
    EnabledForOnDemandVideoVisits: boolean;
    TelemedicineVendorId: unknown;
    TelemedicineVisitTypeId: unknown;
    ScheduledTelemedicineVendorId: unknown;
    OnDemandTelemedicineVendorId: unknown;
    TelemedicineHardwareTestFdiId: unknown;
    UseDeepLinkForHardwareTest: boolean;
    TelemedicineMobileHardwareTestFdiId: unknown;
    EnabledForQuickSchedule: boolean;
    AllowedTelemedicineLocations: unknown;
    AvailablePlatformsForLocalQuickSchedule: unknown;
    AvailablePlatformsForLocalOnDemand: unknown;
    InternallyAvailableForTelehealth: boolean;
    ExternallyAvailableForTelehealth: boolean;
    OnDemandRFV: unknown;
    OnDemandOrganization: unknown;
    OnDemandSlot: unknown;
    LineInWDF40040: unknown;
    LineInWDF15000: unknown;
    InitiallyHidden: boolean;
    Description: string;
    IconCategoryId: number;
    CustomImage: string;
    HasIncompleteSchedulingData: boolean;
    ExpectedPatientType: number;
    HasPool: boolean;
    Pool: unknown;
    IconImageUrl: unknown;
    IsPlaceholder: boolean;
  }>;
  ReasonForVisitDepartmentOverrides: Array<{
    ReasonForVisitId: string;
    DepartmentId: string;
    VisitTypeId: string;
    CanDirectSchedule: boolean;
    CanRequest: boolean;
  }>;
  VisitTypes: Array<{
    Name: unknown;
    DisplayName: string;
    AllowProviderSelect: boolean;
    AllowChangeProvAndLocInResched: boolean;
    DefaultTelehealthMode: number;
    AllowedTelehealthModes: number[];
    TelehealthModeDisplayNames: {
      "1": string;
      "2": string;
    };
    SchedulingInstructions: unknown[];
    QuestionnaireId: string;
    DecisionTreeId: string;
    AnonymousSchedulingDecisionTreeId: string;
    CustomStepBodyKey: unknown;
    CustomStepHeader: unknown;
    CustomStepContinueButtonText: unknown;
    FromMinutesOffset: unknown;
    FromDaysOffset: unknown;
    ToDaysOffset: unknown;
    AllowTeamScheduling: unknown;
    IsAdvanced: boolean;
    IsConditionalPanel: unknown;
    CanLoadMoreTiers: boolean;
    TierSearchRange: unknown;
    Tier: unknown;
    PoolLine: unknown;
    IsPlaceholder: boolean;
    ShowPanelAsMultipleVisits: boolean;
    MenuLinkUri: string;
    MenuLinkCompleteUri: unknown;
    DataAttributes: unknown;
    HasSeparateLocationSelectionInPanels: boolean;
    ShowLocationStepForTelehealthVisit: boolean;
    AllowProviderStepInDirectSched: boolean;
    ActionPreviews: unknown[];
    ID: string;
    NameUTF8: unknown;
  }>;
  ActionPreviews: unknown[];
  VisitTypeDepartmentOverrides: Array<{
    VisitTypeId: string;
    DepartmentId: string;
    FromMinutesOffset: unknown;
    FromDaysOffset: number;
    ToDaysOffset: number;
    AllowTeamScheduling: number;
  }>;
  Specialties: unknown[];
  Tickets: unknown[];
  OrderMap: Record<string, unknown>;
  OriginalAppointmentInfo: {
    BundleId: unknown;
    FromDte: unknown;
    ToDte: unknown;
    Dat: unknown;
    SingleReasonForVisitId: unknown;
    BundleReasonForVisitId: unknown;
    OriginalAppointments: unknown;
    IsForceSameDay: boolean;
  };
  OnDemandTelehealthData: unknown;
  FavoriteAppointments: unknown[];
  SchedulingMenusViewModels: unknown[];
  LoadError: unknown;
  IsWidget: boolean;
  PreselectedTicketStatus: number;
  OtherRfvUrl: unknown;
  OtherRfvFilename: string;
};

/** `/billing/details/getvisits` */
export type BillingGetVisits = {
  Success: boolean;
  Data: {
    VisitList: unknown[];
    VisitListAmount: string;
    BadDebtVisitList: unknown[];
    BadDebtVisitListAmount: string;
    PaymentPlanVisitList: unknown[];
    PaymentPlanVisitListAmount: string;
    PaymentPlanVisitListAutoPayAmount: unknown;
    PaymentPlanVisitListScheduledDate: unknown;
    EstimatedPaymentPlanBalance: unknown;
    PaymentPlanVisitListPostResolutionAmount: string;
    NotPaymentPlanVisitList: unknown[];
    NotPaymentPlanVisitListAmount: string;
    AdvanceBillVisitList: unknown[];
    AdvanceBillVisitListAmount: string;
    InformationalVisitList: unknown[];
    NoBalanceVisitList: unknown[];
    AdjustmentVisitList: unknown[];
    AdjustmentVisitListAmount: string;
    VisitAutoPayVisitList: unknown[];
    VisitAutoPayVisitListAmount: string;
    UnifiedVisitList: Array<{
      GroupType: number;
      Index: number;
      BillingSystem: number;
      IsSBO: boolean;
      BillingSystemDisplay: string;
      AdjustmentsOnly: boolean;
      DateRangeDisplay: unknown;
      StartDate: number;
      StartDayOfMonth: number;
      StartMonth: number;
      StartYear: number;
      StartDateDisplay: string;
      StartDateAccessibleText: string;
      Description: string;
      Patient: string;
      Provider: string;
      ProviderId: unknown;
      HospitalAccountDisplay: string;
      HospitalAccountId: string;
      SuppressDayFromDate: boolean;
      CanAddToPaymentPlan: boolean;
      PrimaryPayer: string;
      IsLTCSeries: boolean;
      ChargeAmount: string;
      SurchargeAmount: unknown;
      TaxOrSurcharge: number;
      InsuranceAmountDue: string;
      InsuranceAmountDueRaw: number;
      SelfAmountDue: string;
      SelfAmountDueRaw: number;
      IsPatientNotResponsible: boolean;
      PatientNotResponsibleYet: boolean;
      InsurancePaymentAmount: string;
      InsuranceEstimatedPaymentAmount: unknown;
      SelfPaymentAmount: string;
      SelfAdjustmentAmount: unknown;
      SelfDiscountAmount: unknown;
      ContestedChargeAmount: unknown;
      ContestedPaymentAmount: unknown;
      ShowInsurancePendingHelp: boolean;
      ShowInsuranceCoveredHelp: boolean;
      SelfPaymentPlanAmountDue: unknown;
      SelfPaymentPlanAmountDueRaw: number;
      SuppressProcedureAmount: boolean;
      AdjustmentSuppressionSetting: number;
      IsExpanded: boolean;
      AlwaysShowDetails: boolean;
      BlockExpanding: boolean;
      ProcedureList: Array<{
        BillingSystem: number;
        Description: string;
        Amount: string;
        PaymentList: unknown;
        InsuranceAmountDue: unknown;
        SelfAmountDue: string;
        HasAmountDue: boolean;
        SelfBadDebtAmount: unknown;
        HasBadDebtAmount: boolean;
        AdjustmentsOnly: boolean;
        IsContested: boolean;
      }>;
      ProcedureGroupList: Array<{
        VisitIndex: number;
        VisitGroupType: number;
        Description: unknown;
        Amount: string;
        ProcedureList: unknown;
        PaymentList: Array<{
          ID: unknown;
          ElementID: unknown;
          Index: unknown;
          DayOfMonth: number;
          Month: number;
          Year: number;
          FormattedDateDisplay: unknown;
          Description: string;
          SubText: unknown;
          HtmlSubText: unknown;
          PaymentAmountDisplay: string;
          UndistributedAmountDisplay: unknown;
          CoverageInfo: unknown;
          Receipt: unknown;
          IsBadDebtAdj: boolean;
          IsWriteOffAdj: boolean;
          IsSurchargeAdj: boolean;
          CanEdit: boolean;
          EditPaymentOptions: unknown;
          CanCancel: boolean;
          CancelCommandOptions: unknown;
          ConsentDocument: unknown;
          ViewConsentOptions: unknown;
          IsCardExpiringSoon: boolean;
          HasCardExpired: boolean;
        }>;
        EstPlanPaymentList: unknown[];
        HasEstPlanList: boolean;
        IsPaymentsOnly: boolean;
        HasPaymentsTowardsEstimates: boolean;
        HasContestedProcedures: boolean;
        IsExpanded: boolean;
        AlwaysShowDetails: boolean;
      }>;
      CoverageInfoList: Array<{
        CoverageName: string;
        Billed: string;
        Covered: string;
        PendingInsurance: unknown;
        RemainingResponsibility: string;
        Copay: string;
        Deductible: unknown;
        Coinsurance: unknown;
        NotCovered: unknown;
        Benefits: Array<{
          Name: string;
          Amount: string;
        }>;
        ShowInsuranceCoveredHelp: boolean;
        ShowInsurancePendingHelp: boolean;
      }>;
      ShowCoverageHelp: boolean;
      VisitAutoPay: unknown;
      ShowVisitAutoPay: boolean;
      LevelOfDetailLoaded: number;
      SelfBadDebtAmount: unknown;
      SelfBadDebtAmountRaw: number;
      IsClosedHospitalAccount: boolean;
      IsBadDebtVisit: boolean;
      IsContestedHAR: boolean;
      IsPaymentPlanEstimate: boolean;
      IsResolvedEstimatedPPAccount: boolean;
      NotOnPlanAmount: unknown;
      NotOnPlanAmountRaw: number;
      EmptyVisitEstimateID: unknown;
      EstimateInfo: unknown;
      PatFriendlyAccountStatus: number;
      VisitBadDebtScenario: number;
      IsUnpayableHAR: boolean;
      PatFriendlyAccountStatusAccessibleText: string;
      VisitStatusesEqualToClosed: number[];
      IsOnPaymentPlan: boolean;
      IsNotOnPaymentPlan: boolean;
      AgencyInformation: {
        Name: string;
        PhoneNumber: string;
        AgencyID: number;
      };
      AgencyInformationDescription: unknown;
    }>;
    ContestedVisitList: unknown[];
    ContestedVisitListAmount: string;
    HasVisits: boolean;
    ShowingAll: boolean;
    HasUnconvertedPBVisits: boolean;
    CanMakePayment: boolean;
    CanEditPaymentPlan: boolean;
    URLMakePayment: unknown;
    URLEditPaymentPlan: unknown;
    Filters: {
      FilterClass: string;
      Options: Array<{
        OptionClass: string;
        OptionLabel: string;
      }>;
    };
    PartialPaymentPlanAlert: {
      Code: number;
      Banner: {
        HeaderText: string;
        DetailText: string;
        AssistiveText: string;
        ButtonLabel: string;
        ButtonAssistiveText: string;
        ButtonUrl: string;
        ButtonID: unknown;
        ButtonClass: unknown;
        ButtonData: unknown;
        TelephoneLink: unknown;
        ButtonLabelSecondary: unknown;
        ButtonUrlSecondary: unknown;
        ButtonIDSecondary: unknown;
        ButtonClassSecondary: unknown;
        ButtonAriaDescribedByContentSecondary: unknown;
        ButtonAriaDescribedByIdSecondary: unknown;
        ButtonDataSecondary: unknown;
        DisableDetailTextHtmlEncoding: boolean;
        BannerType: string;
        BannerTypeReact: string;
        IconOverride: string;
        IconAltTextOverride: unknown;
        FontSize: number;
        UseH3Header: boolean;
      };
    };
    BillingSystem: number;
    billType: number;
    IsStatement: boolean;
    StatementDisplayDate: unknown;
    UndistributedPayments: unknown[];
    ShouldShowADACopyright: boolean;
    SharedAgencyInformation: {
      Name: string;
      PhoneNumber: string;
      AgencyID: number;
    };
  };
};

/** `/ `SchedulableVisitTypes` are null on both instances.` */
export type CareTeamLoad = {
  ProvidersList: Array<{
    ID: string;
    Name: string;
    Photo: string;
    NationalProviderID: string;
    WebPageUrl: string;
    InfoBlurbUrl: string;
    AboutMeBlurb: unknown[];
    CanViewProviderDetails: boolean;
    CanDirectSchedule: boolean;
    CanRequestAppointment: boolean;
    CanMessage: boolean;
    CommCenterMessageUrl: string;
    CanRequestCustomAppt: boolean;
    HasNoProviderRecord: boolean;
    IsNewSchedulingEnabled: boolean;
    Specialty: string;
    Relation: string;
    SchedulableVisitTypes: unknown;
    DepartmentID: string;
    Organizations: unknown;
    IsExternal: boolean;
    CareTeamStatus: number;
    CanHideProvider: boolean;
  }>;
  DescriptiveTitle: string;
  TabColorClass: string;
  IsCustomApptReqEnabled: boolean;
  CustomRequestAppointmentLink: string;
};

/** `/api/health-summary/fetchh2gheader` */
export type FetchH2GHeader = {
  lastVisit: {
    date: string;
    visitType: string;
    visitDetailsURL: string;
    visitCategory: string;
    openRemotely: boolean;
    mode: string;
  };
  nextVisit: {
    date: string;
    visitType: string;
    visitDetailsURL: string;
    visitCategory: string;
    openRemotely: boolean;
    mode: string;
  };
  upcomingVisitsList: Array<{
    hasPaymentFeature: boolean;
    hasQuestionnaireFeature: boolean;
    hasNewPvdFeature: boolean;
    primaryDate: string;
    csnForECheckIn: string;
    isNoShow: boolean;
    leftWithoutSeen: boolean;
    hasDownloadSummaryLink: boolean;
    hasTransmitSummaryLink: boolean;
    canRedirectToApptDetails: boolean;
    isClinicalInformationAvailable: boolean;
    ownedBy: number;
    isApptDetailsEnabled: boolean;
    isRequestCancelEnabled: boolean;
    isDirectCancelEnabled: boolean;
    isRescheduleEnabled: boolean;
    isCopayEnabled: boolean;
    isVisitSummaryEnabled: boolean;
    isDownloadSummaryEnabled: boolean;
    isTransmitCEEnabled: boolean;
    isTransmitDirectEnabled: boolean;
    isDischargeInstrEnabled: boolean;
    isPatHandoutsEnabled: boolean;
    isIPReviewEnabled: boolean;
    isDischargeSummaryEnabled: boolean;
    isProviderLinkEnabled: boolean;
    isPreadmissionEnabled: boolean;
    isEcheckInCompleted: boolean;
    csn: string;
    id: string;
    referenceID: string;
    organizationLinks: unknown[];
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
      };
      isMyChartCentral: boolean;
      isSameOrganization: boolean;
    };
    month: number;
    dateOfMonth: string;
    year: string;
    isLocal: boolean;
    isNonEpic: boolean;
    isSingleProvider: boolean;
    canShowTelemedicine: boolean;
    dat: string;
    date: string;
    time: string;
    isAM: boolean;
    isClientTime: boolean;
    clientTimeZoneMarker: string;
    encounterType: number;
    visitTypeName: string;
    instant: string;
    canShowArrivalTime: boolean;
    hasDuration: boolean;
    canShowPayments: boolean;
    shortDate: string;
    isTimeToBeDetermined: boolean;
    isHideVisitTime: boolean;
    canShowAppointmentTime: boolean;
    timeZone: string;
    providers: Array<{
      encryptedId: string;
      name: string;
      type: number;
      photoUrl: string;
      photoLink: string;
      webPageUrl: string;
      hasPhotoOnBlob: boolean;
      photoBlobToken: string;
      isPerson: boolean;
      department: {
        id: string;
        name: string;
        address: string[];
        hasAddress: boolean;
        phoneNumber: string;
        instructions: unknown[];
        shouldShowInstructions: boolean;
        timeZone: string;
        arrivalLocation: string;
        specialty: {
          value: string;
          title: string;
          abbreviation: string;
        };
        canShowDrivingDirections: boolean;
        isPreadmissionLocation: boolean;
      };
      photoClass: string;
    }>;
    otherProviders: unknown[];
    numberOfOthers: number;
    primaryProvider: {
      encryptedId: string;
      name: string;
      type: number;
      photoUrl: string;
      photoLink: string;
      webPageUrl: string;
      hasPhotoOnBlob: boolean;
      photoBlobToken: string;
      isPerson: boolean;
      department: {
        id: string;
        name: string;
        address: string[];
        hasAddress: boolean;
        phoneNumber: string;
        instructions: unknown[];
        shouldShowInstructions: boolean;
        timeZone: string;
        arrivalLocation: string;
        specialty: {
          value: string;
          title: string;
          abbreviation: string;
        };
        canShowDrivingDirections: boolean;
        isPreadmissionLocation: boolean;
      };
      photoClass: string;
    };
    primaryProviderName: string;
    primaryDepartment: {
      id: string;
      name: string;
      address: string[];
      hasAddress: boolean;
      phoneNumber: string;
      instructions: unknown[];
      shouldShowInstructions: boolean;
      timeZone: string;
      arrivalLocation: string;
      specialty: {
        value: string;
        title: string;
        abbreviation: string;
      };
      canShowDrivingDirections: boolean;
      isPreadmissionLocation: boolean;
    };
    canRequestCancel: boolean;
    isCanceled: boolean;
    canReschedule: boolean;
    rescheduledDat: string;
    isDetailsEnabled: boolean;
    isInHomeVisit: boolean;
    eCheckIn: {
      status: {
        value: string;
        title: string;
        abbreviation: string;
      };
      isNotStarted: boolean;
      isInProgress: boolean;
      isComplete: boolean;
      barcode: string;
      hasBarcodeStep: boolean;
      clinicSteps: unknown[];
      requiredECheckInSteps: unknown[];
      hasQuestionnaireLink: boolean;
      isAdmission: boolean;
      isSurgery: boolean;
      isQnrAfterBarcode: boolean;
      isConfirmationView: boolean;
      hasSignUpLink: boolean;
      isRequiredForTelemedicine: boolean;
      canShow: boolean;
      hasPaymentECheckInStep: boolean;
      hasQuestionnaireStep: boolean;
      isInHelloPatientWindow: boolean;
      multiPhaseOn: boolean;
    };
    canShowECheckIn: boolean;
    shouldDeprecateECheckInBrand: boolean;
    canShowECheckInComplete: boolean;
    isECheckInComplete: boolean;
    isEcheckInEnabled: boolean;
    isECheckInIncomplete: boolean;
    canECheckIn: boolean;
    shouldShowECheckInInGuideBanner: boolean;
    canShowAddToCalendar: boolean;
    isPastVisit: boolean;
    highlightDate: string;
    isDrivingDirectionsEnabled: boolean;
    confirmationStatus: number;
    isConfirmed: boolean;
    isCancelRequestSent: boolean;
    canDirectlyCancel: boolean;
    isUsingFallbackVisitTypeName: boolean;
    chiefComplaint: string;
    hasSentUpgradeRequest: boolean;
    canSendUpgradeRequest: boolean;
    isUserInitiatedArrivalAllowed: boolean;
    selfArrivalMechanism: number;
    geolocationArrival: number;
    arrivalStatus: number;
    patientNextStepInstructions: string;
    arrivalAdditionalActions: unknown[];
    isProxyRequestMinorFormOn: boolean;
    proxyRequestMinorForm: string;
    telehealthMode: number;
    isUnverifiedOnDemandVideoVisit: boolean;
    inProgress: boolean;
    isResidentialMed: boolean;
    showPFIOLink: boolean;
    isCEOptedIn: boolean;
    userMyChartStatus: number;
    encounterIsSurgery: boolean;
    encounterIsEDVisit: boolean;
    isPreadmission: boolean;
    isHovPreadmission: boolean;
    hasProcedures: boolean;
    numberOfProcedures: number;
    hasComponentVisits: boolean;
    hasPaymentInfo: boolean;
    isFullyPaid: boolean;
    completeECheckInCount: number;
    totalECheckInCount: number;
  }>;
  pastVisitsList: Array<{
    hasPaymentFeature: boolean;
    hasQuestionnaireFeature: boolean;
    hasNewPvdFeature: boolean;
    isNotViewed: boolean;
    isViewStatusVisible: boolean;
    isClinicalNoteAvailable: boolean;
    isNotesOnly: boolean;
    isVisitAmbulatory: boolean;
    feedbackQnrIDs: unknown[];
    isAmbPastVisitDetailsEnabled: boolean;
    isAllIPSecurityPointsDisabled: boolean;
    isIPPastVisitDetailsEnabled: boolean;
    isPastVisitDetailsEnabled: boolean;
    showVisitDetails: boolean;
    primaryDate: string;
    csnForECheckIn: string;
    isNoShow: boolean;
    leftWithoutSeen: boolean;
    hasDownloadSummaryLink: boolean;
    hasTransmitSummaryLink: boolean;
    canRedirectToApptDetails: boolean;
    pastVisitBucket: string;
    isClinicalInformationAvailable: boolean;
    ownedBy: number;
    isApptDetailsEnabled: boolean;
    isRequestCancelEnabled: boolean;
    isDirectCancelEnabled: boolean;
    isRescheduleEnabled: boolean;
    isCopayEnabled: boolean;
    isVisitSummaryEnabled: boolean;
    isDownloadSummaryEnabled: boolean;
    isTransmitCEEnabled: boolean;
    isTransmitDirectEnabled: boolean;
    isDischargeInstrEnabled: boolean;
    isPatHandoutsEnabled: boolean;
    isIPReviewEnabled: boolean;
    isDischargeSummaryEnabled: boolean;
    isProviderLinkEnabled: boolean;
    isPreadmissionEnabled: boolean;
    isEcheckInCompleted: boolean;
    csn: string;
    id: string;
    referenceID: string;
    organizationLinks: unknown[];
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
      };
      isMyChartCentral: boolean;
      isSameOrganization: boolean;
    };
    month: number;
    dateOfMonth: string;
    year: string;
    isLocal: boolean;
    isNonEpic: boolean;
    isSingleProvider: boolean;
    canShowTelemedicine: boolean;
    dat: string;
    date: string;
    time: string;
    isAM: boolean;
    isClientTime: boolean;
    clientTimeZoneMarker: string;
    encounterType: number;
    visitTypeName: string;
    instant: string;
    canShowArrivalTime: boolean;
    hasDuration: boolean;
    canShowPayments: boolean;
    shortDate: string;
    isTimeToBeDetermined: boolean;
    isHideVisitTime: boolean;
    canShowAppointmentTime: boolean;
    timeZone: string;
    providers: Array<{
      encryptedId: string;
      name: string;
      type: number;
      photoUrl: string;
      photoLink: string;
      webPageUrl: string;
      hasPhotoOnBlob: boolean;
      photoBlobToken: string;
      isPerson: boolean;
      department: {
        id: string;
        name: string;
        address: string[];
        hasAddress: boolean;
        phoneNumber: string;
        instructions: unknown[];
        shouldShowInstructions: boolean;
        timeZone: string;
        arrivalLocation: string;
        specialty: {
          value: string;
          title: string;
          abbreviation: string;
        };
        canShowDrivingDirections: boolean;
        isPreadmissionLocation: boolean;
      };
      photoClass: string;
    }>;
    otherProviders: unknown[];
    numberOfOthers: number;
    primaryProvider: {
      encryptedId: string;
      name: string;
      type: number;
      photoUrl: string;
      photoLink: string;
      webPageUrl: string;
      hasPhotoOnBlob: boolean;
      photoBlobToken: string;
      isPerson: boolean;
      department: {
        id: string;
        name: string;
        address: string[];
        hasAddress: boolean;
        phoneNumber: string;
        instructions: unknown[];
        shouldShowInstructions: boolean;
        timeZone: string;
        arrivalLocation: string;
        specialty: {
          value: string;
          title: string;
          abbreviation: string;
        };
        canShowDrivingDirections: boolean;
        isPreadmissionLocation: boolean;
      };
      photoClass: string;
    };
    primaryProviderName: string;
    primaryDepartment: {
      id: string;
      name: string;
      address: string[];
      hasAddress: boolean;
      phoneNumber: string;
      instructions: unknown[];
      shouldShowInstructions: boolean;
      timeZone: string;
      arrivalLocation: string;
      specialty: {
        value: string;
        title: string;
        abbreviation: string;
      };
      canShowDrivingDirections: boolean;
      isPreadmissionLocation: boolean;
    };
    canRequestCancel: boolean;
    isCanceled: boolean;
    canReschedule: boolean;
    rescheduledDat: string;
    isDetailsEnabled: boolean;
    isInHomeVisit: boolean;
    canShowECheckIn: boolean;
    shouldDeprecateECheckInBrand: boolean;
    canShowECheckInComplete: boolean;
    isECheckInComplete: boolean;
    isEcheckInEnabled: boolean;
    isECheckInIncomplete: boolean;
    canECheckIn: boolean;
    shouldShowECheckInInGuideBanner: boolean;
    canShowAddToCalendar: boolean;
    isPastVisit: boolean;
    highlightDate: string;
    isDrivingDirectionsEnabled: boolean;
    confirmationStatus: number;
    isConfirmed: boolean;
    isCancelRequestSent: boolean;
    canDirectlyCancel: boolean;
    isUsingFallbackVisitTypeName: boolean;
    chiefComplaint: string;
    hasSentUpgradeRequest: boolean;
    canSendUpgradeRequest: boolean;
    isUserInitiatedArrivalAllowed: boolean;
    selfArrivalMechanism: number;
    geolocationArrival: number;
    patientNextStepInstructions: string;
    arrivalAdditionalActions: unknown[];
    isProxyRequestMinorFormOn: boolean;
    proxyRequestMinorForm: string;
    telehealthMode: number;
    isUnverifiedOnDemandVideoVisit: boolean;
    inProgress: boolean;
    isResidentialMed: boolean;
    showPFIOLink: boolean;
    isCEOptedIn: boolean;
    userMyChartStatus: number;
    encounterIsSurgery: boolean;
    encounterIsEDVisit: boolean;
    isPreadmission: boolean;
    isHovPreadmission: boolean;
    hasProcedures: boolean;
    numberOfProcedures: number;
    hasComponentVisits: boolean;
    hasPaymentInfo: boolean;
    isFullyPaid: boolean;
    completeECheckInCount: number;
    totalECheckInCount: number;
  }>;
};

/** `/api/health-summary/fetchhealthsummary` */
export type FetchHealthSummary = {
  header: {
    patientAge: string;
    height: {
      value: string;
      dateRecorded: string;
    };
    weight: {
      value: string;
      dateRecorded: string;
    };
    bloodType: string;
  };
  isPatientAdmitted: boolean;
  isProxyContext: boolean;
  patientFirstName: string;
  schoolReportInfo: {
    schoolReportTitle: string;
    schoolReportID: string;
  };
  actionPlans: unknown[];
  canAccessSharingHub: boolean;
  quickLinkDictionary: {
    HealthIssues: string;
    Allergies: string;
    Immunizations: string;
    Visits: string;
    PreventiveCare: string;
    SchoolHealthSummary: string;
    CareJourneyDetails: string;
    SendAMessage: string;
    CareTeam: string;
    MyConditions: string;
  };
  conditionList: unknown[];
  journeyList: unknown[];
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
      primaryAction: {
        uriId: string;
        uri: string;
        uriType: number;
        uriDisplayText: string;
        uriAccessibleText: string;
        uriIconKey: string;
        isHidden: boolean;
      };
      secondaryAction: {
        uriId: string;
        uri: string;
        uriType: number;
        uriDisplayText: string;
        uriAccessibleText: string;
        uriIconKey: string;
        isHidden: boolean;
      };
      tertiaryAction: {
        uriId: string;
        uriType: number;
        uriDisplayText: string;
        uriAccessibleText: string;
        uriIconKey: string;
        isHidden: boolean;
      };
      defaultAction: {
        uriId: string;
        uri: string;
        uriType: number;
        uriDisplayText: string;
        uriAccessibleText: string;
        uriIconKey: string;
        isHidden: boolean;
      };
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

export type GetBenefitsSummary = {
  coverageName: string;
  payerName: string;
  payerLogoBlobMagicId: string;
  lastUpdatedText: string;
  benefitsPatientId: string;
  helpText: string;
  coverageId: string;
  queryKey: string;
  noCoverageAvailable: boolean;
  hasAmbiguousCoverages: boolean;
  hasRTEUpdateInProgress: boolean;
  canAccessInsuranceHub: boolean;
  canAccessInsuranceSummary: boolean;
  canAccessCustomerService: boolean;
  canAccessAnyLinks: boolean;
  insuranceHubUrl: string;
  payerPhoneNumber: string;
  showPhoneNumberAsAction: boolean;
  showPhoneNumberAsTextOnly: boolean;
  showInsuranceSummaryMessage: boolean;
  deductible: {
    type: string;
    network: string;
    name: string;
    accountBucket: {
      isLimit: boolean;
      type: string;
      totalAmount: string;
      usedAmount: string;
      remainingAmount: string;
      usedRatio: number;
      isTotalZero: boolean;
      rollPeriodEndDate: string;
      rollPeriod: string;
      numberOfPeriods: number;
      usedOnPrevLevel: string;
    };
    patientBucket: {
      isLimit: boolean;
      type: string;
      totalAmount: string;
      usedAmount: string;
      remainingAmount: string;
      usedRatio: number;
      isTotalZero: boolean;
      rollPeriodEndDate: string;
      rollPeriod: string;
      numberOfPeriods: number;
      usedOnPrevLevel: string;
    };
  };
  moop: {
    type: string;
    network: string;
    name: string;
    accountBucket: {
      isLimit: boolean;
      type: string;
      totalAmount: string;
      usedAmount: string;
      remainingAmount: string;
      usedRatio: number;
      isTotalZero: boolean;
      rollPeriodEndDate: string;
      rollPeriod: string;
      numberOfPeriods: number;
      usedOnPrevLevel: string;
    };
    patientBucket: {
      isLimit: boolean;
      type: string;
      totalAmount: string;
      usedAmount: string;
      remainingAmount: string;
      usedRatio: number;
      isTotalZero: boolean;
      rollPeriodEndDate: string;
      rollPeriod: string;
      numberOfPeriods: number;
      usedOnPrevLevel: string;
    };
  };
  insuranceLimit: {
    type: string;
    network: string;
    name: string;
    accountBucket: {
      isLimit: boolean;
      type: string;
      totalAmount: string;
      usedAmount: string;
      remainingAmount: string;
      usedRatio: number;
      isTotalZero: boolean;
      rollPeriodEndDate: string;
      rollPeriod: string;
      numberOfPeriods: number;
      usedOnPrevLevel: string;
    };
    patientBucket: {
      isLimit: boolean;
      type: string;
      totalAmount: string;
      usedAmount: string;
      remainingAmount: string;
      usedRatio: number;
      isTotalZero: boolean;
      rollPeriodEndDate: string;
      rollPeriod: string;
      numberOfPeriods: number;
      usedOnPrevLevel: string;
    };
  };
};

/** `/personalinformation/getcontactinformation` */
export type GetContactInformation = {
  PermanentAddress: {
    IsViewOnly: boolean;
    RequiredFieldNames: unknown[];
    Success: boolean;
    IsPending: boolean;
    Street: string;
    City: string;
    County: {
      Value: unknown;
      Number: string;
      Title: string;
      Abbreviation: unknown;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    State: {
      Value: unknown;
      Number: string;
      Title: string;
      Abbreviation: string;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    Zip: string;
    Country: {
      Value: unknown;
      Number: string;
      Title: string;
      Abbreviation: unknown;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    HouseNumber: string;
    District: {
      Value: unknown;
      Number: string;
      Title: unknown;
      Abbreviation: string;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    Building: string;
    Floor: string;
    Unit: string;
    FormattedValues: string[];
    AllowArbitraryInput: boolean;
    AllowDefaults: boolean;
    GeocodeScore: unknown;
    GeocodeLatitude: unknown;
    GeocodeLongitude: unknown;
    GeocodeGranularity: unknown;
  };
  TemporaryAddress: {
    PhoneNumber: string;
    StartDateDisplay: unknown;
    EndDateDisplay: unknown;
    StartDateISO: string;
    EndDateISO: string;
    RequiredFieldNames: unknown[];
    Success: boolean;
    IsPending: boolean;
    CollapsedStatus: unknown;
    Street: string;
    City: string;
    County: {
      Value: unknown;
      Number: string;
      Title: string;
      Abbreviation: unknown;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    State: {
      Value: unknown;
      Number: string;
      Title: string;
      Abbreviation: string;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    Zip: string;
    Country: {
      Value: unknown;
      Number: string;
      Title: string;
      Abbreviation: unknown;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    HouseNumber: string;
    District: {
      Value: unknown;
      Number: string;
      Title: unknown;
      Abbreviation: string;
      Abbr: unknown;
      Comment: unknown;
      IsInactive: boolean;
      TitleUtf8: unknown;
      AbbreviationUtf8: unknown;
      IsFallbackUsed: boolean;
    };
    Building: string;
    Floor: string;
    Unit: string;
    FormattedValues: unknown[];
    AllowArbitraryInput: boolean;
    AllowDefaults: boolean;
    GeocodeScore: unknown;
    GeocodeLatitude: unknown;
    GeocodeLongitude: unknown;
    GeocodeGranularity: unknown;
  };
  PermanentDefaults: unknown[];
  TemporaryDefaults: unknown[];
  AllowArbitraryInput: boolean;
  AllowDefaults: boolean;
  SecureCommunicationInfo: {
    SecureEmail: string;
    EmailAddress: string;
    SecureMobile: string;
    MobilePhone: string;
    CanSupportEmail: boolean;
    CanSupportMobile: boolean;
    CanSupportOverwrite: boolean;
    DoesEmailNeedAttention: boolean;
    DoesMobileNeedAttention: boolean;
    IsEmailDeleted: boolean;
    IsMobileDeleted: boolean;
    AreBothDeleted: boolean;
    AreNeitherDeleted: boolean;
    DoBothNeedAttention: boolean;
    DoNeitherNeedAttention: boolean;
    ContactVerificationDisabled: boolean;
  };
  HomePhone: string;
  WorkPhone: string;
  PreferredDevice: string;
  RequiredFieldNames: unknown[];
  IsNonPatientProxyRecord: boolean;
  IsTemporaryAddressDisabled: boolean;
  ValidationErrors: unknown[];
  IsPending: boolean;
  ReadOnlyFieldNames: unknown[];
  HasEditableField: boolean;
};

/** ``firstUnreadMsgId` instead, so neither is a shape all of them share.` */
export type GetConversationDetails = {
  contexts: unknown[];
  lastViewedByStaffMsgId: string;
  lastViewedByStaffInstantISO: string;
  numUnread: number;
  replyUrl: string;
  replyFlags: {
    canReply: boolean;
    cannotReplyReason: number;
  };
  totalMessages: number;
  users: Record<string, {
    empId: string;
    name: string;
    outOfContactEndDate: string;
    outOfContactContext: number;
    outOfContactContextString: string;
    photoUrl: string;
    providerId: string;
    organizationId: string;
  }>;
  viewers: Record<string, {
    wprId: string;
    name: string;
    isSelf: boolean;
    isShown: boolean;
    isSelected: boolean;
    organizationId: string;
  }>;
  hasPreviouslyViewed: boolean;
  subject: string;
  tags: {
    Messages: boolean;
  };
  previewText: string;
  hasAttachments: boolean;
  hasTasks: boolean;
  hasUrgentMsgs: boolean;
  legacyMessageDetailsUrl: string;
  audience: Array<{
    empId: string;
    hipId: string;
    name: string;
    providerId: string;
  }>;
  hasLoadAllUsers: boolean;
  allowBulkActions: boolean;
  hthId: string;
  messages: Array<{
    wmgId: string;
    isUnread: boolean;
    deliveryInstantISO: string;
    body: string;
    author: {
      displayName: string;
      empKey: string;
    };
    attachments: Array<{
      type: number;
      dcsId: string;
      etxId: string;
      name: string;
      fileExtension: string;
      legacyUrlForCommunityJump: string;
      organizationId: string;
    }>;
    tasks: unknown[];
    suggestedActions: unknown[];
  }>;
  hasMoreMessages: boolean;
  messageType: string;
  userKeys: string[];
  userOverrideNames: Record<string, string>;
  maskedUserNames: unknown[];
  showOtherViewersOption: boolean;
  viewerKeys: string[];
  organizationId: string;
};

/** `/api/conversations/getconversationlist` */
export type GetConversationList = {
  legacyXUnreadCount: number;
  conversations: Array<{
    contexts: unknown[];
    subject: string;
    tags: {
      Messages: boolean;
      Unread: boolean;
    };
    previewText: string;
    hasAttachments: boolean;
    hasTasks: boolean;
    hasUrgentMsgs: boolean;
    legacyMessageDetailsUrl: string;
    audience: unknown[];
    hasLoadAllUsers: boolean;
    allowBulkActions: boolean;
    hthId: string;
    messages: Array<{
      wmgId: string;
      isUnread: boolean;
      deliveryInstantISO: string;
      body: string;
      author: {
        displayName: string;
        empKey: string;
      };
      attachments: unknown[];
      tasks: unknown[];
      suggestedActions: unknown[];
    }>;
    hasMoreMessages: boolean;
    messageType: string;
    userKeys: string[];
    userOverrideNames: Record<string, string>;
    maskedUserNames: unknown[];
    showOtherViewersOption: boolean;
    viewerKeys: string[];
    organizationId: string;
  }>;
  localSummary: {
    hasMoreConversations: boolean;
    newestLoadedInstantISO: string;
    numberLoaded: number;
    oldestLoadedInstantISO: string;
    oldestSearchedInstantISO: string;
    pagingInfo: number;
  };
  users: Record<string, {
    empId: string;
    name: string;
    outOfContactEndDate: string;
    outOfContactContext: number;
    outOfContactContextString: string;
    photoUrl: string;
    providerId: string;
    organizationId: string;
  }>;
  viewers: Record<string, {
    wprId: string;
    name: string;
    isSelf: boolean;
    isShown: boolean;
    isSelected: boolean;
    organizationId: string;
  }>;
  externalSummaries: Record<string, unknown>;
};

/** `come from getconversationdetails or the listing).` */
export type GetConversationMessages = {
  contexts: unknown[];
  hthId: string;
  messages: Array<{
    wmgId: string;
    isUnread: boolean;
    deliveryInstantISO: string;
    body: string;
    author: {
      displayName: string;
      empKey: string;
    };
    attachments: Array<{
      type: number;
      dcsId: string;
      etxId: string;
      name: string;
      fileExtension: string;
      legacyUrlForCommunityJump: string;
      organizationId: string;
    }>;
    tasks: unknown[];
    suggestedActions: unknown[];
  }>;
  hasMoreMessages: boolean;
  messageType: string;
  userKeys: string[];
  userOverrideNames: Record<string, string>;
  maskedUserNames: unknown[];
  showOtherViewersOption: boolean;
  viewerKeys: string[];
  organizationId: string;
};

/** `/api/documents/viewer/getdocumentdetailslegacy (and getdocumentdetails: same field set)` */
export type GetDocumentDetailsLegacy = {
  dcsId: string;
  token: string;
  orgId: string;
  displayName: string;
  userFriendlyDisplayName: string;
  legacyEncryption: boolean;
  isMobile: boolean;
  fileDescription: string;
  allowPreview: boolean;
  downloadUrl: string;
  previewUrl: string;
  mimeType: string;
};

/** `/api/release-of-information/getehietemplates` */
export type GetEhiETemplates = {
  isNoBuildEhie: boolean;
  existingEHIE: boolean;
  ehieTemplates: Array<{
    description: string;
    hideAdditionalComments: boolean;
    name: string;
    id: string;
  }>;
  __Status: string;
  __UpdateableSettings: {
    maxThrottleConnections: number;
    connectionReleaseDelay: number;
    virtualQueueLoadThreshold: number;
    virtualQueuePopDelay: number;
    virtualQueueSize: number;
    isVirtualQueueEnabled: boolean;
    lastDynamicSettingsUpdate: {
      CredentialSettings: string;
      LicenseSettings: string;
      MyChartCentralSettings: string;
      ServerStatusSettings: string;
    };
  };
};

/** `/api/track-my-health/getflowsheetreadings` */
export type GetFlowsheetReadings = {
  flowsheet: {
    episodeId: string;
    templateId: string;
    name: string;
    entryType: string;
    entryMode: string;
    status: string;
    startDateIso: string;
    endDateIso: string;
    instructions: string;
    hasMoreData: boolean;
    hasEpisodeData: boolean;
    rowGroups: Array<{
      id: string;
      name: string;
      rowIds: string[];
    }>;
    rows: Array<{
      id: string;
      name: string;
      rowType: string;
      valueType: string;
      decimalPlaces: number;
    }>;
    readings: Array<{
      id: string;
      fsdId: string;
      rowId: string;
      valueType: string;
      entryType: string;
      instantTakenIso: string;
      isAbnormal: boolean;
      documentationSource: string;
      stringValue: string;
      dataType: string;
      line: number;
      decimalPlaces: number;
      timeZone: string;
      sourceRowId: string;
    }>;
  };
  userSettings: {
    isAdmitted: boolean;
    isH2GSession: boolean;
    isMOContext: boolean;
    isDataTileContext: boolean;
    isProxyContext: boolean;
    myChartPatientId: string;
    myChartPatientName: string;
    myChartUserId: string;
    myChartUserName: string;
    devicePlatform: string;
    healthConnectAvailable: string;
    moVersionSupportsBluetooth: boolean;
  };
};

/** `/api/track-my-health/getflowsheets` */
export type GetFlowsheets = {
  flowsheets: Array<{
    episodeId: string;
    templateId: string;
    name: string;
    entryType: string;
    entryMode: string;
    status: string;
    startDateIso: string;
    endDateIso: string;
    instructions: string;
    hasMoreData: boolean;
    hasEpisodeData: boolean;
    rowGroups: Array<{
      id: string;
      name: string;
      rowIds: string[];
    }>;
    rows: Array<{
      id: string;
      name: string;
      rowType: string;
      valueType: string;
      decimalPlaces: number;
    }>;
    readings: unknown[];
  }>;
  userSettings: {
    isAdmitted: boolean;
    isH2GSession: boolean;
    isMOContext: boolean;
    isDataTileContext: boolean;
    isProxyContext: boolean;
    myChartPatientId: string;
    myChartPatientName: string;
    myChartUserId: string;
    myChartUserName: string;
    devicePlatform: string;
    healthConnectAvailable: string;
    moVersionSupportsBluetooth: boolean;
  };
};

/** `/api/letters/getletterslist` */
export type GetLettersList = {
  letters: Array<{
    dateISO: string;
    viewed: boolean;
    hnoId: string;
    csn: string;
    reason: string;
    empId: string;
  }>;
  users: Record<string, {
    empId: string;
    name: string;
    photoUrl: string;
  }>;
  departments: Record<string, unknown>;
};

/** `/api/medicaladvicerequests/getmedicaladvicerequestrecipients` */
export type GetMedicalAdviceRequestRecipients = Array<{
  recipientType: number;
  pcpTypeDisplayName: string;
  displayName: string;
  specialty: string;
  userId: string;
  departmentId: string;
  poolId: string;
  oocContext: number;
  photoUrl: string;
  providerId: string;
  organizationId: string;
}>;

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
      referenceRange: {
        low: number;
        high: number;
        displayLow: string;
        displayHigh: string;
        lowerBoundExclusive: boolean;
        upperBoundExclusive: boolean;
        formattedReferenceRange: string;
      };
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

/** `/api/education/getpateducationtitles` */
export type GetPatEducationTitles = Array<{
  elementId: string;
  displayName: string;
  assignedDate: string;
  eduKey: string;
  numTopics: number;
  numPoints: number;
  isAdmitted: boolean;
  encounterContext: number;
  wasAssignedThisVisit: boolean;
  canUserTrackUnderstanding: boolean;
  numPagesReviewed: number;
  numPagesUnderstood: number;
  numPagesQuestions: number;
  thumbnailImage: string;
  thumbnailImageBlobToken: string;
  thumbnailIcon: number;
  tvSupported: boolean;
  removeThumbnails: boolean;
}>;

/** `because their element shape has never been seen.` */
export type GetProviderBioPrivate = {
  name: string;
  photoUrl: string;
  staticPhotoUrl: string;
  bioPath: string;
  bioSlug: string;
  bioId: string;
  nameLastFirst: string;
  providerPatientRelation: number;
  gender: string;
  race: unknown[];
  ethnicity: unknown[];
  credentials: string;
  languages: unknown[];
  clinicalInterests: unknown[];
  specialtyIds: string[];
  locations: Array<{
    id: string;
    recordType: number;
    name: string;
    address: string[];
    discreteAddress: {
      streetAddress: string[];
      city: string;
      state: string;
      stateName: string;
      zip: string;
      country: string;
    };
    coordinates: {
      latitude: number;
      longitude: number;
    };
    phoneNumber: string;
    accessRestrictions: unknown[];
    telehealthStyles: unknown[];
    isInNetwork: boolean;
    seesNewPatients: string;
    bioSlug: string;
    bioId: string;
  }>;
  aboutMe: string;
  videos: unknown[];
  webPageUrl: string;
  npi: string;
  patientGroupsSeen: unknown[];
  seesNewPatients: string;
  specialties: string[];
  standardFilterNames: unknown[];
  nrxFilterNames: unknown[];
  managedCareFilterName: string;
  rating: {
    ratingValue: number;
    ratingMaxValue: number;
    ratingCount: number;
  };
  reviews: unknown[];
  educationEntries: unknown[];
  publications: unknown[];
  allPublicationsUrl: string;
  affiliations: unknown[];
  keywords: unknown[];
  boardCertifications: unknown[];
  licenses: Array<{
    state: string;
    licenseNumber: string;
  }>;
  hospitalAffiliations: unknown[];
  isInternal: boolean;
  completedCulturalTraining: string;
  specialtySearchTerms: unknown[];
  id: string;
};

/** `/api/questionnaire/getquestionnairelist` */
export type GetQuestionnaireList = {
  assignedQuestionnaires: Array<{
    dueDateISO: string;
    apptDateISO: string;
    isHistory: boolean;
    seriesData: {
      seriesName: string;
      pastResponses: Array<{
        filedDateISO: string;
        filedTimeISO: string;
        timeSinceFiled: number;
        filedDateFormatted: string;
        filedTimeFormatted: string;
        rootHqaID: string;
        answeringUser: string;
        viewingPastResponsesNotAllowed: boolean;
      }>;
      isSeriesForSurgery: boolean;
      surgeryData: {
        provider: string;
        procedureName: string;
        procedureDateISO: string;
        laterality: string;
      };
      assigningEncounterIdentifier: string;
      isSeriesForToDo: boolean;
    };
    hxData: {
      hxContext: string;
      hxContextID: string;
    };
    displayNameOverride: string;
    isTravelScreening: boolean;
    isProxyAccessing: boolean;
    context: {
      contextType: number;
      contextIdentifier: string;
      extraContextInfo: {
        ltkID: string;
        ltkInstant: string;
        larID: string;
        cjnID: string;
        isPreadmission: boolean;
        rshID: string;
      };
    };
    questionnaire: {
      type: number;
      filterType: string;
      isContextSpecific: boolean;
      preText: string;
      postText: string;
      isPreTextSmartText: boolean;
      isPostTextSmartText: boolean;
      status: number;
      rootName: string;
      id: string;
      name: string;
    };
  }>;
  optionalQuestionnaires: Array<{
    description: string;
    disablePastResponse: boolean;
    context: {
      contextType: number;
      contextIdentifier: string;
      extraContextInfo: {
        ltkID: string;
        ltkInstant: string;
        larID: string;
        cjnID: string;
        isPreadmission: boolean;
        rshID: string;
        from: string;
      };
    };
    questionnaire: {
      type: number;
      isContextSpecific: boolean;
      preText: string;
      postText: string;
      isPreTextSmartText: boolean;
      isPostTextSmartText: boolean;
      status: number;
      rootName: string;
      id: string;
      name: string;
    };
  }>;
  questionnaireContextLists: Array<{
    listContext: {
      contextType: number;
      contextIdentifier: string;
      extraContextInfo: {
        ltkID: string;
        ltkInstant: string;
        larID: string;
        cjnID: string;
        isPreadmission: boolean;
        rshID: string;
      };
    };
    assignedQuestionnaires: Array<{
      dueDateISO: string;
      apptDateISO: string;
      isHistory: boolean;
      seriesData: {
        seriesName: string;
        pastResponses: Array<{
          filedDateISO: string;
          filedTimeISO: string;
          timeSinceFiled: number;
          filedDateFormatted: string;
          filedTimeFormatted: string;
          rootHqaID: string;
          answeringUser: string;
          viewingPastResponsesNotAllowed: boolean;
        }>;
        isSeriesForSurgery: boolean;
        surgeryData: {
          provider: string;
          procedureName: string;
          procedureDateISO: string;
          laterality: string;
        };
        assigningEncounterIdentifier: string;
        isSeriesForToDo: boolean;
      };
      hxData: {
        hxContext: string;
        hxContextID: string;
      };
      displayNameOverride: string;
      isTravelScreening: boolean;
      isProxyAccessing: boolean;
      context: {
        contextType: number;
        contextIdentifier: string;
        extraContextInfo: {
          ltkID: string;
          ltkInstant: string;
          larID: string;
          cjnID: string;
          isPreadmission: boolean;
          rshID: string;
        };
      };
      questionnaire: {
        type: number;
        filterType: string;
        isContextSpecific: boolean;
        preText: string;
        postText: string;
        isPreTextSmartText: boolean;
        isPostTextSmartText: boolean;
        status: number;
        rootName: string;
        id: string;
        name: string;
      };
    }>;
    index: number;
  }>;
  completedQuestionnaires: unknown[];
  showSeriesText: boolean;
  showBackButton: boolean;
  callingApp: number;
  showPretext: boolean;
  messageQnrExpired: boolean;
  sourceActivity: number;
};

/** `/api/personalinformation/getrelationships` */
export type GetRelationships = {
  isViewOnly: boolean;
  hideEmergencyContacts: boolean;
  contacts: Array<{
    id: string;
    formattedName: string;
    relationToPatient: {
      name: string;
      labelText: string;
      isInactive: boolean;
    };
    isPrimaryContact: boolean;
    isLinkedToOtherPatient: boolean;
    isHCA: boolean;
    isAddressLinkedToPatient: boolean;
    contactInformation: {
      address: {
        street: string;
        city: string;
        county: {
          number: string;
          title: string;
          isInactive: boolean;
        };
        state: {
          number: string;
          title: string;
          abbreviation: string;
          isInactive: boolean;
        };
        zip: string;
        country: {
          number: string;
          title: string;
          isInactive: boolean;
        };
        houseNumber: string;
        district: {
          number: string;
          abbreviation: string;
          isInactive: boolean;
        };
        formattedValues: string[];
        allowArbitraryInput: boolean;
        allowDefaults: boolean;
      };
      emailAddress: string;
      phoneNumbers: Array<{
        phoneNumber: string;
        type: string;
      }>;
    };
    savedSuccessfully: boolean;
    isPending: boolean;
    isVRK: boolean;
  }>;
  relationToPatientChoices: Array<{
    name: string;
    labelText: string;
    isInactive: boolean;
  }>;
  requiredFields: unknown[];
  vrkFields: unknown[];
  hasEndOfLifePageMnemonic: boolean;
};

/** `/billing/details/getstatementlist` */
export type GetStatementList = {
  Success: boolean;
  DataStatement: {
    StatementList: Array<{
      Show: boolean;
      Date: number;
      DayOfMonth: number;
      Month: number;
      Year: number;
      DateDisplay: string;
      Description: string;
      SubText: string;
      LinkText: string;
      LinkDescription: string;
      IsRead: boolean;
      ImagePath: string;
      Token: string;
      IsPaperless: boolean;
      PrintID: string;
      StatementAmountDisplay: string;
      IsEB: boolean;
      Format: number;
      IsDetailBill: boolean;
      BillingSystem: number;
      EncBillingSystem: string;
      RecordID: string;
      ServiceDateStart: unknown;
      ServiceDateEnd: unknown;
      URLStatement: unknown;
    }>;
    HasUnread: boolean;
    HasRead: boolean;
    ShowAll: boolean;
    IsPaperless: boolean;
    PaperlessStatus: number;
    ShowPaperlessSignup: boolean;
    ShowPaperlessCancel: boolean;
    URLPaperlessBilling: string;
    IsPaperlessAllowedForSA: boolean;
    IsDetailBillModel: boolean;
    noStatementsString: string;
    allReadString: string;
    loadMoreString: string;
  };
  DataDetailBill: {
    StatementList: Array<{
      Show: boolean;
      Date: number;
      DayOfMonth: number;
      Month: number;
      Year: number;
      DateDisplay: string;
      Description: string;
      SubText: string;
      LinkText: string;
      LinkDescription: string;
      IsRead: boolean;
      ImagePath: string;
      Token: string;
      IsPaperless: boolean;
      PrintID: string;
      StatementAmountDisplay: string;
      IsEB: boolean;
      Format: number;
      IsDetailBill: boolean;
      BillingSystem: number;
      EncBillingSystem: string;
      RecordID: string;
      ServiceDateStart: unknown;
      ServiceDateEnd: unknown;
      URLStatement: unknown;
    }>;
    HasUnread: boolean;
    HasRead: boolean;
    ShowAll: boolean;
    IsPaperless: boolean;
    PaperlessStatus: number;
    ShowPaperlessSignup: boolean;
    ShowPaperlessCancel: boolean;
    URLPaperlessBilling: unknown;
    IsPaperlessAllowedForSA: boolean;
    IsDetailBillModel: boolean;
    noStatementsString: string;
    allReadString: string;
    loadMoreString: string;
  };
};

/** `/api/medicaladvicerequests/getsubtopics` */
export type GetSubTopics = {
  topicList: Array<{
    displayName: string;
    value: string;
  }>;
  organizationId: string;
};

/** `/api/upcoming-orders/getupcomingorders` */
export type GetUpcomingOrders = {
  orderGroupList: Record<string, unknown>;
  orderList: Record<string, unknown>;
  providerList: Record<string, unknown>;
  upcomingOrdersSettings: {
    canHideOrUnhideReminders: boolean;
  };
};

/** `/api/visit-notes/getvisitnotes` */
export type GetVisitNotes = {
  lrpID: string;
  depPhoneNumber: string;
  isAtLeastOneNoteSensitive: boolean;
  noteList: Array<{
    hnoID: string;
    hnoDAT: string;
    displayName: string;
    iso: string;
    isAddendum: boolean;
    provider: {
      name: string;
      hasPhotoOnBlob: boolean;
      magicID: string;
    };
    isNoteSensitive: boolean;
    attachments: unknown[];
  }>;
};

/** `/GuestEstimates/SelectLocation (inlined var model)` */
export type GuestEstimatesLocationModel = {
  Locations: Array<{
    Id: string;
    Title: string;
    Phone: string;
    PhoneText: string;
    Description: string;
    LogoURL: string;
    DefaultLogoURL: unknown;
    SelectLocations: boolean;
    BillingSystem: number;
  }>;
  IsMultiServiceArea: boolean;
  ServiceArea: string;
  IsGuest: boolean;
  HasCompletedCaptcha: boolean;
  Template: string;
};

/** `/GuestEstimates/SelectServiceArea (inlined $$WP.Estimates.OtherSAs element)` */
export type GuestEstimatesServiceArea = {
  Id: string;
  Title: string;
  Phone: string;
  PhoneText: string;
  Description: string;
  LogoURL: string;
  DefaultLogoURL: unknown;
  SelectLocations: boolean;
  BillingSystem: number;
};

/** `a bare string.` */
export type HealthAdvisoriesGetTopics = {
  HealthAdvisoryViewModelList: Array<{
    TopicId: string;
    CareGapType: string;
    Name: string;
    DueDateISO: string;
    LastCompletedDateISO: string;
    PostponedDateISO: string;
    LastDoneDateISO: string;
    StatusCode: string;
    DueDateOverride: string;
    Status: string;
    CanRequestAppointment: boolean;
    CanScheduleAppointment: boolean;
    IsProviderFirst: boolean;
    ContentLinkURL: string;
    ContentLinkTarget: string;
    FormattedDueDate: string;
    FormattedPostponedDate: string;
    FormattedLastDoneDate: string;
    FormattedLastCompletedDate: string;
    FormattedDoneDates: string[];
    UpdateInformation: {
      CanMarkAsComplete: boolean;
      EarliestCompletionDateISO: string;
      IsUpdatePending: boolean;
      FormattedEnteredDate: unknown;
      CanSubmitAttestation: boolean;
      HasActiveAttestation: boolean;
      HasHSDeclinedAttestation: boolean;
      AttestationVersion: number;
      PotentialCompletionInfo: {
        RelevantAttestationTopicID: unknown;
        AttestationStatus: number;
        ServiceDateISO: string;
        ServiceDateFormatted: string;
        ServiceLocation: string;
        Comments: string;
        DocumentID: unknown;
      };
      FormattedPendingAttestedDates: unknown[];
      CanHideReminderFromHomePage: boolean;
      IsHomePageReminderSnoozed: boolean;
      HomePageReminderSnoozedUntilDateISO: string;
      HomePageReminderSnoozedUntilDate: string;
      HomePageReminderSnoozeDefaultDuration: number;
    };
    HasUpcomingOrder: boolean;
    HasScheduledOrder: boolean;
    OrderId: string;
    OrderTicketId: string;
    IsActionable: boolean;
    ActionDateISO: string;
    SchedReasonForVisit: string;
    SchedAppointmentDateISO: string;
    SchedAppointmentCSN: string;
    IsSchedulingSuppressed: boolean;
    IsAppointmentPotentialCompletion: boolean;
    FormattedSchedAppointmentDateISO: string;
    LastRequestedDateISO: string;
    FormattedLastRequestedDate: string;
  }>;
  HealthAdvisorySettings: {
    FormattedGeneralVisitDate: string;
    GeneralVisitCSN: string;
    HasApptDetailsSecurity: boolean;
    HasUpcomingApptSecurity: boolean;
  };
};

/** `hide the two logo fallbacks every client implements.` */
export type HelpOrganization = {
  slgId: string;
  name: string;
  states: unknown[];
  countries: unknown[];
  brandName: string;
  loginUrl: string;
  liveOnCentral: boolean;
  email: string;
  phone: string;
  faq: string;
  aliases: unknown[];
};

/** `entirely unless the request asks for it with includeOrganizations=1.` */
export type HelpOrganizations = {
  organizationOptionsByScreenId: Record<string, unknown>;
  countryData: {
    alpha_2_index: Record<string, unknown>;
  };
  stateData: {
    abbreviation_index: Record<string, unknown>;
  };
};

/** `so they are the same type by construction rather than by observation.` */
export type InsuranceGetCoverages = {
  ActiveCoverages: Array<{
    CoverageId: string;
    CoverageName: string;
    Index: string;
    Status: number;
    CoverageType: number;
    PayorId: string;
    PayorName: string;
    PlanName: string;
    SubscriberId: string;
    SubscriberName: string;
    SubscriberFirstName: string;
    SubscriberLastName: string;
    SubscriberDateOfBirth: unknown;
    SubscriberIsSelf: boolean;
    MemberId: string;
    MemberName: string;
    MemberFirstName: unknown;
    MemberLastName: unknown;
    MemberDateOfBirth: unknown;
    GroupNumber: string;
    Comments: string;
    PatientIsSubscriber: unknown;
    FrontDocument: unknown;
    BackDocument: unknown;
    IsCoverageDocumentFromPayer: unknown;
    CvgCoveredStatus: number;
    CvgReason: number;
    FormattedEffectiveDate: string;
    FormattedEndDate: string;
    Future: boolean;
    Termed: boolean;
    PbiId: string;
    SuspendedText: string;
    CoverageFHIRId: string;
    OrganizationId: string;
  }>;
  CoveragesPendingSubmission: Array<{
    CoverageId: string;
    CoverageName: string;
    Index: string;
    Status: number;
    CoverageType: number;
    PayorId: string;
    PayorName: string;
    PlanName: string;
    SubscriberId: string;
    SubscriberName: string;
    SubscriberFirstName: string;
    SubscriberLastName: string;
    SubscriberDateOfBirth: unknown;
    SubscriberIsSelf: boolean;
    MemberId: string;
    MemberName: string;
    MemberFirstName: unknown;
    MemberLastName: unknown;
    MemberDateOfBirth: unknown;
    GroupNumber: string;
    Comments: string;
    PatientIsSubscriber: unknown;
    FrontDocument: unknown;
    BackDocument: unknown;
    IsCoverageDocumentFromPayer: unknown;
    CvgCoveredStatus: number;
    CvgReason: number;
    FormattedEffectiveDate: string;
    FormattedEndDate: string;
    Future: boolean;
    Termed: boolean;
    PbiId: string;
    SuspendedText: string;
    CoverageFHIRId: string;
    OrganizationId: string;
  }>;
  CoveragesPendingDeletion: Array<{
    CoverageId: string;
    CoverageName: string;
    Index: string;
    Status: number;
    CoverageType: number;
    PayorId: string;
    PayorName: string;
    PlanName: string;
    SubscriberId: string;
    SubscriberName: string;
    SubscriberFirstName: string;
    SubscriberLastName: string;
    SubscriberDateOfBirth: unknown;
    SubscriberIsSelf: boolean;
    MemberId: string;
    MemberName: string;
    MemberFirstName: unknown;
    MemberLastName: unknown;
    MemberDateOfBirth: unknown;
    GroupNumber: string;
    Comments: string;
    PatientIsSubscriber: unknown;
    FrontDocument: unknown;
    BackDocument: unknown;
    IsCoverageDocumentFromPayer: unknown;
    CvgCoveredStatus: number;
    CvgReason: number;
    FormattedEffectiveDate: string;
    FormattedEndDate: string;
    Future: boolean;
    Termed: boolean;
    PbiId: string;
    SuspendedText: string;
    CoverageFHIRId: string;
    OrganizationId: string;
  }>;
  CoveragesInReview: Array<{
    CoverageId: string;
    CoverageName: string;
    Index: string;
    Status: number;
    CoverageType: number;
    PayorId: string;
    PayorName: string;
    PlanName: string;
    SubscriberId: string;
    SubscriberName: string;
    SubscriberFirstName: string;
    SubscriberLastName: string;
    SubscriberDateOfBirth: unknown;
    SubscriberIsSelf: boolean;
    MemberId: string;
    MemberName: string;
    MemberFirstName: unknown;
    MemberLastName: unknown;
    MemberDateOfBirth: unknown;
    GroupNumber: string;
    Comments: string;
    PatientIsSubscriber: unknown;
    FrontDocument: unknown;
    BackDocument: unknown;
    IsCoverageDocumentFromPayer: unknown;
    CvgCoveredStatus: number;
    CvgReason: number;
    FormattedEffectiveDate: string;
    FormattedEndDate: string;
    Future: boolean;
    Termed: boolean;
    PbiId: string;
    SuspendedText: string;
    CoverageFHIRId: string;
    OrganizationId: string;
  }>;
  CoveragesInVerification: Array<{
    CoverageId: string;
    CoverageName: string;
    Index: string;
    Status: number;
    CoverageType: number;
    PayorId: string;
    PayorName: string;
    PlanName: string;
    SubscriberId: string;
    SubscriberName: string;
    SubscriberFirstName: string;
    SubscriberLastName: string;
    SubscriberDateOfBirth: unknown;
    SubscriberIsSelf: boolean;
    MemberId: string;
    MemberName: string;
    MemberFirstName: unknown;
    MemberLastName: unknown;
    MemberDateOfBirth: unknown;
    GroupNumber: string;
    Comments: string;
    PatientIsSubscriber: unknown;
    FrontDocument: unknown;
    BackDocument: unknown;
    IsCoverageDocumentFromPayer: unknown;
    CvgCoveredStatus: number;
    CvgReason: number;
    FormattedEffectiveDate: string;
    FormattedEndDate: string;
    Future: boolean;
    Termed: boolean;
    PbiId: string;
    SuspendedText: string;
    CoverageFHIRId: string;
    OrganizationId: string;
  }>;
  IsProxyContext: boolean;
  Settings: {
    IsStandAlone: boolean;
    CanUpdate: boolean;
    CanViewDetails: boolean;
    CanPayPremium: boolean;
    CanViewInsHub: boolean;
    IsInsHubOn: boolean;
  };
  HasExistingCoveragesInRTE: boolean;
};

/** `numeric requirement level, so it is recorded as a "*" map.` */
export type InsuranceGetPayors = {
  Payors: Array<{
    Fields: Record<string, number>;
    SampleCardImages: unknown[];
    CanUpload: boolean;
    IsNonConfiguredPayer: boolean;
    SortKey: unknown;
    ID: string;
    Name: string;
    NameUTF8: unknown;
  }>;
};

/** `/api/referrals/listreferrals` */
export type ListReferrals = {
  referralList: Array<{
    internalId: string;
    externalId: string;
    status: string;
    statusString: string;
    creationDate: string;
    dte: number;
    referredToProviderName: string;
    referredByProviderName: string;
    referredToFacility: string;
    start: string;
    end: string;
  }>;
  canSendMessage: boolean;
  canSeeAuthorizations: boolean;
  shouldRedirect: boolean;
};

/** `/api/allergies/loadallergies` */
export type LoadAllergies = {
  dataList: unknown[];
  dateOfBirth: string;
  hasUpdateSecurity: boolean;
  hasStandAloneUpdateSecurity: boolean;
  showDxrRefreshBanner: boolean;
  showDxrBannerAction: boolean;
  preTextStringKey: string;
  allergiesStatus: number;
};

/** `/api/goals/loadcareteamgoals` */
export type LoadCareTeamGoals = {
  careTeamGoals: unknown[];
  hasChartGraphSecurity: boolean;
  isSharingNotesEnabled: boolean;
  quickLinkDictionary: {
    HealthSummary: string;
    HealthIssues: string;
    Allergies: string;
    Immunizations: string;
    PreventiveCare: string;
    Medications: string;
    TrackMyHealth: string;
  };
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
    PayerOrgDetails: {
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
    PayerOrgDetails: {
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

/** `/api/healthissues/loadhealthissuesdata` */
export type LoadHealthIssuesData = {
  dataList: Array<{
    healthIssueItem: {
      name: string;
      id: string;
      formattedDateNoted: string;
      action: number;
      isReadOnly: boolean;
    };
    localItem: {
      name: string;
      id: string;
      formattedDateNoted: string;
      action: number;
      isReadOnly: boolean;
    };
    externalItems: unknown[];
    externalOrgs: unknown[];
    contentLinkURL: string;
    contentLinkPath: string;
    target: string;
    hasLocalInstance: boolean;
  }>;
  hasUpdateSecurity: boolean;
  hasStandAloneUpdateSecurity: boolean;
  alwaysShowSearchMore: boolean;
  showDxrRefreshBanner: boolean;
  showDxrBannerAction: boolean;
  preTextStringKey: string;
  dateOfBirth: string;
  healthIssuesUrl: string;
};

/** `/api/histories/loadhistoriesviewmodel` */
export type LoadHistoriesViewModel = {
  surgicalHistory: {
    surgeries: Array<{
      surgeryName: string;
      surgeryDate: string;
    }>;
    surgicalHistoryNotes: string;
  };
  medicalHistory: {
    diagnoses: Array<{
      diagnosisName: string;
      diagnosisDate: string;
    }>;
    medicalHistoryNotes: string;
  };
  familyHistoryAndStatus: {
    familyMembers: Array<{
      nameOrAlias: string;
      sexId: string;
      sexName: string;
      genderId: string;
      relationshipToPatientId: string;
      relationshipToPatientName: string;
      statusId: string;
      statusName: string;
      relativeAge: string;
      relativeAgeEnd: string;
      familyMemberId: string;
      removeFamilyMember: boolean;
      createdOnClient: boolean;
      conditions: string[];
      changes: unknown[];
    }>;
    familyHistoryNotes: string;
    familyStatusNotes: string;
  };
  socialHistory: {
    smokingHistory: {
      smokingTobaccoStatus: string;
      smokingTobaccoTypes: unknown[];
      tobaccoUse: string;
      smokingTobaccoQuitDate: string;
      showSmokingTobaccoQuitDate: boolean;
    };
    smokelessHistory: {
      smokelessTobaccoStatus: string;
      smokelessTobaccoTypes: unknown[];
      smokelessQuitDate: string;
      showSmokelessTobaccoQuitDate: boolean;
    };
    alcoholHistory: {
      alcoholUse: string;
      alcoholAmount: string;
      alcoholUnit: string;
    };
    socialHistoryNotes: string;
    isProxy: boolean;
  };
  isShareEverywhere: boolean;
};

/** `/api/immunizations/loadimmunizations` */
export type LoadImmunizations = {
  organizationImmunizationList: Array<{
    organization: {
      organizationId: string;
      organizationName: string;
      logoUrl: string;
      isLocal: boolean;
      isSSO: boolean;
      incompleteH2GSetup: boolean;
      address: string[];
      linkType: number;
      currentlyLoadingData: boolean;
      errorLoadingData: boolean;
      hasValidRefreshToken: boolean;
      shouldRemindForUpdate: boolean;
      showInRefreshBanner: boolean;
      disclaimerOverride: boolean;
      isMyChartCentral: boolean;
    };
    orgImmunizations: Array<{
      id: string;
      name: string;
      formattedAdministeredDates: string[];
    }>;
    showViewDetailsLink: boolean;
  }>;
  showPersonalNotes: boolean;
  immunizationsUrl: string;
};

/** `/api/medications/loadmedicationspage` */
export type LoadMedicationsPage = {
  communityMembers: Array<{
    context: number;
    isPossiblyFiltered: boolean;
    medicationsVerified: boolean;
    showPreviousTakingValues: boolean;
    isExternal: boolean;
    organization: {
      organizationId: string;
      organizationName: string;
      logoUrl: string;
      isLocal: boolean;
      isSSO: boolean;
      incompleteH2GSetup: boolean;
      address: string[];
      linkType: number;
      currentlyLoadingData: boolean;
      errorLoadingData: boolean;
      hasValidRefreshToken: boolean;
      shouldRemindForUpdate: boolean;
      showInRefreshBanner: boolean;
      disclaimerOverride: boolean;
      isMyChartCentral: boolean;
    };
    prescriptionList: {
      prescriptions: Array<{
        target: string;
        isSigRTL: boolean;
        isTranslationFromOrderRTL: boolean;
        dateDisplayKey: string;
        dateToDisplay: string;
        prescriptionNumber: string;
        hasFutureStartDate: boolean;
        authorizingProvider: {
          type: number;
          hasPhotoOnBlob: boolean;
          id: string;
          name: string;
        };
        orderingProvider: {
          type: number;
          hasPhotoOnBlob: boolean;
          id: string;
          name: string;
        };
        providerDisplayKey: string;
        showProviderInMedsCard: boolean;
        drawProviderDetailsLink: boolean;
        isSelected: boolean;
        classList: string[];
        isPatientReported: boolean;
        showPrescriptionCardBottomDetails: boolean;
        showPrescriptionCardBottom: boolean;
        showDeleteButton: boolean;
        showRefillButton: boolean;
        showRefillStatus: boolean;
        showWaitingForInsuranceAuth: boolean;
        showOrderLevelStatus: boolean;
        showBannerMessage: boolean;
        showDuplicateWarning: boolean;
        showHomeHealthPendingUpdateWarning: boolean;
        isAnticoagulationMed: boolean;
        isFrequencyPRN: boolean;
        criticalMedMessage: string;
        showSig: boolean;
        showPendingUndoDeleteButton: boolean;
        showPendingUndoAddButton: boolean;
        disableValidation: boolean;
        prescriptionListType: number;
        organization: {
          organizationId: string;
          organizationName: string;
          logoUrl: string;
          isLocal: boolean;
          isSSO: boolean;
          incompleteH2GSetup: boolean;
          address: string[];
          linkType: number;
          currentlyLoadingData: boolean;
          errorLoadingData: boolean;
          hasValidRefreshToken: boolean;
          shouldRemindForUpdate: boolean;
          showInRefreshBanner: boolean;
          disclaimerOverride: boolean;
          isMyChartCentral: boolean;
        };
        hasPrescriptionColDetail: boolean;
        hasRefillColDetail: boolean;
        hasPharmacyColDetail: boolean;
        showDrivingDirections: boolean;
        showMessagePharmacyAction: boolean;
        showCostDetails: boolean;
        showPayButton: boolean;
        highlightMedIsHidden: boolean;
        proxiesWhoCantAccessConfMeds: unknown[];
        showProxiesWhoCantAccessList: boolean;
        showOutpatientPauseWarning: boolean;
        outpatientPauseSummary: string;
        outpatientPauseExtraText: string;
        outpatientPauseDupMismatchType: number;
        refillDetails: {
          writtenDispenseQuantity: string;
          writtenDispenseUnit: string;
          writtenDispenseAmount: string;
          daySupply: string;
          nextDispenseDate: string;
          owningPharmacy: {
            id: string;
            name: string;
            isIntegrated: boolean;
            phoneNumber: string;
            formattedAddress: string[];
            hours: unknown[];
            supportedDeliveryMethods: Array<{
              name: string;
              type: number;
              isDeliveryAddressRequired: boolean;
              behavesLikeType: number;
              paymentMethods: number[];
              deliveryFee: {
                price: number;
                tax: number;
                totalDue: number;
              };
            }>;
            departmentID: string;
            hasCreditCardPayments: boolean;
            showDrivingDirections: boolean;
            isPreferred: boolean;
            isPatientMessagingEnabled: boolean;
          };
          lastDispense: {
            dispenseQuantity: string;
            dispenseUnit: string;
            dispenseAmount: string;
            dispenseDate: string;
            amountDue: number;
            workRequestFee: number;
            workRequestFeeDue: number;
            isPaymentValidForDeliveryMethod: boolean;
            isRxReady: boolean;
            costDetails: {
              copay: number;
              formattedCopay: string;
              isCopayPending: boolean;
              isBilledToAccount: boolean;
              paymentCards: unknown[];
              hasPaymentCard: boolean;
            };
            dispenseType: number;
            delivery: {
              shipmentTrackingInfo: unknown[];
              formattedAddress: unknown[];
              formattedShipDate: string;
            };
          };
          refillButtonHoverCode: string;
          refillButtonStatus: number;
          refillsRemainingKey: string;
          refillExpirationDate: string;
          hasRefillsRemaining: boolean;
          refillsRemaining: string;
          isRefillable: boolean;
          refillWarningCode: string;
          arePharmaciesAvailableForRefill: boolean;
          refillStatus: number;
          scheduledFillDate: string;
          externalFillRequestDate: string;
          showLastDispenseQuantity: boolean;
          rxFlags: unknown[];
          costDetails: {
            copay: number;
            formattedCopay: string;
            isCopayPending: boolean;
            isBilledToAccount: boolean;
            paymentCards: unknown[];
            hasPaymentCard: boolean;
          };
          currentFillDat: string;
          doesWorkRequestContainHiddenMed: boolean;
        };
        formattedDateNoted: string;
        startDate: string;
        sig: string;
        sigTranslationFromOrder: string;
        lastUpdateInstant: string;
        id: string;
        name: string;
        patientFriendlyName: {
          text: string;
          caption: string;
          captionType: string;
        };
        iconPath: string;
        contentLinkURL: string;
        pendingUpdateType: number;
        isPendingUpdate: boolean;
        varianceReason: {
          comment: string;
          "epic.Core.Data.ICommentable.CommentClientEditable": boolean;
        };
        varianceComment: string;
        previousTakingDiffSig: string;
        isPreviousTakingDiffSigRTL: boolean;
        previousTakingDiffSigCSN: string;
        previousTakingDiffSigInstant: string;
        isClinicReported: boolean;
      }>;
      isPossiblyFiltered: boolean;
      medicationsVerified: boolean;
      showPreviousTakingValues: boolean;
      previousTakingValuesDate: string;
      pickups: unknown[];
      deliveries: unknown[];
      inProgressWorkRequests: unknown[];
      showNotificationBanners: boolean;
      organization: {
        organizationId: string;
        organizationName: string;
        logoUrl: string;
        isLocal: boolean;
        isSSO: boolean;
        incompleteH2GSetup: boolean;
        address: string[];
        linkType: number;
        currentlyLoadingData: boolean;
        errorLoadingData: boolean;
        hasValidRefreshToken: boolean;
        shouldRemindForUpdate: boolean;
        showInRefreshBanner: boolean;
        disclaimerOverride: boolean;
        isMyChartCentral: boolean;
      };
      showFilteredWarning: boolean;
      showRefillButton: boolean;
      showRefillDisclaimer: boolean;
      onHealthSummaryPage: boolean;
      loadingOrgNames: string;
      hasOrgsLoading: boolean;
      errorOrgNames: string;
      hasOrgsWithErrors: boolean;
      manualOrgNames: string;
      hasOrgsManual: boolean;
      showPrescriptionListWithTwoColumns: boolean;
      showFreeTextPrescriptionInput: boolean;
      showPrescriptionList: boolean;
      enableDummyValidationCheckbox: boolean;
      showDxrRefreshBanner: boolean;
      showDxrBannerAction: boolean;
      pretextStringKey: string;
      showManagePharmacyLink: boolean;
      numRefillsDueSoon: number;
    };
    showLoadingIndicator: boolean;
    showAddMedicationBox: boolean;
    showCommunityMemberOnInitialLoad: boolean;
    showPersonalNotes: boolean;
    requiresLoading: boolean;
    showPrescriptionListWithTwoColumns: boolean;
    enableSelectionMode: boolean;
    useRxNormForSearch: boolean;
    alwaysShowSearchMore: boolean;
    showRespondByPreferences: boolean;
    showMessageViewerOptions: boolean;
    allowFreeTextPharmacy: boolean;
    allowPickUpDateTimeInput: boolean;
    allowMedsRefill: boolean;
    areMedsPaidByPatient: boolean;
    showEstimatedRxCost: boolean;
  }>;
  showPatientAdmittedBanner: boolean;
  isProxyView: boolean;
  getPatientFirstName: string;
  enableSelectionMode: boolean;
  hostedInIFrame: boolean;
  backToContextSet: boolean;
  medSettings: {
    useRxNormForSearch: boolean;
    alwaysShowSearchMore: boolean;
    defaults: unknown[];
    dateOfBirth: string;
    searchMethod: number;
    isMedAdherenceFeatureEnabled: boolean;
    medicationTakingSettings: {
      reasonsForTakingDifferently: unknown[];
      reasonsForNotTaking: unknown[];
    };
  };
  medicationsUrl: string;
};

/** `/api/documents/viewer/loadotherdocuments` */
export type LoadOtherDocuments = {
  documents: Array<{
    blobCat: string;
    dcsID: string;
    docID: string;
    date: string;
    dateRaw: string;
    dat: string;
    docExt: string;
    docDesc: string;
    docType: string;
    pendingApprovalStatus: number;
    rejectionReasonFreetext: string;
    wasESigned: boolean;
    downloadOnly: boolean;
    new: boolean;
    isExpired: boolean;
    pendingRequiredSignatures: boolean;
    onlyAllowedPreview: boolean;
  }>;
};

/** `/api/goals/loadpatientgoals` */
export type LoadPatientGoals = {
  patientGoals: Array<{
    goalId: string;
    goalType: number;
    readings: unknown[];
    complianceType: number;
    lastUpdatedDate: string;
    creationDate: string;
    isSharingNotesEnabled: boolean;
  }>;
  hasChartGraphSecurity: boolean;
  isSharingNotesEnabled: boolean;
  quickLinkDictionary: {
    HealthSummary: string;
    HealthIssues: string;
    Allergies: string;
    Immunizations: string;
    PreventiveCare: string;
    Medications: string;
    TrackMyHealth: string;
  };
};

/** `/billing/details/loadpaymentlist` */
export type LoadPaymentList = {
  Success: boolean;
  Data: {
    PaymentList: Array<{
      ID: string;
      ElementID: string;
      Index: string;
      DayOfMonth: number;
      Month: number;
      Year: number;
      FormattedDateDisplay: string;
      Description: string;
      SubText: unknown;
      HtmlSubText: string;
      PaymentAmountDisplay: string;
      UndistributedAmountDisplay: unknown;
      CoverageInfo: unknown;
      Receipt: {
        SerialNumber: string;
        FileName: string;
        BlobToken: string;
        IsValidReceipt: boolean;
        DisplayNumber: string;
        PrintStatus: number;
        ReceiptStatus: unknown;
        ViewReceiptOptions: {
          AriaDescribedBy: unknown;
          AriaLabel: string;
          Callback: unknown;
          CssClasses: string;
          DataAttrs: {
            "serial-number": string;
            "blob-token": string;
            "file-path": string;
            "display-number": string;
          };
          IconCssClasses: string;
          IconPath: string;
          Id: unknown;
          IsDisabled: boolean;
          IsSubmit: boolean;
          LinkTarget: unknown;
          MiscContent: unknown;
          Path: unknown;
          Title: unknown;
          UsesJqShowHide: boolean;
          IsSvgSprite: boolean;
          CommandType: number;
        };
        MobileDocViewerSupported: boolean;
        Url: unknown;
      };
      IsBadDebtAdj: boolean;
      IsWriteOffAdj: boolean;
      IsSurchargeAdj: boolean;
      CanEdit: boolean;
      EditPaymentOptions: unknown;
      CanCancel: boolean;
      CancelCommandOptions: unknown;
      ConsentDocument: unknown;
      ViewConsentOptions: unknown;
      IsCardExpiringSoon: boolean;
      HasCardExpired: boolean;
    }>;
    Filters: unknown;
  };
};

/** `/api/report-content/loadreportcontent` */
export type LoadReportContent = {
  reportContent: string;
  reportCss: string;
  baseFontSize: number;
  stylesheets: string[];
};

/** `/proxyswitch` */
export type ProxySwitch = {
  ProxySubjectList: Array<{
    Id: string;
    Ids: unknown[];
    DisplayName: string;
    DisplayText: unknown;
    PhotoUrl: string;
    PhotoMagicId: unknown;
    BlobToken: string;
    TabColor: number;
    LinkUrl: string;
    IsSelected: boolean;
    IsSelf: boolean;
    Loading: boolean;
    Disabled: boolean;
    ServiceAreaAbbreviationList: string;
  }>;
  ShowFriendsAndFamily: boolean;
  ShouldTryAgain: boolean;
  ShowPersonalInformation: boolean;
  ShowAccountSettings: boolean;
  AvailableLanguageList: Array<{
    Name: string;
    DisplayText: string;
    IsSelected: boolean;
  }>;
  CurrentlySelectedTabColor: number;
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
        referenceRange: {
          low: number;
          high: number;
          displayLow: string;
          displayHigh: string;
          lowerBoundExclusive: boolean;
          upperBoundExclusive: boolean;
          formattedReferenceRange: string;
        };
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
      narrative: {
        isRTF: boolean;
        hasContent: boolean;
        contentAsString: string;
        contentAsHtml: string;
        signingInstantTimestamp: string;
      };
      impression: {
        isRTF: boolean;
        hasContent: boolean;
        contentAsString: string;
        contentAsHtml: string;
        signingInstantTimestamp: string;
      };
      combinedRTFNarrativeImpression: {
        isRTF: boolean;
        hasContent: boolean;
        contentAsString: string;
        contentAsHtml: string;
        signingInstantTimestamp: string;
      };
      addenda: unknown[];
      isFullResultText: boolean;
      transcriptions: unknown[];
      ecgDiagnosis: unknown[];
      hasStudyContent: boolean;
    };
    shouldHideHistoricalData: boolean;
    resultNote: {
      isRTF: boolean;
      hasContent: boolean;
      contentAsString: string;
      contentAsHtml: string;
      signingInstantTimestamp: string;
    };
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
    resultLetter: {
      isRTF: boolean;
      hasContent: boolean;
      contentAsString: string;
      contentAsHtml: string;
      signingInstantTimestamp: string;
    };
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

/** `/visits/visitslist/loadpast` */
export type VisitsLoadPast = {
  ViewBagProperties: {
    LoadingOrgNames: string;
    ErrorOrgNames: string;
    ManualOrgNames: string;
  };
  SerializedIndex: string;
  List: Record<string, {
    ViewbagProperties: Record<string, unknown>;
    Organization: {
      OrganizationId: string;
      OrganizationIdentifier: unknown;
      RelatedOrganizations: unknown;
      HasChildOrgs: boolean;
      CELocationId: unknown;
      CELocationHSI: unknown;
      WebsiteName: unknown;
      OrganizationName: string;
      MyChartAppName: unknown;
      SsnLabel: unknown;
      IsLocal: boolean;
      LogoUrl: string;
      TermsAndConditionsUrl: unknown;
      ProxyTermsAndConditionsUrl: unknown;
      Address: string[];
      DisplayAddress: unknown;
      DiscreteAddress: {
        StreetAddress: string[];
        City: string;
        State: string;
        StateName: string;
        Zip: string;
        Country: string;
      };
      ContactInformation: unknown;
      UrlList: unknown;
      IsSSO: boolean;
      IncompleteH2GSetup: boolean;
      LastEncounterInfo: unknown;
      IsGeneric: boolean;
      PayerOrgDetails: {
        OrganizationId: unknown;
        IsPayerOnly: boolean;
        IsPayvider: boolean;
        IsPayer: boolean;
        IsPayerLicensedForMyChart: boolean;
        PayerChildWebsiteName: unknown;
        PayerDXO: unknown;
        PayerCvgLogo: unknown;
        PayerCvgLogoMagicId: unknown;
        PayerCvgToken: unknown;
        PayerCvgName: unknown;
      };
      IsMyChartCentral: boolean;
      IsSameOrganization: boolean;
    };
    List: Array<{
      HasPaymentFeature: boolean;
      HasQuestionnaireFeature: boolean;
      HasNewPvdFeature: boolean;
      IsNotViewed: boolean;
      IsViewStatusVisible: boolean;
      IsClinicalNoteAvailable: boolean;
      IsNotesOnly: boolean;
      IsVisitAmbulatory: boolean;
      FeedbackQnrIDs: unknown[];
      IsAmbPastVisitDetailsEnabled: boolean;
      IsAllIPSecurityPointsDisabled: boolean;
      IsIPPastVisitDetailsEnabled: boolean;
      IsPastVisitDetailsEnabled: boolean;
      ShowVisitDetails: boolean;
      PrimaryDate: string;
      CsnForECheckIn: string;
      UnverifiedProxyJumpUrl: unknown;
      RescheduledDatString: unknown;
      IsNoShow: boolean;
      LeftWithoutSeen: boolean;
      DischargeDate: unknown;
      HasDownloadSummaryLink: boolean;
      HasTransmitSummaryLink: boolean;
      CanRedirectToApptDetails: boolean;
      PastVisitBucket: string;
      IsClinicalInformationAvailable: boolean;
      OwnedBy: number;
      AdmissionDateRange: unknown;
      IsApptDetailsEnabled: boolean;
      IsRequestCancelEnabled: boolean;
      IsDirectCancelEnabled: boolean;
      IsRescheduleEnabled: boolean;
      IsCopayEnabled: boolean;
      IsVisitSummaryEnabled: boolean;
      IsDownloadSummaryEnabled: boolean;
      IsTransmitCEEnabled: boolean;
      IsTransmitDirectEnabled: boolean;
      IsDischargeInstrEnabled: boolean;
      IsPatHandoutsEnabled: boolean;
      IsIPReviewEnabled: boolean;
      IsDischargeSummaryEnabled: boolean;
      IsProviderLinkEnabled: boolean;
      IsPreadmissionEnabled: boolean;
      IsEcheckInCompleted: boolean;
      Csn: string;
      Id: string;
      ReferenceID: string;
      OrganizationLinks: unknown[];
      PrimaryOrganizationLink: unknown;
      Organization: {
        OrganizationId: string;
        OrganizationIdentifier: unknown;
        RelatedOrganizations: unknown;
        HasChildOrgs: boolean;
        CELocationId: unknown;
        CELocationHSI: unknown;
        WebsiteName: unknown;
        OrganizationName: string;
        MyChartAppName: unknown;
        SsnLabel: unknown;
        IsLocal: boolean;
        LogoUrl: string;
        TermsAndConditionsUrl: unknown;
        ProxyTermsAndConditionsUrl: unknown;
        Address: string[];
        DisplayAddress: unknown;
        DiscreteAddress: {
          StreetAddress: string[];
          City: string;
          State: string;
          StateName: string;
          Zip: string;
          Country: string;
        };
        ContactInformation: unknown;
        UrlList: unknown;
        IsSSO: boolean;
        IncompleteH2GSetup: boolean;
        LastEncounterInfo: unknown;
        IsGeneric: boolean;
        PayerOrgDetails: {
          OrganizationId: unknown;
          IsPayerOnly: boolean;
          IsPayvider: boolean;
          IsPayer: boolean;
          IsPayerLicensedForMyChart: boolean;
          PayerChildWebsiteName: unknown;
          PayerDXO: unknown;
          PayerCvgLogo: unknown;
          PayerCvgLogoMagicId: unknown;
          PayerCvgToken: unknown;
          PayerCvgName: unknown;
        };
        IsMyChartCentral: boolean;
        IsSameOrganization: boolean;
      };
      EncodedOrgID: unknown;
      Month: number;
      DateOfMonth: string;
      Year: string;
      IsLocal: boolean;
      IsNonEpic: boolean;
      IsSingleProvider: boolean;
      Telemedicine: unknown;
      EVisit: unknown;
      CanShowTelemedicine: boolean;
      Dat: string;
      Date: string;
      Time: string;
      IsClientTime: boolean;
      ClientTimeZoneMarker: string;
      EncounterType: number;
      VisitTypeName: string;
      Instant: string;
      ArrivalTime: unknown;
      CanShowArrivalTime: boolean;
      EarlyArrivalReason: unknown;
      DurationInMinutes: unknown;
      HasDuration: boolean;
      Copay: unknown;
      CanShowPayments: boolean;
      ShortDate: string;
      IsTimeToBeDetermined: boolean;
      IsHideVisitTime: boolean;
      CanShowAppointmentTime: boolean;
      TimeZone: string;
      Providers: Array<{
        EncryptedId: string;
        Name: string;
        Type: number;
        PhotoUrl: string;
        PhotoLink: unknown;
        WebPageUrl: string;
        HasPhotoOnBlob: boolean;
        PhotoBlobToken: string;
        IsPerson: boolean;
        Department: {
          Id: string;
          Name: string;
          Address: string[];
          HasAddress: boolean;
          PhoneNumber: string;
          Instructions: unknown[];
          ShouldShowInstructions: boolean;
          TimeZone: string;
          ArrivalLocation: string;
          Specialty: {
            Value: string;
            Title: string;
            TitleUtf8: unknown;
            Abbreviation: string;
          };
          CanShowDrivingDirections: boolean;
          IsPreadmissionLocation: boolean;
        };
        PhotoClass: string;
      }>;
      OtherProviders: unknown[];
      NumberOfOthers: number;
      PrimaryProvider: {
        EncryptedId: string;
        Name: string;
        Type: number;
        PhotoUrl: string;
        PhotoLink: unknown;
        WebPageUrl: string;
        HasPhotoOnBlob: boolean;
        PhotoBlobToken: string;
        IsPerson: boolean;
        Department: {
          Id: string;
          Name: string;
          Address: string[];
          HasAddress: boolean;
          PhoneNumber: string;
          Instructions: unknown[];
          ShouldShowInstructions: boolean;
          TimeZone: string;
          ArrivalLocation: string;
          Specialty: {
            Value: string;
            Title: string;
            TitleUtf8: unknown;
            Abbreviation: string;
          };
          CanShowDrivingDirections: boolean;
          IsPreadmissionLocation: boolean;
        };
        PhotoClass: string;
      };
      PrimaryProviderName: string;
      PrimaryDepartment: {
        Id: string;
        Name: string;
        Address: string[];
        HasAddress: boolean;
        PhoneNumber: string;
        Instructions: unknown[];
        ShouldShowInstructions: boolean;
        TimeZone: string;
        ArrivalLocation: string;
        Specialty: {
          Value: string;
          Title: string;
          TitleUtf8: unknown;
          Abbreviation: string;
        };
        CanShowDrivingDirections: boolean;
        IsPreadmissionLocation: boolean;
      };
      CanRequestCancel: boolean;
      IsCanceled: boolean;
      CanReschedule: boolean;
      RescheduledDat: string;
      IsDetailsEnabled: boolean;
      IsInHomeVisit: boolean;
      ECheckIn: unknown;
      CanShowECheckIn: boolean;
      ShouldDeprecateECheckInBrand: boolean;
      IsMultiPhaseOn: boolean;
      CanShowECheckInComplete: boolean;
      IsECheckInComplete: boolean;
      HasChildrenNeedingECheckIn: boolean;
      NextIncompleteVisitECheckInCsn: unknown;
      IsEcheckInEnabled: boolean;
      IsECheckInIncomplete: boolean;
      CanECheckIn: boolean;
      ShouldShowECheckInInGuideBanner: boolean;
      CanShowAddToCalendar: boolean;
      IsPastVisit: boolean;
      HighlightDate: string;
      IsDrivingDirectionsEnabled: boolean;
      ConfirmationStatus: number;
      IsConfirmed: boolean;
      IsCancelRequestSent: boolean;
      CanDirectlyCancel: boolean;
      IsUsingFallbackVisitTypeName: boolean;
      ChiefComplaint: string;
      Diagnoses: unknown;
      HasSentUpgradeRequest: boolean;
      CanSendUpgradeRequest: boolean;
      IsUserInitiatedArrivalAllowed: boolean;
      SelfArrivalMechanism: number;
      SelfArrivalBannerViewModel: unknown;
      GeolocationArrival: number;
      ArrivalStatus: unknown;
      PatientNextStepInstructions: string;
      ArrivalAdditionalActions: unknown[];
      IsArrived: boolean;
      IsProxyRequestMinorFormOn: boolean;
      ProxyRequestMinorForm: string;
      GuestPatientFirstName: unknown;
      TelehealthMode: number;
      IsUnverifiedOnDemandVideoVisit: boolean;
      EncryptedLvvId: unknown;
      InProgress: boolean;
      IsResidentialMed: boolean;
      ShowPFIOLink: boolean;
      IsCEOptedIn: boolean;
      UserMyChartStatus: number;
      EncounterIsSurgery: boolean;
      EncounterIsEDVisit: boolean;
      IsPreadmission: boolean;
      SurgeryTimeOfDay: number;
      PreadmissionLocation: unknown;
      Cases: unknown;
      IsHovPreadmission: boolean;
      HasProcedures: boolean;
      NumberOfProcedures: number;
      SurgicalProcedures: unknown;
      ComponentVisits: unknown;
      HasComponentVisits: boolean;
      HasPaymentInfo: boolean;
      IsFullyPaid: boolean;
      CompleteECheckInCount: number;
      TotalECheckInCount: number;
      EpisodeDetails: {
        GestationalAge: string;
      };
    }>;
    ListSize: number;
    HasMoreData: boolean;
    CanSearch: boolean;
    SkippedSomeResults: boolean;
    SerializedIndex: string;
  }>;
  CanSearch: boolean;
  CanAllSearch: boolean;
  CanSort: boolean;
  AutoRenderThisSet: boolean;
  SkippedSomeResults: boolean;
  Organizations: Record<string, {
    OrganizationId: string;
    OrganizationIdentifier: unknown;
    RelatedOrganizations: unknown;
    HasChildOrgs: boolean;
    CELocationId: unknown;
    CELocationHSI: unknown;
    WebsiteName: unknown;
    OrganizationName: string;
    MyChartAppName: unknown;
    SsnLabel: unknown;
    IsLocal: boolean;
    LogoUrl: string;
    TermsAndConditionsUrl: unknown;
    ProxyTermsAndConditionsUrl: unknown;
    Address: string[];
    DisplayAddress: unknown;
    DiscreteAddress: {
      StreetAddress: string[];
      City: string;
      State: string;
      StateName: string;
      Zip: string;
      Country: string;
    };
    ContactInformation: unknown;
    UrlList: unknown;
    IsSSO: boolean;
    IncompleteH2GSetup: boolean;
    LastEncounterInfo: unknown;
    IsGeneric: boolean;
    PayerOrgDetails: {
      OrganizationId: unknown;
      IsPayerOnly: boolean;
      IsPayvider: boolean;
      IsPayer: boolean;
      IsPayerLicensedForMyChart: boolean;
      PayerChildWebsiteName: unknown;
      PayerDXO: unknown;
      PayerCvgLogo: unknown;
      PayerCvgLogoMagicId: unknown;
      PayerCvgToken: unknown;
      PayerCvgName: unknown;
    };
    IsMyChartCentral: boolean;
    IsSameOrganization: boolean;
  }>;
};

/** `/visits/visitslist/loadupcoming` */
export type VisitsLoadUpcoming = {
  LaterVisitsList: Array<{
    HasPaymentFeature: boolean;
    HasQuestionnaireFeature: boolean;
    HasNewPvdFeature: boolean;
    PrimaryDate: string;
    CsnForECheckIn: string;
    UnverifiedProxyJumpUrl: unknown;
    RescheduledDatString: unknown;
    IsNoShow: boolean;
    LeftWithoutSeen: boolean;
    DischargeDate: unknown;
    HasDownloadSummaryLink: boolean;
    HasTransmitSummaryLink: boolean;
    CanRedirectToApptDetails: boolean;
    PastVisitBucket: unknown;
    IsClinicalInformationAvailable: boolean;
    OwnedBy: number;
    AdmissionDateRange: unknown;
    IsApptDetailsEnabled: boolean;
    IsRequestCancelEnabled: boolean;
    IsDirectCancelEnabled: boolean;
    IsRescheduleEnabled: boolean;
    IsCopayEnabled: boolean;
    IsVisitSummaryEnabled: boolean;
    IsDownloadSummaryEnabled: boolean;
    IsTransmitCEEnabled: boolean;
    IsTransmitDirectEnabled: boolean;
    IsDischargeInstrEnabled: boolean;
    IsPatHandoutsEnabled: boolean;
    IsIPReviewEnabled: boolean;
    IsDischargeSummaryEnabled: boolean;
    IsProviderLinkEnabled: boolean;
    IsPreadmissionEnabled: boolean;
    IsEcheckInCompleted: boolean;
    Csn: string;
    Id: string;
    ReferenceID: string;
    OrganizationLinks: unknown[];
    PrimaryOrganizationLink: unknown;
    Organization: {
      OrganizationId: string;
      OrganizationIdentifier: unknown;
      RelatedOrganizations: unknown;
      HasChildOrgs: boolean;
      CELocationId: unknown;
      WebsiteName: unknown;
      OrganizationName: string;
      MyChartAppName: unknown;
      SsnLabel: unknown;
      IsLocal: boolean;
      LogoUrl: string;
      TermsAndConditionsUrl: unknown;
      ProxyTermsAndConditionsUrl: unknown;
      Address: string[];
      DisplayAddress: unknown;
      ContactInformation: unknown;
      UrlList: unknown;
      IsSSO: boolean;
      IncompleteH2GSetup: boolean;
      LastEncounterInfo: unknown;
      IsGeneric: boolean;
      PayerOrgDetails: {
        OrganizationId: unknown;
        IsPayerOnly: boolean;
        IsPayvider: boolean;
        IsPayer: boolean;
        IsPayerLicensedForMyChart: boolean;
        PayerChildWebsiteName: unknown;
        PayerDXO: unknown;
        PayerCvgLogo: unknown;
        PayerCvgLogoMagicId: unknown;
        PayerCvgToken: unknown;
        PayerCvgName: unknown;
      };
      IsMyChartCentral: boolean;
      IsSameOrganization: boolean;
    };
    EncodedOrgID: unknown;
    Month: number;
    DateOfMonth: string;
    Year: string;
    IsLocal: boolean;
    IsNonEpic: boolean;
    IsSingleProvider: boolean;
    Telemedicine: unknown;
    EVisit: unknown;
    CanShowTelemedicine: boolean;
    Dat: string;
    Date: string;
    Time: string;
    IsAM: boolean;
    IsClientTime: boolean;
    ClientTimeZoneMarker: string;
    EncounterType: number;
    VisitTypeName: string;
    Instant: string;
    ArrivalTime: unknown;
    CanShowArrivalTime: boolean;
    EarlyArrivalReason: unknown;
    DurationInMinutes: unknown;
    HasDuration: boolean;
    Copay: unknown;
    CanShowPayments: boolean;
    ShortDate: string;
    IsTimeToBeDetermined: boolean;
    IsHideVisitTime: boolean;
    CanShowAppointmentTime: boolean;
    TimeZone: string;
    Providers: Array<{
      EncryptedId: string;
      Name: string;
      Type: number;
      PhotoUrl: string;
      PhotoLink: string;
      WebPageUrl: string;
      HasPhotoOnBlob: boolean;
      PhotoBlobToken: string;
      IsPerson: boolean;
      Department: {
        Id: string;
        Name: string;
        Address: string[];
        HasAddress: boolean;
        PhoneNumber: string;
        Instructions: unknown[];
        ShouldShowInstructions: boolean;
        TimeZone: string;
        ArrivalLocation: string;
        Specialty: {
          Value: string;
          Title: string;
          TitleUtf8: unknown;
          Abbreviation: string;
        };
        CanShowDrivingDirections: boolean;
        IsPreadmissionLocation: boolean;
      };
      PhotoClass: string;
    }>;
    OtherProviders: unknown[];
    NumberOfOthers: number;
    PrimaryProvider: {
      EncryptedId: string;
      Name: string;
      Type: number;
      PhotoUrl: string;
      PhotoLink: string;
      WebPageUrl: string;
      HasPhotoOnBlob: boolean;
      PhotoBlobToken: string;
      IsPerson: boolean;
      Department: {
        Id: string;
        Name: string;
        Address: string[];
        HasAddress: boolean;
        PhoneNumber: string;
        Instructions: unknown[];
        ShouldShowInstructions: boolean;
        TimeZone: string;
        ArrivalLocation: string;
        Specialty: {
          Value: string;
          Title: string;
          TitleUtf8: unknown;
          Abbreviation: string;
        };
        CanShowDrivingDirections: boolean;
        IsPreadmissionLocation: boolean;
      };
      PhotoClass: string;
    };
    PrimaryProviderName: string;
    PrimaryDepartment: {
      Id: string;
      Name: string;
      Address: string[];
      HasAddress: boolean;
      PhoneNumber: string;
      Instructions: unknown[];
      ShouldShowInstructions: boolean;
      TimeZone: string;
      ArrivalLocation: string;
      Specialty: {
        Value: string;
        Title: string;
        TitleUtf8: unknown;
        Abbreviation: string;
      };
      CanShowDrivingDirections: boolean;
      IsPreadmissionLocation: boolean;
    };
    CanRequestCancel: boolean;
    IsCanceled: boolean;
    CanReschedule: boolean;
    RescheduledDat: string;
    IsDetailsEnabled: boolean;
    IsInHomeVisit: boolean;
    ECheckIn: {
      Status: {
        Value: string;
        Title: string;
        Abbreviation: string;
      };
      IsNotStarted: boolean;
      IsInProgress: boolean;
      IsComplete: boolean;
      Barcode: string;
      HasBarcodeStep: boolean;
      ClinicSteps: unknown[];
      RequiredECheckInSteps: unknown[];
      OptionalECheckInSteps: unknown;
      UnavailableECheckInSteps: unknown;
      HasQuestionnaireLink: boolean;
      IsAdmission: boolean;
      IsSurgery: boolean;
      IsQnrAfterBarcode: boolean;
      IsConfirmationView: boolean;
      SignUpLink: unknown;
      HasSignUpLink: boolean;
      IsRequiredForTelemedicine: boolean;
      CanShow: boolean;
      HasPaymentECheckInStep: boolean;
      HasQuestionnaireStep: boolean;
      IsInHelloPatientWindow: boolean;
      MultiPhaseOn: boolean;
    };
    CanShowECheckIn: boolean;
    ShouldDeprecateECheckInBrand: boolean;
    CanShowECheckInComplete: boolean;
    IsECheckInComplete: boolean;
    NextIncompleteVisitECheckInCsn: unknown;
    IsEcheckInEnabled: boolean;
    IsECheckInIncomplete: boolean;
    CanECheckIn: boolean;
    ShouldShowECheckInInGuideBanner: boolean;
    CanShowAddToCalendar: boolean;
    IsPastVisit: boolean;
    HighlightDate: string;
    IsDrivingDirectionsEnabled: boolean;
    ConfirmationStatus: number;
    IsConfirmed: boolean;
    IsCancelRequestSent: boolean;
    CanDirectlyCancel: boolean;
    IsUsingFallbackVisitTypeName: boolean;
    ChiefComplaint: string;
    Diagnoses: unknown;
    HasSentUpgradeRequest: boolean;
    CanSendUpgradeRequest: boolean;
    IsUserInitiatedArrivalAllowed: boolean;
    SelfArrivalMechanism: number;
    SelfArrivalBannerViewModel: unknown;
    GeolocationArrival: number;
    ArrivalStatus: number;
    PatientNextStepInstructions: string;
    ArrivalAdditionalActions: unknown[];
    IsProxyRequestMinorFormOn: boolean;
    ProxyRequestMinorForm: string;
    GuestPatientFirstName: unknown;
    TelehealthMode: number;
    IsUnverifiedOnDemandVideoVisit: boolean;
    EncryptedLvvId: unknown;
    InProgress: boolean;
    IsResidentialMed: boolean;
    ShowPFIOLink: boolean;
    IsCEOptedIn: boolean;
    UserMyChartStatus: number;
    EncounterIsSurgery: boolean;
    EncounterIsEDVisit: boolean;
    IsPreadmission: boolean;
    SurgeryTimeOfDay: unknown;
    PreadmissionLocation: unknown;
    Cases: unknown;
    IsHovPreadmission: boolean;
    HasProcedures: boolean;
    NumberOfProcedures: number;
    SurgicalProcedures: unknown;
    ComponentVisits: unknown;
    HasComponentVisits: boolean;
    HasPaymentInfo: boolean;
    IsFullyPaid: boolean;
    CompleteECheckInCount: number;
    TotalECheckInCount: number;
  }>;
  NextNDaysVisits: unknown[];
  InProgressVisits: unknown[];
  HighlightDays: string[];
  HasPVG: boolean;
};
