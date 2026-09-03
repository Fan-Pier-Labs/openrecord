# `bills` — what each mode carries

Part of the processor layer. The rules (never rename a MyChart field, membership by field
name, markup only in `raw`, never invent a shape) and the drop-reason tags used in the
Reasoning column are in [`docs/processor-layer-proposal.md`](../../../../docs/processor-layer-proposal.md);
example output in all four modes is in
[`docs/processor-layer-examples.md`](../../../../docs/processor-layer-examples.md).

Columns: **Field** (MyChart's name, or the derived name), **What it is**,
**Derived** (✓ when the processor computes it from other fields; such a field
is never in `raw`), **Standard / JSON**, **Concise**, **Reasoning** (why the
field is in or out of each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

## `get_billing`

`GET /Billing/Summary` (HTML; one `.ba_card` per guarantor account), then per
account `GET /Billing/Details/GetVisits`, `GET /Billing/Details/GetStatementList`,
`GET /Billing/Details/LoadPaymentList` and `GET /Billing/Details` (HTML, for the
`EncID` PDF token). `raw` is the envelope. Card parsing and the per-account join
become processor work.

Account (from the summary HTML and the join):

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `guarantorNumber`, `patientName` | From the card header | ✓ | ✓ | ✓ | Derived from the summary HTML. Which account and whose. |
| `amountDueNumber` | Card balance, parsed | ✓ | ✓ | ✓ | Derived. What is owed. |
| `id`, `context`, `encBillingId` | Account keys the detail calls take | — | — | — | Internal; visible in `raw` as request bodies. |
| `totalDue` | Sum across accounts | ✓ | ✓ | ✓ | Derived. The one number most readers want. |

`GetVisits` (`Data.*`):

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `UnifiedVisitList[]`, `VisitList[]`, `InformationalVisitList[]`, `NoBalanceVisitList[]`, `BadDebtVisitList[]`, `PaymentPlanVisitList[]`, `AdvanceBillVisitList[]`, `ContestedVisitList[]`, `AdjustmentVisitList[]` | The charge lists; overlapping across releases | ✓ | merged into one `visits[]`, de-duplicated on (`HospitalAccountId`, `StartDate`, `Description`, `SelfAmountDueRaw`) | same | Derived merge (#380). Reading one list loses charges on whichever release does not populate it; reading all double-counts. |
| `category` | Which list the row came from | ✓ | ✓ | ✓ | Derived. "Bad debt" and "payment plan" change what a charge means. |
| `NotPaymentPlanVisitList[]`, `VisitAutoPayVisitList[]` | Filtered views of rows already in the others | — | — | — | Duplicate. |
| `*VisitListAmount`, `PaymentPlanVisitListAutoPayAmount`, `PaymentPlanVisitListScheduledDate`, `EstimatedPaymentPlanBalance`, `PaymentPlanVisitListPostResolutionAmount` | Per-list totals | — | ✓ | — | Totals as MyChart computed them; detail. |
| `CanMakePayment`, `HasUnconvertedPBVisits`, `HasVisits` | Account state | — | ✓ | — | Whether online payment is possible; detail. |
| `PartialPaymentPlanAlert.Code`, `.Banner.HeaderText`, `.Banner.DetailText` | Payment-plan warning | — | ✓ | — | A warning is information; detail. |
| `PartialPaymentPlanAlert.Banner.*` other fields | Button and icon config | — | — | — | UI flag. |
| `UndistributedPayments[]` | Payments not yet applied | — | ✓ | — | Uncaptured; passed through. |
| `SharedAgencyInformation.Name`, `.PhoneNumber` | Collections agency | — | ✓ | — | A patient in collections wants to know; detail. |
| `URLMakePayment` | The pay-online link for this account | — | ✓ | — | A portal link by class, kept anyway (rule 4, with the reason here): it is how a patient pays a bill from the app, not a button MyChart's page renders. The Expo bill alert deep-links to it. Reviewed in #388. |
| `Success`, `ShowingAll`, `CanEditPaymentPlan`, `URLEditPaymentPlan`, `Filters`, `BillingSystem`, `billType`, `IsStatement`, `StatementDisplayDate`, `ShouldShowADACopyright` | Page config | — | — | — | UI flag / portal link / internal. |

Per charge (each visit row):

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `StartDateDisplay`, `DateRangeDisplay` | Service date(s) | — | ✓ | ✓ | When. |
| `Description` | What was billed | — | ✓ | ✓ | What. |
| `Patient`, `Provider` | Who | — | ✓ | ✓ | Who, on both sides. |
| `HospitalAccountDisplay`, `HospitalAccountId` | Account | — | ✓ | — | Identifier; detail. |
| `PrimaryPayer` | Insurance | — | ✓ | ✓ | Who was billed first. |
| `ChargeAmount` | Total charges | — | ✓ | ✓ | The bill. |
| `InsurancePaymentAmount`, `InsuranceAmountDue` | Insurance side | — | ✓ | ✓ | What insurance paid and still owes. |
| `InsuranceEstimatedPaymentAmount`, `InsuranceAmountDueRaw` | Estimate and numeric form | — | ✓ | — | Detail. |
| `SelfPaymentAmount`, `SelfAmountDue` | Patient side | — | ✓ | ✓ | What the patient paid and owes. |
| `SelfAmountDueRaw` | Numeric form | — | ✓ | — | For consumers that sum. |
| `SelfAdjustmentAmount`, `SelfDiscountAmount`, `SelfBadDebtAmount`, `SelfBadDebtAmountRaw`, `SelfPaymentPlanAmountDue`, `SelfPaymentPlanAmountDueRaw`, `NotOnPlanAmount`, `NotOnPlanAmountRaw`, `ContestedChargeAmount`, `ContestedPaymentAmount`, `SurchargeAmount`, `TaxOrSurcharge` | Adjustments and plan amounts | — | ✓ | — | Detail. |
| `IsPatientNotResponsible`, `PatientNotResponsibleYet`, `IsOnPaymentPlan`, `IsNotOnPaymentPlan`, `IsBadDebtHAR` / `IsBadDebtVisit`, `IsContestedHAR`, `IsClosedHospitalAccount`, `AdjustmentsOnly` | Charge state | — | ✓ | — | Detail. |
| `PatFriendlyAccountStatusAccessibleText` | Status as text | — | ✓ | — | The readable form of the status; detail. |
| `PatFriendlyAccountStatus`, `VisitBadDebtScenario`, `VisitStatusesEqualToClosed[]`, `IsUnpayableHAR` | Status codes | — | — | — | Duplicate of the text / internal. |
| `EstimateInfo.EstimateAmount`, `.EstimateStatus` | Cost estimate | — | ✓ | — | Detail. |
| `EstimateInfo.EstimateID`, `IsPaymentPlanEstimate`, `IsResolvedEstimatedPPAccount`, `EmptyVisitEstimateID` | Estimate plumbing | — | — | — | Internal. |
| `AgencyInformation.Name`, `.PhoneNumber`, `AgencyInformationDescription` | Collections agency | — | ✓ | — | Detail. |
| `ProcedureList[].Description`, `.Amount`, `.SelfAmountDue`, `.InsuranceAmountDue`, `.IsContested`, `.HasAmountDue` | Line items | — | ✓ | — | The itemization; detail. |
| `ProcedureList[].PaymentList[]`, `.SelfBadDebtAmount`, `.HasBadDebtAmount`, `.AdjustmentsOnly`, `.BillingSystem` | Line-item detail | — | ✓ | — | Detail. |
| `ProcedureGroupList[].Description`, `.Amount`, `.ProcedureList[]`, `.PaymentList[]`, `.EstPlanPaymentList[]` | Grouped line items and their payments | — | ✓ | — | Detail. |
| `ProcedureGroupList[].VisitIndex`, `.VisitGroupType`, `.HasEstPlanList`, `.IsPaymentsOnly`, `.HasPaymentsTowardsEstimates`, `.HasContestedProcedures`, `.IsExpanded`, `.AlwaysShowDetails` | Grouping plumbing | — | — | — | Internal / UI flag. |
| `CoverageInfoList[].CoverageName`, `.Billed`, `.Covered`, `.PendingInsurance`, `.RemainingResponsibility`, `.Copay`, `.Deductible`, `.Coinsurance`, `.NotCovered`, `.Benefits[].Name`, `.Amount` | Explanation of benefits | — | ✓ | — | Detail. |
| `CoverageInfoList[].ShowInsuranceCoveredHelp`, `.ShowInsurancePendingHelp`, `ShowCoverageHelp`, `ShowInsurancePendingHelp`, `ShowInsuranceCoveredHelp` | Help-icon flags | — | — | — | UI flag. |
| `VisitAutoPay`, `ShowVisitAutoPay`, `CanAddToPaymentPlan` | Auto-pay enrollment UI | — | — | — | UI flag. |
| `GroupType`, `Index`, `BillingSystem`, `BillingSystemDisplay`, `IsSBO`, `ProviderId`, `IsLTCSeries`, `LevelOfDetailLoaded`, `IsExpanded`, `BlockExpanding`, `AlwaysShowDetails`, `SuppressDayFromDate`, `SuppressProcedureAmount`, `AdjustmentSuppressionSetting`, `StartDateAccessibleText` | Rendering and ids | — | — | — | UI flag / internal. |
| `StartDate`, `StartDayOfMonth`, `StartMonth`, `StartYear` | Epic day count and split renderings of `StartDateDisplay` | — | — | — | Internal / duplicate. |

Statements (`DataStatement.StatementList[]` and `DataDetailBill.StatementList[]`,
merged with `IsDetailBill` telling them apart):

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `FormattedDateDisplay` | Statement date | — | ✓ | ✓ | When. |
| `DateDisplay` | Same, shorter | — | ✓ | — | Duplicate rendering; kept in standard because the PDF filename uses it. |
| `Description` | What it is | — | ✓ | ✓ | What. |
| `SubText` | Extra line | — | ✓ | — | Detail. |
| `StatementAmountDisplay` | Amount | — | ✓ | ✓ | How much. |
| `IsRead` | Read state | — | ✓ | ✓ | Unread statements first. |
| `IsDetailBill`, `IsPaperless`, `ServiceDateStart`, `ServiceDateEnd` | Statement detail | — | ✓ | — | Detail. |
| `RecordID` | Statement id; the PDF download key | — | ✓ | — | Handle for a future statement-PDF capability. |
| `ImagePath`, `Token`, `EncBillingSystem`, `PrintID`, `BillingSystem`, `Format`, `IsEB`, `URLStatement` | PDF-download plumbing | — | — | — | Internal; the other keys the download needs, available in `raw`. |
| `Show`, `Date`, `DayOfMonth`, `Month`, `Year`, `LinkText`, `LinkDescription` | Rendering and split dates | — | — | — | UI flag / duplicate. |
| list-level `HasUnread`, `HasRead`, `ShowAll`, `PaperlessStatus`, `ShowPaperlessSignup`, `ShowPaperlessCancel`, `URLPaperlessBilling`, `IsPaperlessAllowedForSA`, `IsDetailBillModel`, `noStatementsString`, `allReadString`, `loadMoreString` | Page config | — | — | — | UI flag / portal link. |

Payments (`LoadPaymentList` `Data.PaymentList[]`):

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `FormattedDateDisplay` | Payment date | — | ✓ | ✓ | When. |
| `Description` | What was paid and how | — | ✓ | ✓ | What. |
| `SubText` | Extra line (card, confirmation) | — | ✓ | — | Detail. |
| `PaymentAmountDisplay` | Amount | — | ✓ | ✓ | How much. |
| `UndistributedAmountDisplay` | Unapplied remainder | — | ✓ | — | Detail. |
| `Receipt.DisplayNumber`, `.SerialNumber` | Receipt number | — | ✓ | — | Detail. |
| `Receipt.FileName`, `.BlobToken`, `.IsValidReceipt`, `.PrintStatus`, `.ReceiptStatus`, `.ViewReceiptOptions.*`, `.MobileDocViewerSupported`, `.Url` | Receipt download plumbing | — | — | — | Internal / UI flag. |
| `CoverageInfo` | Coverage | — | — | — | Always empty: null on capture. |
| `ID`, `ElementID`, `Index`, `DayOfMonth`, `Month`, `Year`, `HtmlSubText`, `IsBadDebtAdj`, `IsWriteOffAdj`, `IsSurchargeAdj`, `CanEdit`, `EditPaymentOptions`, `CanCancel`, `CancelCommandOptions`, `ConsentDocument`, `ViewConsentOptions`, `IsCardExpiringSoon`, `HasCardExpired` | Ids, split dates, edit/cancel UI | — | — | — | Internal / duplicate / UI flag. |
