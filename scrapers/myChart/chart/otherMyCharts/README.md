# `otherMyCharts` — what each mode carries

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
