# `insuranceBenefits`

The patient's benefit accumulators: how much of the deductible and the out-of-pocket
maximum has been used, how much is left, and when each resets.

| | |
| --- | --- |
| **Capabilities** | `get_insurance_benefits` (read) |
| **Source** | [`insuranceBenefits.ts`](insuranceBenefits.ts) · [`insuranceBenefits.processor.ts`](insuranceBenefits.processor.ts) |
| **Activity** | React `/Billing/Details` → `/api/billing-details/*` |

For the **coverages** — payer, plan, member and group numbers, effective dates — see
[`../insurance/`](../insurance/). For charges, statements and payments see
[`../bills/`](../bills/).

**Sample size: one real instance (N=1).** The request and the response shape below were
captured off the wire from a single account. Nothing here is inferred from a fixture or
from Epic's docs, and nothing is modelled that that capture did not show.

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Billing/Summary` | — | which guarantor accounts exist, and each one's `id` / `context` |
| `GET /Billing/Details?ID=…&Context=…` | — | antiforgery token, per account |
| `POST /api/billing-details/GetBenefitsSummary` | `{"guarantorId":"<id>","billingSystem":"<context>"}` | the accumulators for that account |

```
POST /api/billing-details/GetBenefitsSummary
__requestverificationtoken: <antiforgery token from /Billing/Details>
content-type: application/json

