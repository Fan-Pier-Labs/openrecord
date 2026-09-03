# `healthIssues` — what each mode carries

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

## `get_health_issues`

`POST /api/HealthIssues/LoadHealthIssuesData`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `dataList[].healthIssueItem.name` | Problem name | — | ✓ | ✓ | The problem. |
| `dataList[].healthIssueItem.formattedDateNoted` | Date noted | — | ✓ | ✓ | When it entered the chart. |
| `dataList[].healthIssueItem.id` | Problem id | — | ✓ | — | No capability takes it yet; kept in standard as an identifier. |
| `dataList[].healthIssueItem.isReadOnly` | Patient may not edit | — | ✓ | — | Weak signal, but real and cheap. |
| `dataList[].healthIssueItem.action` | Pending patient-edit action code | — | — | — | UI flag. |
| `dataList[].localItem.*` | Identical copy of `healthIssueItem` | — | — | — | Duplicate. |
| `dataList[].externalItems[]`, `.externalOrgs[]`, `.hasLocalInstance` | Other organizations' versions of the same problem | — | ✓ | — | Uncaptured; passed through. Cross-organization detail. |
| `dataList[].contentLinkURL`, `.contentLinkPath`, `.target` | Education link | — | — | — | Portal link. |
| `hasUpdateSecurity`, `hasStandAloneUpdateSecurity`, `alwaysShowSearchMore`, `showDxrRefreshBanner`, `showDxrBannerAction`, `preTextStringKey`, `healthIssuesUrl` | Page config | — | — | — | UI flag / DXR plumbing / portal link. |
| `dateOfBirth` | Patient DOB | — | — | — | Duplicate of `get_profile`. |
