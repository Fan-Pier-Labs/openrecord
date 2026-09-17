/**
 * What a MyChart instance says about the health system behind it, to anyone —
 * no account, no login.
 *
 * Every field here comes from a page or endpoint an anonymous browser can open:
 * the login shell, the "Find a Doctor" open-scheduling workflow, and the guest
 * price-estimate flow. See `networkProfile.ts` for where each one is read.
 *
 * `fax` is deliberately absent. MyChart never publishes one — not on the login
 * page, the FAQ, the terms, the privacy policy, nor any captured post-login
 * response — so a field for it would only ever be null.
 */

import type { County } from '../shared/mychart.types';
/** A phone number as MyChart renders it, plus the digits behind it. */
export type PhoneNumber = {
  /** The text a patient sees: "555-010-0100", or a vanity "800-4Sprng". */
  display: string;
  /**
   * The digits from the `tel:` link when the page rendered one, else the
   * digits found in `display`. Null for a vanity number with no `tel:` link.
   */
  digits: string | null;
};

/** The organization's own contact lines, as inlined on every pre-login page. */
export type OrgProfile = {
  /** `@MYCHART@ORGNAME@` — "Springfield General Hospital". */
  organizationName: string | null;
  /** `@MYCHART@APPTITLE@` — what the org calls its portal ("MySpringfield Chart"). */
  portalBrand: string | null;
  /** `@MYCHART@ABSOLUTEURL@` — the mount prefix the page was served under ("/MyChart-SGH/"). */
  mountPath: string | null;
  phones: {
    helpDesk: PhoneNumber | null;
    scheduling: PhoneNumber | null;
    billing: PhoneNumber | null;
  };
  /** `@MYCHART@HELPEMAIL@`, when it is not Epic's `DoNotUse` placeholder. */
  supportEmail: string | null;
};

export type Specialty = {
  id: string;
  name: string;
};

export type Provider = {
  /** Opaque, per-instance provider id (WP-encoded). Stable across specialties. */
  id: string;
  /** "Jane Doe, MD" */
  name: string;
  /** "Doe, Jane, MD" */
  nameLastFirst: string;
  /** "Physician", "Nurse Practitioner", … */
  credentials: string;
  /** Clinical specialties as the instance titles them ("Internal Medicine"). */
  specialties: string[];
  gender: string;
  languages: string[];
  photoUrl: string | null;
  /** URL slug of the provider's bio page (the page itself needs a login). */
  bioSlug: string | null;
  /** Ids into `clinics` — every department this provider is bookable at. */
  clinicIds: string[];
  /** The "Find a Doctor" specialties this provider was listed under. */
  finderSpecialties: string[];
  /**
   * Search terms the newer scheduling build attaches to a provider. Absent on
   * older builds — three of the five captured instances sent it, two did not.
   */
  searchTerms?: string[];
};

export type Clinic = {
  /** Opaque department id (WP-encoded). */
  id: string;
  name: string;
  /** Street lines then "City ST 12345", exactly as the instance renders them. */
  addressLines: string[];
  phone: string | null;
  coordinates: { latitude: number; longitude: number } | null;
  /** IANA zone name ("America/New_York") when the instance sent one. */
  timeZone: string | null;
};

/** A billing entity from the guest price-estimate flow, with its facilities. */
export type BillingEntity = {
  id: string;
  name: string;
  /** The customer-service line for this entity's bills. */
  phone: string | null;
  logoUrl: string | null;
  /** Hospitals / campuses under this entity, when the instance groups by location. */
  facilities: { id: string; name: string }[];
};

/**
 * Which features this portal has switched on, from the open-scheduling
 * workflow settings. Useful before anyone has an account.
 */
export type PortalFeatures = {
  selfSignup: boolean;
  loginEnabled: boolean;
  openScheduling: boolean;
  scheduleAsGuest: boolean;
  onMyWay: boolean;
  onDemandVideoVisits: boolean;
};

export type ProviderDirectory = {
  specialties: Specialty[];
  providers: Provider[];
  clinics: Clinic[];
  features: PortalFeatures;
  /** `HomeOrganizationName` from the workflow, which can differ from the login page's. */
  organizationName: string | null;
};

