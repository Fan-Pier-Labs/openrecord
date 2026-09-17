

export type BillingAccount = {
  guarantorNumber: string;
  patientName: string;
  // Scraped off the summary page — a row without a parseable amount yields undefined.
  amountDue?: number | undefined;

  // Two IDs needed for scraping the detail page
  id?: string;
  context?: string;

  // Note: This is not on the schema from MyChart - it comes from a separate API call, but I'm just going to condense it all into this type.
  billingDetails?: BillingDetails

  // Statement list for PDF downloads
  statementList?: StatementListResponse;

  // Payment history (MyChart payments made by the patient)
  paymentList?: PaymentListResponse;

  // Encrypted billing ID needed for PDF downloads
  encBillingId?: string;
}


/**
 * Represents the top-level structure of the JSON.
 */
interface BillingDetails {
  Success: boolean;
  Data: {
    UnifiedVisitList: BillingVisit[];
    InformationalVisitList: BillingVisit[];

    // Newly discovered fields
    HasVisits: boolean;
    ShowingAll: boolean;
    HasUnconvertedPBVisits: boolean;
    CanMakePayment: boolean;
    CanEditPaymentPlan: boolean;
    URLMakePayment: string | null;
    URLEditPaymentPlan: string | null;
    Filters: Filters;
    PartialPaymentPlanAlert: PartialPaymentPlanAlert;
    BillingSystem: number;
  };
}


/**
 * Break down any nested structures accordingly:
 */
interface Filters {
  FilterClass: string;
  Options: FilterOption[];
}

interface FilterOption {
  OptionClass: string;
  OptionLabel: string;
}

interface PartialPaymentPlanAlert {
  Code: number;
  Banner: Banner;
}

interface Banner {
  HeaderText: string;
  DetailText: string;
  AssistiveText: string;
  ButtonLabel: string;
  ButtonUrl: string;
  ButtonID: string | null;
  ButtonClass: string | null;
  ButtonData: string | null;
  TelephoneLink: string | null;
  ButtonLabelSecondary: string | null;
  ButtonUrlSecondary: string | null;
  ButtonIDSecondary: string | null;
  ButtonClassSecondary: string | null;
  ButtonAriaDescribedByContentSecondary: string | null;
  ButtonAriaDescribedByIdSecondary: string | null;
  ButtonDataSecondary: string | null;
  DisableDetailTextHtmlEncoding: boolean;
  BannerType: string;
  BannerTypeReact: string;
  IconOverride: string;
  IconAltTextOverride: string | null;
  FontSize: number;
}
interface BillingVisit {
  GroupType: number;
  Index: number;
  BillingSystem: number;
  IsSBO: boolean;
  BillingSystemDisplay: string;
  AdjustmentsOnly: boolean;
  DateRangeDisplay: string | null;
  StartDate: number;
  StartDayOfMonth: number;
  StartMonth: number;
  StartYear: number;
  StartDateDisplay: string | null;
  StartDateAccessibleText: string | null;
  Description: string | null;
  Patient: string | null;
  Provider: string | null;
  ProviderId: string | null;
  HospitalAccountDisplay: string | null;
  HospitalAccountId: string | null;
  SupressDayFromDate: boolean;
  CanAddToPaymentPlan: boolean;
  PrimaryPayer: string | null;
  IsLTCSeries: boolean;
  ChargeAmount: string | null;
  InsuranceAmountDue: string | null;
  InsuranceAmountDueRaw: number;
  SelfAmountDue: string | null;
  SelfAmountDueRaw: number;
  IsPatientNotResponsible: boolean;
  PatientNotResponsibleYet: boolean;
  InsurancePaymentAmount: string | null;
  InsuranceEstimatedPaymentAmount: string | null;
  SelfPaymentAmount: string | null;
  SelfAdjustmentAmount: string | null;
  SelfDiscountAmount: string | null;
  ContestedChargeAmount: string | null;
  ContestedPaymentAmount: string | null;
  ShowInsuranceHelp: boolean;
  SelfPaymentPlanAmountDue: string | null;
  SelfPaymentPlanAmountDueRaw: number;
  IsExpanded: boolean;
  BlockExpanding: boolean;
  ProcedureList: Procedure[] | null;
  ProcedureGroupList: ProcedureGroup[];
  CoverageInfoList: CoverageInfo[] | null;
  ShowCoverageHelp: boolean;
  VisitAutoPay: VisitAutoPayInfo | null;
  ShowVisitAutoPay: boolean;
  LevelOfDetailLoaded: number;
  SelfBadDebtAmount: string | null;
  SelfBadDebtAmountRaw: number;
  IsClosedHospitalAccount: boolean;
  IsBadDebtHAR: boolean;
  IsPaymentPlanEstimate: boolean;
  IsResolvedEstimatedPPAccount: boolean;
  NotOnPlanAmount: string | null;
  NotOnPlanAmountRaw: number;
  EmptyVisitEstimateID: string | null;
  EstimateInfo: EstimateInfo | null;
  PatFriendlyAccountStatus: number;
  VisitBadDebtScenario: number;
  PatFriendlyAccountStatusAccessibleText: string;
  VisitStatusesEqualToClosed: number[];
  IsOnPaymentPlan: boolean;
  IsNotOnPaymentPlan: boolean;
}


