# `bills`

Billing: guarantor accounts, the charges on each, statements, and payment history.

| | |
| --- | --- |
| **Capabilities** | `get_billing` (read) · `download_billing_statement` (read, file) |
| **Source** | [`bills.ts`](bills.ts) · [`bills.processor.ts`](bills.processor.ts) · [`summaryHtml.ts`](summaryHtml.ts) · [`types.ts`](types.ts) · [`shared/epicDate.ts`](../../../../shared/epicDate.ts) |
| **Activity** | Legacy `/Billing/*` |

## Endpoints

| Request | Purpose |
| --- | --- |
| `GET /Billing/Summary` | HTML — one `.ba_card` per guarantor account |
| `GET /Billing/Details/GetVisits?…&filterOption=1&searchStartDTE=…&searchStopDTE=…` | the charges (**payload**) |
| `POST /Billing/Details/GetMoreVisits` | hydrates the stub rows `GetVisits` paged out (best effort; sent with the details page's antiforgery token) |
| `GET /Billing/Details/GetStatementList?…` | statements (best effort) |
| `GET /Billing/Details/LoadPaymentList?…` | payment history (best effort) |
| `GET /Billing/Details?ID=…&Context=…` | HTML — carries `EncID`, the statement-PDF token (best effort) |
| `GET /Billing/Details/DownloadFromBlob/?type=1&id=<RecordID>&earId=<EncID>&billSys=<EncBillingSystem>&fileKey=<ImagePath>&token=<Token>&fileName=Statement_<DateDisplay>&DocExt=PDF&PesId=&cid=` | the statement PDF (`download_billing_statement` only) |

Everything after the summary runs **per account**. The summary and the visit list are the
payload and a failure there throws; the other three are best effort — a statement-list
outage should not cost the caller their charge history — and a failed response is still
recorded, with the processor naming it in a per-account `unavailable` list.

Every URL carries `noCache=<random>`.

## Notes and research

- **Dates on these routes are `dte`, an Epic day number** — whole days since 1840-12-31,
  which is 47,117 days before the Unix epoch, because Epic runs on MUMPS and `$HOROLOG`
  counts from there. [`shared/epicDate.ts`](../../../../shared/epicDate.ts) converts both
  ways, and is shared with the visit list (`Dat`) and the anonymous scheduler (`Dte`) — same
  number, three names. The search window sent here is deliberately absurd (100 years back,
  1 year forward), because the endpoint filters on explicit dates rather than offering
  "all".
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
- **`GetVisits` pages, and the scraper hydrates what it holds back.** The rows past the
  first page come back as stubs: `Description` is the `"{VisitType} at {Facility}"` template
  with both slots blank (`"Visit at "`), `ProcedureList` and `CoverageInfoList` are null,
  `HospitalAccountId` is an encrypted handle instead of the HAR number, and **every amount is
  the string `"$0.00"`** — on visits charged hundreds or thousands. Only the service date is
  real. A live instance answered with 25 such rows out of 45; hydrating them turned $0.00
  into tens of thousands of dollars of real charges, so reporting the stub as-is silently undercounts any sum
  over a charge column.
  Epic's own UI does not render them: it drops the stubs and offers "Load more accounts" /
  "Load all accounts", which post every outstanding stub to
  **`POST /Billing/Details/GetMoreVisits`** — form-encoded `id`, `context` and
  `listOfAccounts[i].{EncAccountID,IsPes,IsHar}`, where `EncAccountID` is the stub's own
  encrypted `HospitalAccountId`, plus `EncPBSerID` when the stub carries a `ProviderId`
  (`IsPes: true` instead, for a standalone estimate keyed by `EmptyVisitEstimateID`). The
  answer is whole replacement rows with `LevelOfDetailLoaded: 2`, under
  `Data.UnifiedVisitList`. The scraper posts every stub at once, loops on whatever is still
  missing (the server may cap a batch), and the processor swaps each stub for its real row
  before de-duplication — a stub and its hydrated self do not look alike, because the
  identity includes exactly the fields hydration fills in.
  Two things this needs that the older flow did not: the **details page is fetched first**,
  because it carries the antiforgery token Epic's own client sends on this call (a token-less
  POST was never tried, so whether the server refuses one is unverified — the scraper simply
  sends what the client sends, and skips hydration when no token could be read), and the
  whole hydration is
  best-effort — a failure leaves the stub in place rather than costing the caller the charge
  list, marked `detailLoaded: false` and counted in the account's `unhydratedVisits` so a
  placeholder `"$0.00"` can never be read as a settled balance. `LevelOfDetailLoaded` is `0` on every stub and `2` on every populated row; no other
  value has been observed. Verified on the wire against 1 real instance.