/**
 * Accepted-insurance status. The payer list sits on the last page of the
 * guest estimate flow, behind a price-transparency disclaimer whose accept
 * step is protected by reCAPTCHA. The scraper reports the gate; it never
 * tries to get past it.
 *
 * The post-login route around it is `get_insurance_payers`
 * (`chart/insurancePayers`), which reads the organization's payer catalogue
 * off the Add Coverage form. That needs an account on the instance, so it is
 * not something this pre-login profile can call.
 */
export type InsuranceAvailability = {
  status: 'gated';
  reason: string;
};

export type HospitalNetworkProfile = {
  /** The host that actually serves MyChart — discovery may have moved us. */
  hostname: string;
  /** Mount prefix without slashes ("MyChart-SGH"), or null at the domain root. */
  mount: string | null;
  profile: OrgProfile;
  directory: ProviderDirectory | null;
  billingEntities: BillingEntity[] | null;
  insurance: InsuranceAvailability;
  /**
   * Sections that could not be read, with why. A portal with open scheduling
   * switched off is not an error for the contact profile, so each section
   * fails on its own.
   */
  warnings: string[];
};

/**
 * One open appointment slot, as the anonymous scheduling search returns it.
 *
 * `providerId` and `clinicId` are the same opaque ids `Provider.id` and
 * `Clinic.id` carry, so a slot joins straight onto the directory.
 */
export type OpenSlot = {
  providerId: string;
  clinicId: string;
  visitTypeId: string | null;
  /** ISO instant ("2026-09-08T17:00:00Z"). Null if the instance omitted it. */
  startUtc: string | null;
  /** The clinic's own rendering — "Tuesday September 8, 2026" / "1:00 PM". */
  localDate: string | null;
  localTime: string | null;
  /** "EDT", "PST" — the marker MyChart displays, not an IANA zone. */
  timeZoneMarker: string | null;
  lengthInMinutes: number | null;
  /** 1 = in person, 2 = video, on every instance captured so far. */
  telehealthMode: number | null;
  /** The untouched slot record, so nothing MyChart sent is lost. */
  raw: unknown;
};

export type SlotSearchResult = {
  specialty: Specialty;
  slots: OpenSlot[];
  /** How many `GetSlots` round trips it took. */
  pages: number;
  /**
   * The instance's own `ErrorCode` for the last search, or null. Passed
   * through uninterpreted — it covers both back-pressure and "cannot search",
   * and the code table is not published.
   */
  errorCode: number | string | null;
  /** The server reported the search finished rather than the page cap hitting. */
  complete: boolean;
  /**
   * Set when the org gates this visit type behind a screening questionnaire
   * that has not been answered. The search still runs — the `errorCode` the
   * instance returns is evidence worth keeping — but it will answer
   * `LqfAnswersRequired` rather than return slots.
   */
  questionnaire: SchedulingQuestionnaire | null;
};

/**
 * How far ahead an instance will search, in whole days from today.
 *
 * Published by the org in `WorkflowSettings`, so a client can ask someone when
 * they want to be seen without offering dates the instance will refuse.
 * `explicit` is false when the instance published neither bound and these are
 * the defaults.
 */
export type SchedulingWindow = {
  earliestDaysOut: number;
  latestDaysOut: number;
  explicit: boolean;
};

// ─── The screening questionnaire ────────────────────────────────────────────

/** One choice a question offers. `index` is what an answer refers to. */
export type QuestionChoice = { index: string; text: string };

/** A question the tree asked, flattened to what a caller needs to answer it. */
export type SchedulingQuestion = {
  /** Opaque question id. Stable across sessions on the instances checked. */
  id: string;
  prompt: string;
  choices: QuestionChoice[];
  required: boolean;
  /**
   * The question accepts more than one choice. Answering one is not supported
   * yet — `answerPayload` throws `WorkInProgressError` rather than send a
   * payload no live instance has been watched accept. 3 of 198 sampled
   * instances open with one.
   */
  multiResponse: boolean;
  /**
   * The question takes typed text. Also not supported yet, and also a throw
   * rather than a guess. 6 of 198 sampled instances open with one.
   */
  freeText: boolean;
  helpText: string | null;
};