interface Procedure {
  BillingSystem: number;
  Description: string;
  Amount: string;
  PaymentList: Payment[] | null;
  InsuranceAmountDue: string | null;
  SelfAmountDue: string;
  HasAmountDue: boolean;
  SelfBadDebtAmount: string | null;
  HasBadDebtAmount: boolean;
  AdjustmentsOnly: boolean;
  IsContested: boolean;
}

interface ProcedureGroup {
  VisitIndex: number;
  VisitGroupType: number;
  Description: string | null;
  Amount: string;
  ProcedureList: Procedure[] | null;
  PaymentList: Payment[];
  EstPlanPaymentList: Payment[];
  HasEstPlanList: boolean;
  IsPaymentsOnly: boolean;
  HasPaymentsTowardsEstimates: boolean;
  HasContestedProcedures: boolean;
  IsExpanded: boolean;
}

interface CoverageInfo {
  CoverageName: string;
  Billed: string;
  Covered: string;
  PendingInsurance: string | null;
  RemainingResponsibility: string;
  Copay: string | null;
  Deductible: string;
  Coinsurance: string | null;
  NotCovered: string | null;
  Benefits: Benefit[];
}


interface Benefit {
  Name: string;
  Amount: string;
}

/**
 * Root interface for the entire response
 */
export interface StatementListResponse {
  Success: boolean;
  DataStatement: DataDetailBill;
  DataDetailBill: DataDetailBill;
}

/**
 * Interface for detail-bill data
 */
interface DataDetailBill {
  StatementList: StatementItem[];
  HasUnread: boolean;
  HasRead: boolean;
  ShowAll: boolean;
  IsPaperless: boolean;
  PaperlessStatus: number;
  ShowPaperlessSignup: boolean;
  ShowPaperlessCancel: boolean;
  URLPaperlessBilling: string | null;
  IsPaperlessAllowedForSA: boolean;
  IsDetailBillModel: boolean;
  noStatementsString: string;
  allReadString: string;
  loadMoreString: string;
}


interface VisitAutoPayInfo {
  IsEnrolled: boolean;
  CanEnroll: boolean;
  PaymentMethodDisplay: string | null;
}

interface EstimateInfo {
  EstimateID: string;
  EstimateAmount: string | null;
  EstimateStatus: number;
}

interface EditPaymentOptions {
  PaymentID: string;
  CanEdit: boolean;
}

interface CancelCommandOptions {
  PaymentID: string;
  CanCancel: boolean;
}