- **The UI's default filter is not the scraper's.** The billing activity sends
  `filterOption=` empty (and empty dates), which on the captured account returned
  `HasVisits: false` — nothing at all. The scraper's `filterOption=1` with a 100-year window
  is what surfaces the full history, and is also what puts the account into the paged,
  lazy-loading path. `Data.ShowingAll` is **never read by Epic's own client** and is `false`
  even when nothing is truncated, so it is not a truncation signal and is not reported.
- Statements arrive in **two lists** (`DataStatement` and `DataDetailBill`); they are
  merged with `IsDetailBill` telling them apart. Both download the same way.
- **The statement PDF needs five keys from two places.** Four ride on the statement row
  (`RecordID`, `EncBillingSystem`, `ImagePath`, `Token`); the fifth, `EncID`, is only in the
  details *page's* inline `accountDetailsController.Initialize({...})` config, per guarantor
  account. `download_billing_statement` therefore re-walks the summary and each account's
  statement list to find the row whose `RecordID` it was given, then reads that account's
  page for `EncID`. A bad key does not 4xx: `DownloadFromBlob` answers 200 with an HTML page,
  so the bytes are checked for the `%PDF` signature before they are called a PDF. The handle
  is `RecordID` rather than an opaque id packing all five keys the way `image_id` does for
  imaging: the other four come from a live session and how long they stay valid past it is
  unverified, so re-reading them costs two-plus-N requests per download but can never hand
  `DownloadFromBlob` a stale key.
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
| `unhydratedVisits` | How many of `visits` are still unhydrated stubs | ✓ | ✓ | ✓ | Derived. Zero on a healthy read; non-zero means any sum over this account's charges is an undercount. |
| `paymentUrl` | The pay-online path from the summary page's inline config, relative to the instance root | ✓ | ✓ | — | Derived. How a patient pays from the app (rule 4). It lives on the summary page: `GetVisits`' own `URLMakePayment` is null on every live instance checked. |
| `id`, `context`, `encBillingId` | Account keys the detail calls take | — | — | — | Internal; visible in `raw` as request bodies. |
| `totalDue` | Sum across accounts | ✓ | ✓ | ✓ | Derived. The one number most readers want. |

