/**
 * Raw MyChart responses for the `prelogin` scraper.
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
 * Endpoints: /Scheduling/Anonymous/GetSchedulingWorkflowData, /Scheduling/Anonymous/GetSpecialtyData, /GuestEstimates/SelectLocation, /GuestEstimates/SelectServiceArea
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

import type { County } from '../wire/shared';

/** Repeated shape. Appears in: prelogin. */
export type ProviderStepSetting = {
  ReadOnly: boolean;
  Hide: boolean;
  HideIfOne: boolean;
  Collapse: boolean;
  CollapseIfOne: boolean;
};

/** Repeated shape. Appears in: prelogin. */
export type Location = {
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

/** Repeated shape. Appears in: prelogin. */
export type OriginalAppointmentInfo = {
  BundleId: unknown;
  FromDte: unknown;
  ToDte: unknown;
  Dat: unknown;
  SingleReasonForVisitId: unknown;
  BundleReasonForVisitId: unknown;
  OriginalAppointments: unknown;
  IsForceSameDay: boolean;
};

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
    ProviderStepSettings: ProviderStepSetting;
    DepartmentStepSettings: ProviderStepSetting;
    ReasonForVisitStepSettings: ProviderStepSetting;
    QuickScheduleStepSettings: unknown;
    SpecialtyStepSettings: ProviderStepSetting;
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
    RescheduleReasons: County[];
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
  OriginalAppointmentInfo: OriginalAppointmentInfo;
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
    Specialties: County[];
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
      CacheTimeZone: County;
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
  OriginalAppointmentInfo: OriginalAppointmentInfo;
  OnDemandTelehealthData: unknown;
  FavoriteAppointments: unknown[];
  SchedulingMenusViewModels: unknown[];
  LoadError: unknown;
  IsWidget: boolean;
  PreselectedTicketStatus: number;
  OtherRfvUrl: unknown;
  OtherRfvFilename: string;
};

/** `/GuestEstimates/SelectLocation (inlined var model)` */
export type GuestEstimatesLocationModel = {
  Locations: Location[];
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