interface ViewConsentOptions {
  ConsentDocumentID: string;
  CanView: boolean;
}

interface Payment {
  ID: string | null;
  ElementID: string | null;
  Index: number | null;
  DayOfMonth: number;
  Month: number;
  Year: number;
  FormattedDateDisplay: string | null;
  Description: string;
  SubText: string | null;
  HtmlSubText: string | null;
  PaymentAmountDisplay: string;
  UndistributedAmountDisplay: string | null;
  CoverageInfo: CoverageInfo | null;
  Receipt: string | null;
  IsBadDebtAdj: boolean;
  IsWriteOffAdj: boolean;
  IsSurchargeAdj: boolean;
  CanEdit: boolean;
  EditPaymentOptions: EditPaymentOptions | null;
  CanCancel: boolean;
  CancelCommandOptions: CancelCommandOptions | null;
  ConsentDocument: string | null;
  ViewConsentOptions: ViewConsentOptions | null;
  IsCardExpiringSoon: boolean;
  HasCardExpired: boolean;
}


/**
 * Common interface for individual statements/bills
 */
export interface StatementItem {
  Show: boolean;
  Date: number;
  DayOfMonth: number;
  Month: number;
  Year: number;
  DateDisplay: string;
  FormattedDateDisplay: string;
  Description: string;
  LinkText: string;
  LinkDescription: string;
  IsRead: boolean;

  // this is the fileKey param on the PDF download call
  ImagePath: string;

  // this is the token param on the PDF download call
  Token: string;
  IsPaperless: boolean;
  PrintID: string;
  StatementAmountDisplay: string;
  IsEB: boolean;
  Format: number;
  IsDetailBill: boolean;
  BillingSystem: number;

  // this is the billSys param on the PDF download call
  EncBillingSystem: string;
  RecordID: string;
}

/**
 * Response from /Billing/Details/LoadPaymentList
 * Contains patient payment history (MyChart payments made through the portal)
 */
export interface PaymentListResponse {
  Success: boolean;
  Data: {
    PaymentList: Payment[];
    Filters: unknown;
  };
}

/* ── Captured responses ──────────────────────────────────────────────────
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty.
 * Read a payload with `rec<T>()`, never `as` — see `../../wire/README.md`.
 */

/** Repeated shape. Appears in: chart/bills. */
export type Statement = {
  Show?: boolean;
  Date?: number;
  DayOfMonth?: number;
  Month?: number;
  Year?: number;
  DateDisplay?: string;
  Description?: string;
  SubText?: string;
  LinkText?: string;
  LinkDescription?: string;
  IsRead?: boolean;
  ImagePath?: string;
  Token?: string;
  IsPaperless?: boolean;
  PrintID?: string;
  StatementAmountDisplay?: string;
  IsEB?: boolean;
  Format?: number;
  IsDetailBill?: boolean;
  BillingSystem?: number;
  EncBillingSystem?: string;
  RecordID?: string;
  ServiceDateStart?: unknown;
  ServiceDateEnd?: unknown;
  URLStatement?: unknown;
};

/** Repeated shape. Appears in: chart/bills. */
export type DataStatement = {
  StatementList?: Array<{
    Show?: boolean;
    Date?: number;
    DayOfMonth?: number;
    Month?: number;
    Year?: number;
    DateDisplay?: string;
    Description?: string;
    SubText?: string;
    LinkText?: string;
    LinkDescription?: string;
    IsRead?: boolean;
    ImagePath?: string;
    Token?: string;
    IsPaperless?: boolean;
    PrintID?: string;
    StatementAmountDisplay?: string;
    IsEB?: boolean;
    Format?: number;
    IsDetailBill?: boolean;
    BillingSystem?: number;
    EncBillingSystem?: string;
    RecordID?: string;
    ServiceDateStart?: unknown;
    ServiceDateEnd?: unknown;
    URLStatement?: unknown;
  }>;
  HasUnread?: boolean;
  HasRead?: boolean;
  ShowAll?: boolean;
  IsPaperless?: boolean;
  PaperlessStatus?: number;
  ShowPaperlessSignup?: boolean;
  ShowPaperlessCancel?: boolean;
  URLPaperlessBilling?: string | null;
  IsPaperlessAllowedForSA?: boolean;
  IsDetailBillModel?: boolean;
  noStatementsString?: string;
  allReadString?: string;
  loadMoreString?: string;
};