{"guarantorId":"<encrypted account id>","billingSystem":"<encrypted context>"}
```

`guarantorId` and `billingSystem` are exactly the `id` and `context`
[`../bills/summaryHtml.ts`](../bills/summaryHtml.ts) already parses off `/Billing/Summary`
per guarantor account (`BillingAccount.id` / `BillingAccount.context`).

It is a React `/api/*` route, so the token is a **header** alongside a JSON body — not the
form field the legacy activities take (`../insurance/` is the form-encoded kind).

## Response shape

```
{
  coverageName, payerName, payerLogoBlobMagicId, lastUpdatedText,
  benefitsPatientId, helpText, coverageId, queryKey,
  noCoverageAvailable, hasAmbiguousCoverages, hasRTEUpdateInProgress,
  canAccessInsuranceHub, canAccessInsuranceSummary, canAccessCustomerService, canAccessAnyLinks,
  insuranceHubUrl, payerPhoneNumber,
  showPhoneNumberAsAction, showPhoneNumberAsTextOnly, showInsuranceSummaryMessage,
  deductible:     { type, network, name, accountBucket: BUCKET, patientBucket: BUCKET },
  moop:           { type, network, name, accountBucket: BUCKET, patientBucket: BUCKET },
  insuranceLimit: { type, network, name, accountBucket: BUCKET, patientBucket: BUCKET }
}
```

where `BUCKET` is

```
{ isLimit, type,                             // type was "Family" on the capture
  totalAmount, usedAmount, remainingAmount,  // formatted strings, "$0.00" style; EMPTY STRING when not populated
  usedRatio,                                 // number, 0..1
  isTotalZero, rollPeriodEndDate,            // rollPeriodEndDate is MyChart's own formatted date
  rollPeriod,                                // "ConYear" when set, the string "0" when not
  numberOfPeriods, usedOnPrevLevel }
```

HTTP 200, ~2.1 KB.

## Notes and research

- **This endpoint is keyed by GUARANTOR ACCOUNT, not by coverage.** Its two arguments are a
  billing account's `id` and `context`, so a patient with two guarantor accounts has two
  benefit cards, and this scraper walks `/Billing/Summary` first for exactly that reason.
  Nothing in the response identifies which account it describes, so `guarantorNumber` and
  `patientName` are lifted from the summary card the request was addressed from.

  That is also why this is its own capability rather than fields on `get_insurance`:
  `get_insurance` is keyed by coverage and reads one endpoint, and the response's
  `coverageId` has not been shown to match `GetCoverages`' `CoverageId` on any instance, so
  joining the two would be inventing a contract (rule 10). Folding it into `get_billing`
  was the other option and was rejected for cost: that read is already a page scrape plus
  four calls per account, and a deductible is not a charge.
- **The two buckets stay apart.** On the captured account `accountBucket` was entirely
  blank — empty-string amounts, `rollPeriod` the string `"0"` — while `patientBucket`
  carried the real numbers. Which side a payer populates is not something one account can
  settle, so neither is collapsed into the other and neither is dropped for being empty:
  rule 6 decides membership by field name.
- **`moop` is Epic's name for maximum out-of-pocket** and keeps it (rule 2). The derived
  `…Number` fields beside each amount are the parse (rule 3); the formatted string stays.
- **"No benefits" is MyChart's own answer.** `noCoverageAvailable` is a field on the
  response, so `hasNoBenefits` is derived from it rather than from an empty accumulator —
  and it is false whenever any guarantor account went unread, because unknown is not none.
- **A per-account failure is named, not swallowed.** The summary page is the payload and
  throws. Each account's token page and POST are tolerated so one guarantor account's
  outage does not cost the other's deductible, and the processor lists the guarantor
  numbers that did not answer in `unavailable`. Every account failing throws the first
  failure — an empty accumulator list from a 500 is exactly the wrong answer (rule 7).
- **The fake** answers a `guarantorId` it has no card for with `noCoverageAvailable: true`
  and empty accumulators. What a real instance does with an id that is not the session's is
  **unverified on 1 instance**, so no status code is modelled for it.

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

## `get_insurance_benefits`

`GET /Billing/Summary`, then per guarantor account `GET /Billing/Details` for the token and
`POST /api/billing-details/GetBenefitsSummary`. One row per guarantor account.

### The envelope

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `accounts[]` | One benefit card per guarantor account | ✓ | ✓ | ✓ | The answer. Keyed by billing account because MyChart keys the endpoint that way. |
| `hasNoBenefits` | Every account answered, and every one said `noCoverageAvailable` | ✓ | ✓ | ✓ | Derived from MyChart's own field. False whenever an account went unread — unknown is not none. |
| `unavailable[]` | Guarantor numbers whose benefits call did not answer | ✓ | ✓ | ✓ | A name here means those accumulators are unknown, not zero. |

### An account

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `guarantorNumber`, `patientName` | Which billing account this card is for | ✓ | ✓ | ✓ | Derived from the summary card the request was addressed from. Nothing in the response says which account it is, and with two accounts the rows are otherwise indistinguishable. |
| `payerName`, `coverageName` | Who is paying, and the plan | — | ✓ | ✓ | Names the accumulators belong to. |
| `lastUpdatedText` | MyChart's own "Last updated 1/1/2026" line | — | ✓ | ✓ | How stale the numbers are — payers report on a lag. Kept as MyChart's own text, never re-formatted (rule 8). |
| `deductible`, `moop`, `insuranceLimit` | The three accumulators. `moop` is Epic's name for maximum out-of-pocket | — | ✓ | ✓ | The answer to "what is my deductible". `null` when MyChart sent no object for one. |
| `noCoverageAvailable` | MyChart's own "nothing to show here" | — | ✓ | ✓ | The difference between no benefits and unread benefits. |
| `helpText` | The explanatory line MyChart renders under the card | — | ✓ | — | Detail; it is the payer's caveat about how current the numbers are. |
| `coverageId`, `benefitsPatientId`, `queryKey` | Opaque ids on the card | — | ✓ | — | Passed through. Not shown to join to `get_insurance`' `CoverageId` on any instance, so not treated as a handle (rule 10). |
| `hasAmbiguousCoverages`, `hasRTEUpdateInProgress` | The payer feed is unsettled, or refreshing | — | ✓ | — | Detail, and both bear on whether the numbers are final. |
| `canAccessInsuranceHub`, `canAccessInsuranceSummary`, `canAccessCustomerService`, `canAccessAnyLinks` | What this instance lets the patient open from the card | — | ✓ | — | Instance capability flags, like `Settings` on `get_insurance`. |
| `insuranceHubUrl` | Link into the payer hub | — | ✓ | — | portal link, kept by class (rule 4): it is where a patient goes to dispute a number. |
| `payerPhoneNumber` | Who to call about it | — | ✓ | — | Detail; the actionable follow-up when a number looks wrong. |
| `payerLogoBlobMagicId` | Payer logo blob key | — | — | — | asset. In `raw`. |
| `showPhoneNumberAsAction`, `showPhoneNumberAsTextOnly`, `showInsuranceSummaryMessage` | Which control MyChart's own page renders | — | — | — | UI flag. In `raw`. |

### An accumulator (`deductible`, `moop`, `insuranceLimit`)

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `name` | The accumulator's display name | — | ✓ | ✓ | Which limit this is, in the payer's own words. |
| `network` | In-network / out-of-network | — | ✓ | ✓ | The same plan has different numbers per network; without it the amounts are ambiguous. |
| `type` | Epic's type word for the limit | — | ✓ | — | Detail; `name` says the same thing in the payer's words. |
| `accountBucket`, `patientBucket` | The account-wide and patient-only tallies | — | ✓ | ✓ | Both, always. On the capture one was blank and the other carried the numbers; which one that is differs by payer, and dropping the blank one is membership by value. |

### A bucket

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `totalAmount`, `usedAmount`, `remainingAmount` | The three numbers, as MyChart formatted them | — | ✓ | ✓ | The answer. Empty string when the payer did not populate this side — emitted anyway (rule 6). |
| `totalAmountNumber`, `usedAmountNumber`, `remainingAmountNumber` | The same three, parsed | ✓ | ✓ | — | Derived (rule 3). A client cannot sum `"$2,000.00"`; `null` when there was nothing to parse. |
| `rollPeriodEndDate` | When the accumulator resets | — | ✓ | ✓ | Half the answer to "how much is left" is "until when". MyChart's own formatting, never re-parsed (rule 8). |
| `type` | "Family" or the individual equivalent | — | ✓ | ✓ | Whose spending this counts. A family deductible read as an individual one is wrong by thousands. |
| `usedRatio` | 0..1, MyChart's own progress fraction | — | ✓ | — | Detail; the three amounts say it. |
| `isLimit`, `isTotalZero` | Whether this side is a real limit, and whether its total is zero | — | ✓ | — | Detail. `isTotalZero` distinguishes "$0.00 limit" from "not populated". |
| `rollPeriod`, `numberOfPeriods` | The reset cadence — `"ConYear"`, or the string `"0"` when unset | — | ✓ | — | Detail; `rollPeriodEndDate` is the usable form. Passed through with MyChart's odd string `"0"` intact (rule 2). |
| `usedOnPrevLevel` | Carried over from a previous benefit level | — | ✓ | — | Passed through. Empty on the one capture, which is not evidence it always is. |
