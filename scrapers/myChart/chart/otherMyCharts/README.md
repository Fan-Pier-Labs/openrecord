# `otherMyCharts`

MyChart accounts at *other* organizations that are linked into this one — Epic's Happy
Together / Care Everywhere ("DXR") record sharing.

| | |
| --- | --- |
| **Capabilities** | `get_linked_accounts` (read, `lessFrequentlyUsed`) |
| **Source** | [`otherMyCharts.ts`](otherMyCharts.ts) · [`otherMyCharts.processor.ts`](otherMyCharts.processor.ts) |
| **Activity** | Legacy jQuery `/Community/Manage` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Community/Manage` | — | antiforgery token |
| `POST /Community/Shared/LoadCommunityLinks?noCache=<random>` | `controllerType=2&showDXROrgInMO=false` (form-encoded) | the linked organizations |

Three things about this request are unusual and all three are load-bearing:

- it is **form-encoded**, not JSON, like every legacy MVC route here;
- the token header is **lower-case** `__requestverificationtoken`, which is what the page's
  own JS sends;
- the `noCache` query parameter matters — without it a repeat call can be served a stale
  organization list.

## Notes and research

- **This is a map of where else the record lives.** It answers "which other health systems
  hold my records", which is a question no other capability answers, and it is how a user
  discovers the *next* MyChart instance worth connecting.
- `OrgList` is a map of ~50-field organization records, and most of those fields are link
  UI and DXR plumbing. The one clinical fact per organization is
  `LastEncounterDetail` — the patient, physician, department, date and time of the last
  visit there.
- The **link-problem fields** (`IsDisabled`, `IsInvalidCeLink`, `InvalidLinkReason`,
  `ErrorMessage`, …) are kept in `standard` on purpose: a broken link is the explanation for
  data that is missing from the rest of the chart.
- `LastAccessTokenDateTime` says how stale the linked organization's data is.
- One of the capabilities pinned by
  [#406](https://github.com/Fan-Pier-Labs/openrecord/pull/406) — and the legacy form-POST
  representative in `serverErrors.integration.test.ts`, so a failed answer here cannot read
  as "no linked accounts".

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

## `get_linked_accounts`

`POST /Community/Shared/LoadCommunityLinks`. `OrgList` is a map of ~50-field
organization records.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `OrgList[*].OrganizationName` | Linked organization | — | ✓ | ✓ | Which other health systems the record reaches. |
| `OrgList[*].LastEncounterDetail.Patient`, `.Physician`, `.Department`, `.Date`, `.Time` | Last visit there | — | ✓ | ✓ | The one clinical fact in the payload. |
| `OrgList[*].OrganizationId` | Id | — | ✓ | — | Identifier; detail. |
| `OrgList[*].LinkType`, `.UserActionStatus`, `.UserMyChartStatus` | Link state | — | ✓ | — | Detail. |
| `OrgList[*].DisplayAddress[]` | Address | — | ✓ | — | Detail. |
| `OrgList[*].LastAccessTokenDateTime` | When the link last refreshed | — | ✓ | — | Says how stale the linked data is; detail. |
| `OrgList[*].IsDisabled`, `.IsInvalidCeLink`, `.InvalidLinkReason`, `.InvalidLinkRetryDate`, `.ErrorMessage`, `.NeedCeAuth`, `.LinkErrorCode` | Link problems | — | ✓ | — | A broken link explains missing data; detail. |
| `OrgList[*].LogoUrl`, `.TermsAndConditionsUrl`, `.ProxyTermsAndConditionsUrl` | Assets and links | — | — | — | Asset / portal link. |
| `OrgList[*].ShowSignup`, `.ShowSignUpUnavailableMessage`, `.Accept`, `.CanScheduleCrossOrgVideoVisit`, `.DisplayAutoRefresh`, `.ShowUnavailableMsg`, `.CanJump`, `.HiddenFromMyChart`, `.CanCreateCELink`, `.InProgressOrgNotSeen`, `.ShouldDisableLink`, `.DisclaimerOverride`, `.IsPPOC`, `.IdentityRelationship`, `.H2GRemoteAuthLinkWorkflow` | Link UI | — | — | — | UI flag. |
| `OrgList[*].CELocationId`, `.RelatedOrganizations`, `.HasChildOrgs`, `.IsSSO`, `.IncompleteH2GSetup`, `.CurrentlyLoadingDxrData`, `.ErrorLoadingDxrData`, `.HasValidRefreshToken`, `.IsWithinThrottlingTime`, `.ShouldRemindForUpdate`, `.ShowInRefreshBanner`, `.IsMyChartCentral`, `.PayerOrgDetails`, `.NewSubjectList` | DXR plumbing | — | — | — | DXR plumbing. |
| `HomeOrgName`, `CEOptOut`, `ForwardedLinks[]` | Account-level link state | — | ✓ | — | Detail. |
| `Spotlight[]`, `AutoQueryList{}`, `InProgressList{}`, `IsConsentNeeded`, `HideAskLater`, `HasSearchableOrgs`, `H2GHasBeenViewed`, `IsNPP`, `FhirUpdateFrequency`, `FhirSessionThrottlingTime`, `IsSelfVerified` | Suggestions and page config | — | — | — | UI flag / DXR plumbing. |
