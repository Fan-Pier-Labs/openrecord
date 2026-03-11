export interface OrganizationLink {
  OrganizationId: string;
  OrganizationName: string;
  Url: string;
}

export interface TelemedicineInfo {
  IsTelemedicine: boolean;
  TelemedicineUrl: string | null;
  TelemedicineMode: number;
}

export interface EVisitInfo {
  IsEVisit: boolean;
  EVisitUrl: string | null;
}

export interface CopayInfo {
  Amount: string;
  IsPaid: boolean;
}

export interface DiagnosisInfo {
  Code: string;
  Description: string;
}

export interface SelfArrivalBanner {
  HeaderText: string;
  DetailText: string;
  ButtonLabel: string;
}

export interface ArrivalAction {
  ActionType: string;
  Label: string;
}

export interface CaseInfo {
  CaseId: string;
  Description: string;
}

export interface ComponentVisit {
  Csn: string;
  VisitTypeName: string;
  PrimaryDate: string;
}

export interface ContactInformation {
  PhoneNumber: string | null;
  FaxNumber: string | null;
  Email: string | null;
}

export interface LastEncounterInfo {
  Date: string;
  ProviderName: string;
}

export interface Instruction {
  Text: string;
  Type: string;
}

export interface CheckInStep {
  StepName: string;
  StepStatus: number;
  IsComplete: boolean;
}

export interface VisitListContainer {
    LaterVisitsList: Visit[];
    NextNDaysVisits: Visit[];
    InProgressVisits: Visit[];
    HighlightDays: string[];
    HasPVG: boolean;
  }
  
  export interface Visit {
    HasPaymentFeature: boolean;
    HasQuestionnaireFeature: boolean;
    HasNewPvdFeature: boolean;
    PrimaryDate: string;
    CsnForECheckIn: string;
    RescheduledDatString: string | null;
    IsNoShow: boolean;
    LeftWithoutSeen: boolean;
    DischargeDate: string | null;
    HasDownloadSummaryLink: boolean;
    HasTransmitSummaryLink: boolean;
    CanRedirectToApptDetails: boolean;
    PastVisitBucket: string | number | null;
    IsClinicalInformationAvailable: boolean;
    OwnedBy: number;
    AdmissionDateRange: { Start: string; End: string } | null;
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
    OrganizationLinks: OrganizationLink[];
    PrimaryOrganizationLink: OrganizationLink | null;
    Organization: Organization;
    EncodedOrgID: string | null;
    Month: number;
    DateOfMonth: string;
    Year: string;
    IsLocal: boolean;
    IsNonEpic: boolean;
    IsSingleProvider: boolean;
    Telemedicine: TelemedicineInfo | null;
    EVisit: EVisitInfo | null;
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
    ArrivalTime: string | null;
    CanShowArrivalTime: boolean;
    EarlyArrivalReason: string | null;
    DurationInMinutes: number | null;
    HasDuration: boolean;
    Copay: CopayInfo | null;
    CanShowPayments: boolean;
    ShortDate: string;
    IsTimeToBeDetermined: boolean;
    IsHideVisitTime: boolean;
    CanShowAppointmentTime: boolean;
    TimeZone: string;
    Providers: Provider[];
    OtherProviders: Provider[];
    NumberOfOthers: number;
    PrimaryProvider: Provider | null;
    PrimaryProviderName: string | null;
    PrimaryDepartment: Department;
    CanRequestCancel: boolean;
    IsCanceled: boolean;
    CanReschedule: boolean;
    RescheduledDat: string;
    IsDetailsEnabled: boolean;
    ECheckIn: ECheckIn;
    CanShowECheckIn: boolean;
    CanShowECheckInComplete: boolean;
    IsECheckInComplete: boolean;
    NextIncompleteVisitECheckInCsn: string | null;
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
    ChiefComplaint: string | null;
    Diagnoses: DiagnosisInfo[] | null;
    HasSentUpgradeRequest: boolean;
    CanSendUpgradeRequest: boolean;
    IsUserInitiatedArrivalAllowed: boolean;
    SelfArrivalMechanism: number;
    SelfArrivalBannerViewModel: SelfArrivalBanner | null;
    GeolocationArrival: number;
    ArrivalStatus: number | null;
    PatientNextStepInstructions: string;
    ArrivalAdditionalActions: ArrivalAction[];
    IsProxyRequestMinorFormOn: boolean;
    ProxyRequestMinorForm: string;
    GuestPatientFirstName: string | null;
    TelehealthMode: number;
    InProgress: boolean;
    IsResidentialMed: boolean;
    EncounterIsSurgery: boolean;
    EncounterIsEDVisit: boolean;
    IsPreadmission: boolean;
    SurgeryTimeOfDay: string | null;
    PreadmissionLocation: PreadmissionLocation | null;
    Cases: CaseInfo[] | null;
    IsHovPreadmission: boolean;
    HasProcedures: boolean;
    NumberOfProcedures: number;
    SurgicalProcedures: SurgicalProcedure[] | null;
    ComponentVisits: ComponentVisit[] | null;
    HasComponentVisits: boolean;
    HasPaymentInfo: boolean;
    IsFullyPaid: boolean;
    CompleteECheckInCount: number;
    TotalECheckInCount: number;
    ViewBagProperties?: ViewBagProperties;
    SerializedIndex?: string;
    List?: Record<string, PastVisitsByOrg>;
    CanSearch?: boolean;
    CanAllSearch?: boolean;
    CanSort?: boolean;
    AutoRenderThisSet?: boolean;
    SkippedSomeResults?: boolean;
    Organizations?: Record<string, Organization>;
  }


