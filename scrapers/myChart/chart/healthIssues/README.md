# `healthIssues`

The problem list — the conditions a clinician has entered on the chart, with the date each
was noted.

| | |
| --- | --- |
| **Capabilities** | `get_health_issues` (read) |
| **Source** | [`healthIssues.ts`](healthIssues.ts) · [`healthIssues.processor.ts`](healthIssues.processor.ts) |
| **Activity** | Legacy jQuery `/Clinical/HealthIssues` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Clinical/HealthIssues` | — | antiforgery token |
| `POST /api/HealthIssues/LoadHealthIssuesData` | `{}` | the problem list |

Note the capitalised `HealthIssues` in the path. This API is not consistent about case —
most `/api/*` segments are lower-case or kebab-case — and the path is matched literally.

## Notes and research

- Each element carries the problem **twice**: `healthIssueItem` and an identical
  `localItem`. The processor keeps one.
- `externalItems[]` / `externalOrgs[]` are the same problem as other organizations recorded
  it, arriving through Care Everywhere. They are uncaptured, so they pass through whole
  rather than being narrowed to guessed names.
- The endpoint also returns the patient's date of birth, which `get_profile` already owns;
  it is dropped here rather than reported twice.
- `showDxrRefreshBanner` / `showDxrBannerAction` are Care Everywhere ("DXR") banner state,
  not chart data.

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