/** `/billing/details/getvisits` */
export type BillingGetVisits = {
  Success?: boolean;
  Data?: {
    VisitList?: unknown[];
    VisitListAmount?: string;
    BadDebtVisitList?: unknown[];
    BadDebtVisitListAmount?: string;
    PaymentPlanVisitList?: unknown[];
    PaymentPlanVisitListAmount?: string;
    PaymentPlanVisitListAutoPayAmount?: unknown;
    PaymentPlanVisitListScheduledDate?: unknown;
    EstimatedPaymentPlanBalance?: unknown;
    PaymentPlanVisitListPostResolutionAmount?: string;
    NotPaymentPlanVisitList?: unknown[];
    NotPaymentPlanVisitListAmount?: string;
    AdvanceBillVisitList?: unknown[];
    AdvanceBillVisitListAmount?: string;
    InformationalVisitList?: unknown[];
    NoBalanceVisitList?: unknown[];
    AdjustmentVisitList?: unknown[];
    AdjustmentVisitListAmount?: string;
    VisitAutoPayVisitList?: unknown[];
    VisitAutoPayVisitListAmount?: string;
    UnifiedVisitList?: Array<{
      GroupType?: number;
      Index?: number;
      BillingSystem?: number;
      IsSBO?: boolean;
      BillingSystemDisplay?: string;
      AdjustmentsOnly?: boolean;
      DateRangeDisplay?: unknown;
      StartDate?: number;
      StartDayOfMonth?: number;
      StartMonth?: number;
      StartYear?: number;
      StartDateDisplay?: string;
      StartDateAccessibleText?: string;
      Description?: string;
      Patient?: string;
      Provider?: string;
      ProviderId?: unknown;
      HospitalAccountDisplay?: string;
      HospitalAccountId?: string;
      SuppressDayFromDate?: boolean;
      CanAddToPaymentPlan?: boolean;
      PrimaryPayer?: string;
      IsLTCSeries?: boolean;
      ChargeAmount?: string;
      SurchargeAmount?: unknown;
      TaxOrSurcharge?: number;
      InsuranceAmountDue?: string;
      InsuranceAmountDueRaw?: number;
      SelfAmountDue?: string;
      SelfAmountDueRaw?: number;
      IsPatientNotResponsible?: boolean;
      PatientNotResponsibleYet?: boolean;
      InsurancePaymentAmount?: string;
      InsuranceEstimatedPaymentAmount?: unknown;
      SelfPaymentAmount?: string;
      SelfAdjustmentAmount?: unknown;
      SelfDiscountAmount?: unknown;
      ContestedChargeAmount?: unknown;
      ContestedPaymentAmount?: unknown;
      ShowInsurancePendingHelp?: boolean;
      ShowInsuranceCoveredHelp?: boolean;
      SelfPaymentPlanAmountDue?: unknown;
      SelfPaymentPlanAmountDueRaw?: number;
      SuppressProcedureAmount?: boolean;
      AdjustmentSuppressionSetting?: number;
      IsExpanded?: boolean;
      AlwaysShowDetails?: boolean;
      BlockExpanding?: boolean;
      ProcedureList?: Array<{
        BillingSystem?: number;
        Description?: string;
        Amount?: string;
        PaymentList?: unknown;
        InsuranceAmountDue?: unknown;
        SelfAmountDue?: string;
        HasAmountDue?: boolean;
        SelfBadDebtAmount?: unknown;
        HasBadDebtAmount?: boolean;
        AdjustmentsOnly?: boolean;
        IsContested?: boolean;
      }>;
      ProcedureGroupList?: Array<{
        VisitIndex?: number;
        VisitGroupType?: number;
        Description?: unknown;
        Amount?: string;
        ProcedureList?: unknown;
        PaymentList?: Array<{
          ID?: unknown;
          ElementID?: unknown;
          Index?: unknown;
          DayOfMonth?: number;
          Month?: number;
          Year?: number;
          FormattedDateDisplay?: unknown;
          Description?: string;
          SubText?: unknown;
          HtmlSubText?: unknown;
          PaymentAmountDisplay?: string;
          UndistributedAmountDisplay?: unknown;
          CoverageInfo?: unknown;
          Receipt?: unknown;
          IsBadDebtAdj?: boolean;
          IsWriteOffAdj?: boolean;
          IsSurchargeAdj?: boolean;
          CanEdit?: boolean;
          EditPaymentOptions?: unknown;
          CanCancel?: boolean;
          CancelCommandOptions?: unknown;
          ConsentDocument?: unknown;
          ViewConsentOptions?: unknown;
          IsCardExpiringSoon?: boolean;
          HasCardExpired?: boolean;
        }>;
        EstPlanPaymentList?: unknown[];
        HasEstPlanList?: boolean;
        IsPaymentsOnly?: boolean;
        HasPaymentsTowardsEstimates?: boolean;
        HasContestedProcedures?: boolean;
        IsExpanded?: boolean;
        AlwaysShowDetails?: boolean;
      }>;
      CoverageInfoList?: Array<{
        CoverageName?: string;
        Billed?: string;
        Covered?: string;
        PendingInsurance?: unknown;
        RemainingResponsibility?: string;
        Copay?: string;
        Deductible?: unknown;
        Coinsurance?: unknown;
        NotCovered?: unknown;
        Benefits?: Array<{
          Name?: string;
          Amount?: string;
        }>;
        ShowInsuranceCoveredHelp?: boolean;
        ShowInsurancePendingHelp?: boolean;
      }>;
      ShowCoverageHelp?: boolean;
      VisitAutoPay?: unknown;
      ShowVisitAutoPay?: boolean;
      LevelOfDetailLoaded?: number;
      SelfBadDebtAmount?: unknown;
      SelfBadDebtAmountRaw?: number;
      IsClosedHospitalAccount?: boolean;
      IsBadDebtVisit?: boolean;
      IsContestedHAR?: boolean;
      IsPaymentPlanEstimate?: boolean;
      IsResolvedEstimatedPPAccount?: boolean;
      NotOnPlanAmount?: unknown;
      NotOnPlanAmountRaw?: number;
      EmptyVisitEstimateID?: unknown;
      /** Never captured populated; shape from the original hand-written types. */
      EstimateInfo?: { EstimateAmount: string; EstimateStatus: number };
      PatFriendlyAccountStatus?: number;
      VisitBadDebtScenario?: number;
      IsUnpayableHAR?: boolean;
      PatFriendlyAccountStatusAccessibleText?: string;
      VisitStatusesEqualToClosed?: number[];
      IsOnPaymentPlan?: boolean;
      IsNotOnPaymentPlan?: boolean;
      AgencyInformation?: {
        Name?: string;
        PhoneNumber?: string;
        AgencyID?: number;
      };
      AgencyInformationDescription?: unknown;
    }>;
    ContestedVisitList?: unknown[];
    ContestedVisitListAmount?: string;
    HasVisits?: boolean;
    ShowingAll?: boolean;
    HasUnconvertedPBVisits?: boolean;
    CanMakePayment?: boolean;
    CanEditPaymentPlan?: boolean;
    URLMakePayment?: unknown;
    URLEditPaymentPlan?: unknown;
    Filters?: {
      FilterClass?: string;
      Options?: Array<{
        OptionClass?: string;
        OptionLabel?: string;
      }>;
    };
    PartialPaymentPlanAlert?: {
      Code?: number;
      Banner?: {
        HeaderText?: string;
        DetailText?: string;
        AssistiveText?: string;
        ButtonLabel?: string;
        ButtonAssistiveText?: string;
        ButtonUrl?: string;
        ButtonID?: unknown;
        ButtonClass?: unknown;
        ButtonData?: unknown;
        TelephoneLink?: unknown;
        ButtonLabelSecondary?: unknown;
        ButtonUrlSecondary?: unknown;
        ButtonIDSecondary?: unknown;
        ButtonClassSecondary?: unknown;
        ButtonAriaDescribedByContentSecondary?: unknown;
        ButtonAriaDescribedByIdSecondary?: unknown;
        ButtonDataSecondary?: unknown;
        DisableDetailTextHtmlEncoding?: boolean;
        BannerType?: string;
        BannerTypeReact?: string;
        IconOverride?: string;
        IconAltTextOverride?: unknown;
        FontSize?: number;
        UseH3Header?: boolean;
      };
    };
    BillingSystem?: number;
    billType?: number;
    IsStatement?: boolean;
    StatementDisplayDate?: unknown;
    UndistributedPayments?: unknown[];
    ShouldShowADACopyright?: boolean;
    SharedAgencyInformation?: {
      Name?: string;
      PhoneNumber?: string;
      AgencyID?: number;
    };
  };
};

