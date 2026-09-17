/**
 * Raw MyChart responses for the `bills` scraper.
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
 * Endpoints: /billing/details/getvisits, /billing/details/getstatementlist, /billing/details/loadpaymentlist
 *
 * Keep in step with the captures; `scrapers/myChart/__tests__/wireShapes.unit.test.ts`
 * fails the build if these miss a field or invent one.
 */

/** Repeated shape. Appears in: chart/bills. */
export type Statement = {
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
};

/** Repeated shape. Appears in: chart/bills. */
export type DataStatement = {
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
  URLPaperlessBilling: string | null;
  IsPaperlessAllowedForSA: boolean;
  IsDetailBillModel: boolean;
  noStatementsString: string;
  allReadString: string;
  loadMoreString: string;
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
      /** Never captured populated; shape from the original hand-written types. */
      EstimateInfo: { EstimateAmount: string; EstimateStatus: number };
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

/** `/billing/details/getstatementlist` */
export type GetStatementList = {
  Success: boolean;
  DataStatement: DataStatement;
  DataDetailBill: DataStatement;
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