/**
 * How a caller answers one question.
 *
 * Only a single `choiceIndex` works today. The array and `text` forms are the
 * shapes Epic's serializer implies for multi-response and free-text questions,
 * and both currently throw `WorkInProgressError` — they are declared so the
 * gap is visible in the type rather than discovered when a tree stalls.
 */
export type QuestionAnswer = {
  questionId: string;
  choiceIndex?: string | string[];
  text?: string;
};

/**
 * The ids a completed questionnaire yields, and what a slot search needs.
 *
 * Verified to survive the session it was produced in: a token walked in one
 * session searched successfully from a second, fresh one. So a client can ask
 * its questions at leisure — across a restart, or a different process — and
 * hand the token back whenever the person has answered.
 */
export type QuestionnaireAnswerToken = {
  lqfIds: string[];
  patientAnswerIds: string[];
};

/**
 * What a client needs to put a questionnaire in front of someone.
 *
 * The questions arrive one at a time because this is a decision tree, not a
 * form: what it asks second depends on the first answer. `nextQuestion` is
 * what to ask now, `questions` is everything seen so far in order, and
 * `complete` with an `answerToken` means the search can run.
 *
 * Pass the whole object back to `submitSchedulingAnswers` — it carries the
 * tree and visit type, so the next round skips the multi-megabyte specialty
 * download it would otherwise repeat per answer.
 */
export type SchedulingQuestionnaire = {
  /** False when the org attaches no tree — nothing to ask, search directly. */
  required: boolean;
  treeId: string | null;
  /** The visit type the tree hangs off, carried so a round trip can skip it. */
  visitTypeId: string | null;
  /** Ask this next. Null when the walk is finished or nothing is required. */
  nextQuestion: SchedulingQuestion | null;
  /** Every question answered or seen so far, in the order the tree gave them. */
  questions: SchedulingQuestion[];
  complete: boolean;
  /**
   * Present once `complete`; pass it to `fetchOpenSlots` as `answerToken`.
   * Null while questions remain — and also when the tree ended without one,
   * which is how an org routes an emergency out of online scheduling.
   */
  answerToken: QuestionnaireAnswerToken | null;
  /** Which specialty and reason these questions belong to. */
  specialty: Specialty;
  reasonForVisit: string | null;
  /**
   * How far out this instance will book. A client asking "when would you like
   * to be seen?" should keep the answer inside this window; pass the chosen
   * date to `fetchOpenSlots` as `startDate`.
   */
  window: SchedulingWindow;
};

/* ── Captured responses ──────────────────────────────────────────────────
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty.
 * Read a payload with `rec<T>()`, never `as` — see `../../wire/README.md`.
 */


/** Repeated shape. Appears in: prelogin. */
export type ProviderStepSetting = {
  ReadOnly?: boolean;
  Hide?: boolean;
  HideIfOne?: boolean;
  Collapse?: boolean;
  CollapseIfOne?: boolean;
};

/** Repeated shape. Appears in: prelogin. */
export type Location = {
  Id?: string;
  Title?: string;
  Phone?: string;
  PhoneText?: string;
  Description?: string;
  LogoURL?: string;
  DefaultLogoURL?: unknown;
  SelectLocations?: boolean;
  BillingSystem?: number;
};

/** Repeated shape. Appears in: prelogin. */
export type OriginalAppointmentInfo = {
  BundleId?: unknown;
  FromDte?: unknown;
  ToDte?: unknown;
  Dat?: unknown;
  SingleReasonForVisitId?: unknown;
  BundleReasonForVisitId?: unknown;
  OriginalAppointments?: unknown;
  IsForceSameDay?: boolean;
};