/** `/billing/details/getstatementlist` */
export type GetStatementList = {
  Success?: boolean;
  DataStatement?: DataStatement;
  DataDetailBill?: DataStatement;
};

/** `/billing/details/loadpaymentlist` */
export type LoadPaymentList = {
  Success?: boolean;
  Data?: {
    PaymentList?: Array<{
      ID?: string;
      ElementID?: string;
      Index?: string;
      DayOfMonth?: number;
      Month?: number;
      Year?: number;
      FormattedDateDisplay?: string;
      Description?: string;
      SubText?: unknown;
      HtmlSubText?: string;
      PaymentAmountDisplay?: string;
      UndistributedAmountDisplay?: unknown;
      CoverageInfo?: unknown;
      Receipt?: {
        SerialNumber?: string;
        FileName?: string;
        BlobToken?: string;
        IsValidReceipt?: boolean;
        DisplayNumber?: string;
        PrintStatus?: number;
        ReceiptStatus?: unknown;
        ViewReceiptOptions?: {
          AriaDescribedBy?: unknown;
          AriaLabel?: string;
          Callback?: unknown;
          CssClasses?: string;
          DataAttrs?: {
            "serial-number"?: string;
            "blob-token"?: string;
            "file-path"?: string;
            "display-number"?: string;
          };
          IconCssClasses?: string;
          IconPath?: string;
          Id?: unknown;
          IsDisabled?: boolean;
          IsSubmit?: boolean;
          LinkTarget?: unknown;
          MiscContent?: unknown;
          Path?: unknown;
          Title?: unknown;
          UsesJqShowHide?: boolean;
          IsSvgSprite?: boolean;
          CommandType?: number;
        };
        MobileDocViewerSupported?: boolean;
        Url?: unknown;
      };
      IsBadDebtAdj?: boolean;
      IsWriteOffAdj?: boolean;
      IsSurchargeAdj?: boolean;
      CanEdit?: boolean;
      EditPaymentOptions?: unknown;
      CanCancel?: boolean;
      CancelCommandOptions?: unknown;
      ConsentDocument?: unknown;
      ViewConsentOptions?: unknown;
      IsCardExpiringSoon?: boolean;
      HasCardExpired?: boolean;
    }>;
    Filters?: unknown;
  };
};