export interface PastVisitsContainer {
  ViewBagProperties: ViewBagProperties;
  SerializedIndex: string;
  List: Record<string, PastVisitsByOrg>;
  CanSearch: boolean;
  CanAllSearch: boolean;
  CanSort: boolean;
  AutoRenderThisSet: boolean;
  SkippedSomeResults: boolean;
  Organizations: Record<string, Organization>;
}


export interface PastVisitsByOrg {
  ViewbagProperties: Record<string, string>;
  Organization: Organization;
  List: Visit[];
  ListSize: number;
  HasMoreData: boolean;
  CanSearch: boolean;
  SkippedSomeResults: boolean;
  SerializedIndex: string;
}

export interface ViewBagProperties {
  LoadingOrgNames: string;
  ErrorOrgNames: string;
  ManualOrgNames: string;
}

  
  export interface Organization {
    OrganizationId: string;
    OrganizationIdentifier: string | null;
    RelatedOrganizations: Organization[] | null;
    HasChildOrgs: boolean;
    CELocationId: string | null;
    WebsiteName: string | null;
    OrganizationName: string;
    MyChartAppName: string | null;
    SsnLabel: string | null;
    IsLocal: boolean;
    LogoUrl: string;
    TermsAndConditionsUrl: string | null;
    ProxyTermsAndConditionsUrl: string | null;
    Address: string[];
    DisplayAddress: string | null;
    ContactInformation: ContactInformation | null;
    UrlList: Record<string, string> | null;
    IsSSO: boolean;
    IncompleteH2GSetup: boolean;
    LastEncounterInfo: LastEncounterInfo | null;
    IsGeneric: boolean;
    PayerOrgDetails: PayerOrgDetails;
    IsMyChartCentral: boolean;
  }
  
  export interface PayerOrgDetails {
    IsPayerOnly: boolean;
    IsPayvider: boolean;
    IsPayer: boolean;
    IsPayerLicensedForMyChart: boolean;
    PayerChildWebsiteName: string;
    PayerCvgLogo: string;
    PayerCvgLogoMagicId: string | null;
    PayerCvgToken: string;
    PayerCvgName: string;
  }
  
  export interface Department {
    Id: string;
    Name: string;
    Address: string[];
    HasAddress: boolean;
    PhoneNumber: string;
    Instructions: Instruction[];
    ShouldShowInstructions: boolean;
    TimeZone: string;
    ArrivalLocation: string;
    Specialty: Specialty;
    CanShowDrivingDirections: boolean;
    IsPreadmissionLocation: boolean;
  }
  
  export interface Specialty {
    Value: string;
    Title: string;
    TitleUtf8: string | null;
    Abbreviation: string;
  }
  
  export interface ECheckIn {
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
    ClinicSteps: CheckInStep[];
    ECheckInSteps: CheckInStep[];
    HasQuestionnaireLink: boolean;
    IsAdmission: boolean;
    IsSurgery: boolean;
    IsQnrAfterBarcode: boolean;
    IsConfirmationView: boolean;
    SignUpLink: string | null;
    HasSignUpLink: boolean;
    IsRequiredForTelemedicine: boolean;
    CanShow: boolean;
    HasPaymentECheckInStep: boolean;
    HasQuestionnaireStep: boolean;
    IsInHelloPatientWindow: boolean;
  }
  
  export interface Provider {
    EncryptedId: string;
    Name: string;
    Type: number;
    PhotoUrl: string;
    PhotoLink: string;
    WebPageUrl: string;
    HasPhotoOnBlob: boolean;
    PhotoBlobToken: string;
    IsPerson: boolean;
    Department: Department | null;
    PhotoClass: string;
  }
  
  export interface PreadmissionLocation {
    Id: string;
    Name: string;
    Address: string[];
    HasAddress: boolean;
    PhoneNumber: string | null;
    Instructions: Instruction[] | null;
    ShouldShowInstructions: boolean;
    TimeZone: string;
    ArrivalLocation: string | null;
    Specialty: Specialty | null;
    CanShowDrivingDirections: boolean;
    IsPreadmissionLocation: boolean;
  }
  
  export interface SurgicalProcedure {
    Name: string;
    Providers: Provider[];
    Instructions: string | null;
  }
  