/** `/Scheduling/Anonymous/GetSchedulingWorkflowData` */
export type AnonymousSchedulingWorkflowData = {
  WorkflowSettings?: {
    WorkflowType?: number;
    FromMinutesOffset?: unknown;
    FromDaysOffset?: number;
    ToDaysOffset?: number;
    NewProvFromDaysOffset?: number;
    NewProvToDaysOffset?: number;
    TicketId?: unknown;
    Csn?: unknown;
    RootDecisionTreeId?: string;
    DecisionTreeNodeId?: string;
    DecisionTreeAnswerId?: unknown;
    DecisionTreeNodeCsn?: string;
    AllowedProviderIds?: unknown;
    PreselectedProviderIds?: unknown;
    AllowedDepartmentIds?: unknown;
    PreselectedDepartmentIds?: unknown;
    PreselectedPatientType?: number;
    AllowedReasonForVisitIds?: unknown;
    AllowedVisitTypeIds?: unknown;
    PreselectedReasonForVisitIds?: unknown;
    AllowedSpecialtyIds?: unknown[];
    PreselectedSpecialtyId?: unknown;
    PreselectedSlotUID?: unknown;
    PromotedSpecialtyIds?: string[];
    StartDate?: unknown;
    EndDate?: unknown;
    CampaignId?: string;
    LinkSource?: unknown;
    ReferringPage?: unknown;
    TermIds?: unknown;
    InsuranceId?: unknown;
    ProviderStepSettings?: ProviderStepSetting;
    DepartmentStepSettings?: ProviderStepSetting;
    ReasonForVisitStepSettings?: ProviderStepSetting;
    QuickScheduleStepSettings?: unknown;
    SpecialtyStepSettings?: ProviderStepSetting;
    DateRangeSettings?: unknown;
    TimePreferences?: unknown;
    UseOnFileTimePreferences?: boolean;
    SchedulePreferences?: {
      Days?: unknown[];
      Times?: unknown[];
      TimeStrings?: unknown[];
    };
    DaysOfWeekList?: string[];
    PreselectedFilters?: unknown[];
    AvailableFilters?: unknown[];
    AllowTeamScheduling?: number;
    ShowTeamBeforeSearch?: number;
    SchedulingVerificationSteps?: unknown;
    AllowODVVComments?: boolean;
    RequireODVVComments?: boolean;
    RequireRequestComments?: boolean;
    ShowOtherProviderOption?: boolean;
    ShowOtherRfvOption?: boolean;
    MaxCommentsLength?: number;
    RequireECheckInForTelemedicine?: boolean;
    MultiPhaseECheckInOn?: boolean;
    AllowOpenSchedulingWizard?: boolean;
    CanShowProviderFinderDefaultLink?: boolean;
    CanShowLocationFinderDefaultLink?: boolean;
    AllowOnMyWay?: boolean;
    DisableFavoriteAppointments?: boolean;
    RequestReasons?: unknown[];
    RequireRescheduleReason?: boolean;
    RescheduleReasons?: County[];
    LocationGroupMethod?: number;
    LocationGroupingBehavior?: number;
    ProviderNameDisplayFormat?: number;
    Viewers?: unknown[];
    AllowSelectViewers?: boolean;
    ShowViewers?: boolean;
    ShowInsuranceVerificationStep?: boolean;
    ShowDemographicVerificationStep?: boolean;
    HasOnDemandVideoVisitSecurity?: boolean;
    ShowVideoVisitSidebar?: boolean;
    HasQuickScheduleSecurity?: boolean;
    ShowEVisitSidebar?: boolean;
    HasAppointmentDetailsSecurity?: boolean;
    HasProviderDetailsSecurity?: boolean;
    IsAlwaysSelfPay?: boolean;
    ShowSidebarLinks?: boolean;
    GeolocationNumLocationsToSelect?: number;
    GeolocationInnerRadius?: number;
    GeolocationOuterRadius?: number;
    MaxOpenSchedulingApptCount?: number;
    CurrentDTE?: number;
    IsReservationAllowed?: boolean;
    GeolocationDistanceUnits?: number;
    GeolocationStreetAddress?: unknown[];
    Banners?: unknown[];
    AllowSelfSignup?: boolean;
    IsLoginEnabled?: boolean;
    TopicIds?: unknown[];
    TopicNames?: unknown[];
    IsWorkflowTurnedOn?: boolean;
    IsSortingByAvailability?: boolean;
    ServiceAreas?: unknown;
    StringKey?: unknown;
    DisableScheduleAsGuest?: boolean;
    DefaultProviderLanguages?: unknown[];
    IsStandaloneWidget?: boolean;
    IsFromPrelogin?: boolean;
    IsFromShopperState?: boolean;
    HasSeparateLocationSelectionInTicketBundles?: boolean;
    IsPatientLocationStepRequired?: boolean;
    AccessCode?: unknown;
    IsProxy?: boolean;
    ProxyContextName?: unknown;
    IsAdminLoginFromHyperspace?: boolean;
    SkipMobileLogout?: boolean;
    AllowMobileSchedulingInlineRedirects?: boolean;
    HasPatientLocationRule?: boolean;
    EmbeddedConsecutiveSlotLoadLimit?: number;
    CanUseCadenceAppointmentRequests?: boolean;
    IsInSchedulingDebugMode?: boolean;
    DebugModeBanner?: unknown;
    SourceWorkflow?: number;
    HideBackNavigation?: boolean;
    IsDemoMode?: boolean;
    FinderType?: unknown;
  };
  Providers?: unknown[];
  Departments?: unknown[];
  Locations?: unknown[];
  TelehealthLocations?: unknown;
  HomeOrganizationName?: string;
  ProviderDepartmentPairs?: unknown[];
  ReasonsForVisit?: unknown[];
  ReasonForVisitDepartmentOverrides?: unknown[];
  VisitTypes?: unknown[];
  ActionPreviews?: unknown[];
  VisitTypeDepartmentOverrides?: unknown[];
  Specialties?: Array<{
    Id?: string;
    Name?: string;
    HelpText?: unknown;
    PhotoUrl?: unknown;
    StandardSpecialtyValue?: unknown;
  }>;
  Tickets?: unknown[];
  OrderMap?: Record<string, unknown>;
  OriginalAppointmentInfo?: OriginalAppointmentInfo;
  OnDemandTelehealthData?: {
    TelehealthLocations?: Array<{
      Number?: string;
      Value?: string;
      Title?: string;
      Abbreviation?: string;
      SelectedByDefault?: boolean;
      SubLocations?: unknown[];
      ID?: unknown;
      Name?: unknown;
      NameUTF8?: unknown;
    }>;
    VideoVisitWaitTime?: unknown;
    OnDemandVideoVisitCSN?: unknown;
    XOrgId?: unknown;
    XOrgCSN?: unknown;
    ExistingVideoVisitCSN?: unknown;
    ExistingVideoVisitProviders?: unknown;
    ShowEmailOption?: boolean;
    ShowSMSOption?: boolean;
    CheckEmailOption?: boolean;
    CheckSMSOption?: boolean;
    EmailAddress?: unknown;
    PhoneNumber?: unknown;
    AreNewODVVsEnabled?: boolean;
    IsPushNotificationEnabled?: boolean;
    IsXOrgEnabled?: boolean;
    InXOrgQueue?: boolean;
    OnDemandVideoVisitError?: boolean;
    HideInsuranceStepForXOrg?: boolean;
    HideSchedulingOptions?: boolean;
    ExpandSplashPageByDefault?: boolean;
    HideEstimatedWait?: boolean;
    HideEstimatedCost?: boolean;
    ShowEstimatedCostForXORG?: boolean;
    RequireLocationConfirmation?: boolean;
    HomeLogoURL?: unknown;
  };
  FavoriteAppointments?: unknown[];
  SchedulingMenusViewModels?: unknown[];
  LoadError?: unknown;
  IsWidget?: boolean;
  PreselectedTicketStatus?: number;
  OtherRfvUrl?: unknown;
  OtherRfvFilename?: string;
};

