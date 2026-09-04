# `insurance` — what each mode carries

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

## `get_insurance`

`GET /Insurance` for the antiforgery token, then `POST /Insurance/Coverages/GetCoverages`
(form-encoded). The page itself carries no coverage on any real instance — its whole body is
an empty `<div id="coverages-list">` that `$$WP.Insurance.CoveragesController` fills over
AJAX — so the previous page-scraping reader returned an empty list from every real MyChart
whatever the patient's coverage was. Captured on four live instances; the coverage element's
field set was identical on all four.

MyChart splits coverages into five buckets by where they are in the submission workflow, and
they stay apart: a coverage waiting on verification is not one a clinic can bill today.

Each coverage passes through **whole**, with `bucket` added. The table names the keys the
captures showed and what `concise` keeps; it is not a filter. Nothing is dropped for being
empty on the captured accounts — none of them had uploaded an insurance card, which says
nothing about whether `FrontDocument` is ever populated.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `ActiveCoverages[]` | Billable today | — | ✓ | ✓ | The answer to "what insurance do I have". |
| `CoveragesPendingSubmission[]`, `CoveragesPendingDeletion[]`, `CoveragesInReview[]`, `CoveragesInVerification[]` | Mid-workflow | — | ✓ | ✓ | Flattening them into "active" is how a pending card reads as billable. |
| `CoverageName` | The card's display name, usually "payer (plan)" | — | ✓ | ✓ | What the patient sees on the page. |
| `PayorName` | Payer | — | ✓ | ✓ | The other half of what a clinic asks for. |
| `MemberId`, `GroupNumber` | Member and group | — | ✓ | ✓ | What a clinic asks for at the desk. |
| `FormattedEffectiveDate` | MyChart's own formatted start date | — | ✓ | ✓ | Whether the coverage has started. |
| `FormattedEndDate` | End date; empty means open-ended | — | ✓ | — | Detail; `Termed` is the summary. |
| `bucket` | Which of the five lists this coverage came from | ✓ | ✓ | ✓ | Derived. Concise is one flat list, so the bucket rides on the coverage. |
| `PayorId`, `PlanName` | Payer id, plan under it | — | ✓ | — | Empty on some instances even when a plan exists; detail. |
| `SubscriberId`, `SubscriberName`, `SubscriberIsSelf` | Who holds the policy | — | ✓ | — | Detail, and often not the patient. |
| `MemberName` | Who is covered | — | ✓ | — | Detail. |
| `Future`, `Termed` | Not started / already ended | — | ✓ | — | Detail; the dates say the same thing. |
| `Comments`, `SuspendedText` | Free text the organization attached | — | ✓ | — | Detail. |
| `Status`, `CoverageType`, `CvgCoveredStatus`, `CvgReason` | Numeric codes | — | ✓ | — | Passed through: MyChart labels them nowhere the client can see. |
| *(every other key on the element)* | Whatever else MyChart sent | — | ✓ | — | The coverage passes through whole; the rows above name what the captures showed, not what is allowed through. |
| `hasNoCoverages` | Every bucket empty | ✓ | ✓ | ✓ | Derived. An observed answer — one captured account has no coverage — not an inference from page text. |
| `IsProxyContext` | Serving a family member's record | — | ✓ | — | Context, not coverage. |
| `Settings{}` | What this instance lets the patient do | — | ✓ | — | UI capability flags. |
| `FrontDocument`, `BackDocument`, `IsCoverageDocumentFromPayer` | The insurance card images | — | ✓ | — | Passed through. Null on all four captured accounts because none had uploaded a card — which is not evidence the field is always null. |
| `CoverageFHIRId`, `OrganizationId` | Join keys to anything FHIR-shaped | — | ✓ | — | Passed through. Empty on the captures; still not ours to drop. |
| `SubscriberFirstName`, `SubscriberLastName`, `SubscriberDateOfBirth`, `MemberFirstName`, `MemberLastName`, `MemberDateOfBirth`, `PatientIsSubscriber` | Names and dates of birth split into parts | — | ✓ | — | Passed through. Patient data; the processor does not decide a caller doesn't need it. |
| `Index`, `PbiId` | Internal to the update workflow | — | ✓ | — | Passed through. Never dropped for being empty. |
| `HasExistingCoveragesInRTE` | Envelope-level flag | — | — | — | Envelope, not a coverage. In `raw`. |

The processor **throws** rather than reporting "no insurance on file" when the endpoint did
not answer with a recognizable envelope: a non-2xx, the 200-with-an-empty-body MyChart gives
an unrecognized encounter context, or a body carrying none of the five lists (an expired
session's login page). Reporting any of those as "no coverage" is the failure this capability
exists to avoid.