`GetVisits` (`Data.*`):

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `UnifiedVisitList[]`, `VisitList[]`, `InformationalVisitList[]`, `NoBalanceVisitList[]`, `BadDebtVisitList[]`, `PaymentPlanVisitList[]`, `AdvanceBillVisitList[]`, `ContestedVisitList[]`, `AdjustmentVisitList[]` | The charge lists; overlapping across releases | ✓ | merged into one `visits[]`, de-duplicated on (`HospitalAccountId`, `StartDate`, `Description`, `SelfAmountDueRaw`) | same | Derived merge (#380). Reading one list loses charges on whichever release does not populate it; reading all double-counts. |
| `category` | Which list the row came from | ✓ | ✓ | ✓ | Derived. "Bad debt" and "payment plan" change what a charge means. |
| `detailLoaded` | Whether this row carries real numbers, or is still the stub hydration could not fill in | ✓ | ✓ | ✓ | Derived from `LevelOfDetailLoaded`. `true` on a healthy read; `false` only when `GetMoreVisits` did not run or did not work, and then every amount on the row is a placeholder `"$0.00"`. In concise because that is the mode the model-facing clients read. |
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
| `ProcedureList[].DescriptionText` | Line-item description, markup stripped | ✓ | ✓ | — | Derived (rule 9). MyChart wraps the procedure code inside the description — `"Office Visit, Established Pat - <span class='subtlecolor'>99213 (CPT®)</span>"` — so the **CPT code only reaches a reader as text** if the span is converted rather than passed through. `Description` itself carries markup and stays in `raw`. |
| `ProcedureList[].Amount`, `.SelfAmountDue`, `.InsuranceAmountDue`, `.IsContested`, `.HasAmountDue` | Line items | — | ✓ | — | The itemization; detail. |
| `ProcedureList[].PaymentList[]`, `.SelfBadDebtAmount`, `.HasBadDebtAmount`, `.AdjustmentsOnly`, `.BillingSystem` | Line-item detail | — | ✓ | — | Detail. |
| `ProcedureGroupList[].Description`, `.Amount`, `.ProcedureList[]`, `.PaymentList[]`, `.EstPlanPaymentList[]` | Grouped line items and their payments | — | ✓ | — | Detail. |
| `ProcedureGroupList[].VisitIndex`, `.VisitGroupType`, `.HasEstPlanList`, `.IsPaymentsOnly`, `.HasPaymentsTowardsEstimates`, `.HasContestedProcedures`, `.IsExpanded`, `.AlwaysShowDetails` | Grouping plumbing | — | — | — | Internal / UI flag. |
| `CoverageInfoList[].CoverageName`, `.Billed`, `.Covered`, `.PendingInsurance`, `.RemainingResponsibility`, `.Copay`, `.Deductible`, `.Coinsurance`, `.NotCovered`, `.Benefits[].Name`, `.Amount` | Explanation of benefits | — | ✓ | — | Detail. |
| `CoverageInfoList[].ShowInsuranceCoveredHelp`, `.ShowInsurancePendingHelp`, `ShowCoverageHelp`, `ShowInsurancePendingHelp`, `ShowInsuranceCoveredHelp` | Help-icon flags | — | — | — | UI flag. |
| `VisitAutoPay`, `ShowVisitAutoPay`, `CanAddToPaymentPlan` | Auto-pay enrollment UI | — | — | — | UI flag. |
| `LevelOfDetailLoaded` | How much of the row MyChart loaded | — | — | — | Internal: `0` marks a stub the scraper then hydrates via `GetMoreVisits`, so no unhydrated row reaches a caller. |
| `GroupType`, `Index`, `BillingSystem`, `BillingSystemDisplay`, `IsSBO`, `ProviderId`, `IsLTCSeries`, `IsExpanded`, `BlockExpanding`, `AlwaysShowDetails`, `SuppressDayFromDate`, `SuppressProcedureAmount`, `AdjustmentSuppressionSetting`, `StartDateAccessibleText` | Rendering and ids | — | — | — | UI flag / internal. |
| `StartDate`, `StartDayOfMonth`, `StartMonth`, `StartYear` | Epic day count and split renderings of `StartDateDisplay` | — | — | — | Internal / duplicate. |

Statements (`DataStatement.StatementList[]` and `DataDetailBill.StatementList[]`,
merged with `IsDetailBill` telling them apart):

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `dateISO` | Statement date as `YYYY-MM-DD` | ✓ | ✓ | ✓ | Derived from `DateDisplay`. One live instance (33 statements) sent `FormattedDateDisplay: null` on every statement while `DateDisplay` held `YYYYMMDD`, so this is the date a consumer can count on. |
| `FormattedDateDisplay` | Statement date as MyChart renders it | — | ✓ | ✓ | When; null on some instances (see `dateISO`). |
| `DateDisplay` | Same, as `YYYYMMDD` | — | ✓ | — | Source of `dateISO`; kept in standard because the PDF filename uses it. |
| `Description` | What it is | — | ✓ | ✓ | What. |
| `SubText` | Extra line | — | ✓ | — | Detail. |
| `StatementAmountDisplay` | Amount | — | ✓ | ✓ | How much. |
| `IsRead` | Read state | — | ✓ | ✓ | Unread statements first. |
| `IsDetailBill`, `IsPaperless`, `ServiceDateStart`, `ServiceDateEnd` | Statement detail | — | ✓ | — | Detail. |
| `RecordID` | Statement id; the PDF download key | — | ✓ | ✓ | The handle `download_billing_statement` takes — in concise for the same reason `image_id` is: a model can only ask for a file it has been shown the key to. |
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

## `download_billing_statement`

`record_id` (required) is a statement's `RecordID` from `get_billing`. Not a processor
capability — there is no `mode` — and it is `returnsFile`: `run` returns a `FilePayload`
(`fileName`, `mimeType: application/pdf`, `bytes`) plus a `statement` block (`RecordID`,
`dateISO`, `FormattedDateDisplay`, `Description`, `StatementAmountDisplay`, `IsDetailBill`)
so a caller can label what it saved. Each client puts the bytes somewhere the user can open
them: the Claude Desktop extension writes to the Downloads folder (never overwriting — a
second copy is `Statement_20260115-2.pdf`) and answers with the path; the CLI writes to
`--output <dir>` (default: the working directory) and prints the path; the mobile app runs
the shared `returnsFile` path and, having no file surface, reports that a PDF cannot be shown
there and names the two clients that save it. `fileName` is `Statement_<DateDisplay>.pdf`,
the name MyChart's own download button uses, made safe by `safeFileName`.