/** `/Scheduling/Anonymous/GetSpecialtyData` */
export type AnonymousSpecialtyData = {
  WorkflowSettings?: unknown;
  Providers?: Array<{
    Name?: string;
    NameLastFirst?: string;
    BioSlug?: string;
    BioId?: string;
    PcpType?: unknown;
    SpecialtyIds?: string[];
    Specialties?: County[];
    PhotoUrl?: string;
    WebPageUrl?: string;
    AllowedTelemedicineLocations?: string;
    PhotoClass?: string;
    IsStandardProvider?: boolean;
    IsPCP?: boolean;
    TeamProviders?: Array<{
      ProviderId?: string;
      DepartmentId?: string;
      ChildProviderIds?: unknown[];
      IsTeamMember?: boolean;
      CanRequest?: boolean;
      CanScheduleTelemedicine?: boolean;
      CanLoginToSchedule?: boolean;
      VisitTypeInformation?: unknown[];
      IsInNetwork?: boolean;
      PoolLine?: unknown;
      PoolTier?: unknown;
    }>;
    Languages?: unknown[];
    Gender?: string;
    Credentials?: string;
    ClinicalInterests?: unknown[];
    Affiliations?: unknown;
    ID?: string;
    NameUTF8?: unknown;
  }>;
  Departments?: Array<{
    Name?: string;
    Address?: string[];
    Coordinates?: {
      Latitude?: number;
      Longitude?: number;
    };
    PhoneNumber?: string;
    OverridePhoneNumber?: string;
    IsUsingOverridePhoneNumber?: boolean;
    TimeZone?: {
      CacheTimeZone?: County;
      DisplayName?: string;
    };
    FromMinutesOffset?: unknown;
    FromDaysOffset?: number;
    ToDaysOffset?: number;
    LookbackDays?: number;
    AllowTeamScheduling?: unknown;
    AllowAppointmentRequest?: boolean;
    DistanceFromHome?: unknown;
    SpecialtyGroupId?: string;
    IsEnabledForNewProviderWorkflow?: boolean;
    HoursOfOperation?: unknown[];
    PhotoUrl?: string;
    CanLoginToSchedule?: boolean;
    ID?: string;
    NameUTF8?: unknown;
  }>;
  Locations?: Array<{
    Name?: string;
    Address?: unknown[];
    Coordinates?: {
      Latitude?: unknown;
      Longitude?: unknown;
    };
    DistanceFromHome?: unknown;
    DepartmentIds?: string[];
    ID?: string;
    NameUTF8?: unknown;
  }>;
  TelehealthLocations?: unknown;
  HomeOrganizationName?: string;
  ProviderDepartmentPairs?: Array<{
    ProviderId?: string;
    DepartmentId?: string;
    ChildProviderIds?: unknown[];
    IsTeamMember?: boolean;
    CanRequest?: boolean;
    CanScheduleTelemedicine?: boolean;
    CanLoginToSchedule?: boolean;
    VisitTypeInformation?: Array<{
      SeesChildren?: string;
      SeesAdolescents?: string;
      VisitTypeID?: string;
    }>;
    IsInNetwork?: boolean;
    PoolLine?: unknown;
    PoolTier?: unknown;
  }>;
  ReasonsForVisit?: Array<{
    Id?: string;
    CategoryValue?: string;
    Title?: string;
    DisplayName?: string;
    CanDirectSchedule?: boolean;
    CanRequest?: boolean;
    CanRequestWithoutOverrides?: boolean;
    DefaultVisitTypeId?: string;
    AllowProviderSelect?: boolean;
    ReasonForVisitFirst?: boolean;
    ProviderFirst?: boolean;
    ProviderDisplayString?: unknown;
    LocationDisplayString?: unknown;
    NumberOfAvailableProviders?: number;
    NumberOfAvailableLocations?: number;
    ProviderIds?: unknown;
    DepartmentIds?: unknown;
    DirectProviderDepartmentPairIDs?: string[];
    RequestProviderDepartmentPairIDs?: unknown[];
    QuickScheduleProviderDepartmentPairIDs?: unknown[];
    RawApptComponents?: unknown;
    ApptComponentItems?: {
      FromDte?: number;
      ExpirationDte?: number;
    };
    PhotoUrl?: unknown;
    PhotoFileName?: string;
    SortOrder?: number;
    AppointmentRequestIds?: unknown[];
    AccessCode?: unknown;
    AccessCodeFirstName?: unknown;
    IsDemographicAuthRequired?: boolean;
    SpecialtyGroupId?: string;
    EnabledForOnDemandVideoVisits?: boolean;
    TelemedicineVendorId?: unknown;
    TelemedicineVisitTypeId?: unknown;
    ScheduledTelemedicineVendorId?: unknown;
    OnDemandTelemedicineVendorId?: unknown;
    TelemedicineHardwareTestFdiId?: unknown;
    UseDeepLinkForHardwareTest?: boolean;
    TelemedicineMobileHardwareTestFdiId?: unknown;
    EnabledForQuickSchedule?: boolean;
    AllowedTelemedicineLocations?: unknown;
    AvailablePlatformsForLocalQuickSchedule?: unknown;
    AvailablePlatformsForLocalOnDemand?: unknown;
    InternallyAvailableForTelehealth?: boolean;
    ExternallyAvailableForTelehealth?: boolean;
    OnDemandRFV?: unknown;
    OnDemandOrganization?: unknown;
    OnDemandSlot?: unknown;
    LineInWDF40040?: unknown;
    LineInWDF15000?: unknown;
    InitiallyHidden?: boolean;
    Description?: string;
    IconCategoryId?: number;
    CustomImage?: string;
    HasIncompleteSchedulingData?: boolean;
    ExpectedPatientType?: number;
    HasPool?: boolean;
    Pool?: unknown;
    IconImageUrl?: unknown;
    IsPlaceholder?: boolean;
  }>;
  ReasonForVisitDepartmentOverrides?: Array<{
    ReasonForVisitId?: string;
    DepartmentId?: string;
    VisitTypeId?: string;
    CanDirectSchedule?: boolean;
    CanRequest?: boolean;
  }>;
  VisitTypes?: Array<{
    Name?: unknown;
    DisplayName?: string;
    AllowProviderSelect?: boolean;
    AllowChangeProvAndLocInResched?: boolean;
    DefaultTelehealthMode?: number;
    AllowedTelehealthModes?: number[];
    TelehealthModeDisplayNames?: {
      "1": string;
      "2": string;
    };
    SchedulingInstructions?: unknown[];
    QuestionnaireId?: string;
    DecisionTreeId?: string;
    AnonymousSchedulingDecisionTreeId?: string;
    CustomStepBodyKey?: unknown;
    CustomStepHeader?: unknown;
    CustomStepContinueButtonText?: unknown;
    FromMinutesOffset?: unknown;
    FromDaysOffset?: unknown;
    ToDaysOffset?: unknown;
    AllowTeamScheduling?: unknown;
    IsAdvanced?: boolean;
    IsConditionalPanel?: unknown;
    CanLoadMoreTiers?: boolean;
    TierSearchRange?: unknown;
    Tier?: unknown;
    PoolLine?: unknown;
    IsPlaceholder?: boolean;
    ShowPanelAsMultipleVisits?: boolean;
    MenuLinkUri?: string;
    MenuLinkCompleteUri?: unknown;
    DataAttributes?: unknown;
    HasSeparateLocationSelectionInPanels?: boolean;
    ShowLocationStepForTelehealthVisit?: boolean;
    AllowProviderStepInDirectSched?: boolean;
    ActionPreviews?: unknown[];
    ID?: string;
    NameUTF8?: unknown;
  }>;
  ActionPreviews?: unknown[];
  VisitTypeDepartmentOverrides?: Array<{
    VisitTypeId?: string;
    DepartmentId?: string;
    FromMinutesOffset?: unknown;
    FromDaysOffset?: number;
    ToDaysOffset?: number;
    AllowTeamScheduling?: number;
  }>;
  Specialties?: unknown[];
  Tickets?: unknown[];
  OrderMap?: Record<string, unknown>;
  OriginalAppointmentInfo?: OriginalAppointmentInfo;
  OnDemandTelehealthData?: unknown;
  FavoriteAppointments?: unknown[];
  SchedulingMenusViewModels?: unknown[];
  LoadError?: unknown;
  IsWidget?: boolean;
  PreselectedTicketStatus?: number;
  OtherRfvUrl?: unknown;
  OtherRfvFilename?: string;
};

/** `/GuestEstimates/SelectLocation (inlined var model)` */
export type GuestEstimatesLocationModel = {
  Locations?: Location[];
  IsMultiServiceArea?: boolean;
  ServiceArea?: string;
  IsGuest?: boolean;
  HasCompletedCaptcha?: boolean;
  Template?: string;
};

/** `/GuestEstimates/SelectServiceArea (inlined $$WP.Estimates.OtherSAs element)` */
export type GuestEstimatesServiceArea = {
  Id?: string;
  Title?: string;
  Phone?: string;
  PhoneText?: string;
  Description?: string;
  LogoURL?: string;
  DefaultLogoURL?: unknown;
  SelectLocations?: boolean;
  BillingSystem?: number;
};
