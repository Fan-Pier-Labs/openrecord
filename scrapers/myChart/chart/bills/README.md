# `bills`

Billing: guarantor accounts, the charges on each, statements, and payment history.

| | |
| --- | --- |
| **Capabilities** | `get_billing` (read) |
| **Source** | [`bills.ts`](bills.ts) · [`bills.processor.ts`](bills.processor.ts) · [`summaryHtml.ts`](summaryHtml.ts) · [`utils.ts`](utils.ts) · [`types.ts`](types.ts) |
| **Activity** | Legacy `/Billing/*` |

## Endpoints

| Request | Purpose |
| --- | --- |
| `GET /Billing/Summary` | HTML — one `.ba_card` per guarantor account |
| `GET /Billing/Details/GetVisits?…&filterOption=1&searchStartDTE=…&searchStopDTE=…` | the charges (**payload**) |
| `GET /Billing/Details/GetStatementList?…` | statements (best effort) |
| `GET /Billing/Details/LoadPaymentList?…` | payment history (best effort) |
| `GET /Billing/Details?ID=…&Context=…` | HTML — carries `EncID`, the statement-PDF token (best effort) |

Everything after the summary runs **per account**. The summary and the visit list are the
payload and a failure there throws; the other three are best effort — a statement-list
outage should not cost the caller their charge history — and a failed response is still
recorded, with the processor naming it in a per-account `unavailable` list.

Every URL carries `noCache=<random>`.

## Notes and research

- **Dates on these routes are `dte`, a 1840-epoch day count.** A `dte` is whole days since
  1840-12-31, which is 47,117 days before the Unix epoch — the epoch mainframes use.
  [`utils.ts`](utils.ts) converts both ways; the functions were lifted out of MyChart's own
  front-end JS. The search window sent is deliberately absurd (100 years back, 1 year
  forward), because the endpoint filters on explicit dates rather than offering "all".
- **Account discovery is HTML parsing, and it has three fallbacks.** `ID`/`Context` are
  read from the `ba_card_status_recentPaymentLabel` link; some instances have no such link,
  so any `/Billing/Details` link in the card is tried next, then the page's inline
  `URLMakePayment` config ([#47](https://github.com/Fan-Pier-Labs/openrecord/pull/47)). An
  account whose keys cannot be found is skipped rather than guessed at.
- **The pay-online link lives on the summary page, not in the payload.**
  `GetVisits`' own `URLMakePayment` is `null` on every live instance checked; the summary
  page's inline `"URLMakePayment": "~/Billing/Payment?ID=…"` is the one that works. It is
  kept despite being a portal link by class, because it is how a patient pays a bill from
  the app.
- **`parseAmount` exists because `parseFloat` read `"$1,234.56"` as `1`** — it stopped at
  the thousands comma. Everything that is not a digit, sign or decimal point is stripped
  first.
- **The charge lists overlap between releases.** `GetVisits` returns nine of them
  (`UnifiedVisitList`, `VisitList`, `BadDebtVisitList`, `PaymentPlanVisitList`, …). Reading
  one loses charges on whichever release does not populate it; reading all double-counts.
  The processor merges them and de-duplicates on
  (`HospitalAccountId`, `StartDate`, `Description`, `SelfAmountDueRaw`), keeping which list
  a row came from as `category` — "bad debt" and "payment plan" change what a charge means.
- Statements arrive in **two lists** (`DataStatement` and `DataDetailBill`); they are
  merged with `IsDetailBill` telling them apart. `bills.ts` also carries statement-PDF
  download helpers (`getEncBillingId`, `saveStatementPdf`, `getBillingStatementPDFs`) which
  are **not** part of the read capability and are called directly.
- **Procedure descriptions arrive with markup inside them** (`<span class='subtlecolor'>`),
  so they need the same text conversion any other MyChart prose field does.

## Modes: what each mode carries

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
| `paymentUrl` | The pay-online path from the summary page's inline config, relative to the instance root | ✓ | ✓ | — | Derived. How a patient pays from the app (rule 4). It lives on the summary page: `GetVisits`' own `URLMakePayment` is null on every live instance checked. |
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
