# `healthSummary` — what each mode carries

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

## `get_health_summary`

`POST /api/health-summary/FetchHealthSummary` and
`POST /api/health-summary/FetchH2GHeader`. The scraper keeps six fields; the
header body is ~500 lines and embeds a copy of the upcoming-visits view model.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `header.patientAge` | Age as MyChart renders it | — | ✓ | ✓ | Top-line fact; the point of the summary. |
| `header.bloodType` | Blood type | — | ✓ | ✓ | Top-line fact. |
| `header.height.value`, `.dateRecorded` | Latest height | — | ✓ | ✓ | Top-line fact; the date says how current it is. |
| `header.weight.value`, `.dateRecorded` | Latest weight | — | ✓ | ✓ | Top-line fact. |
| `patientFirstName` | First name | — | ✓ | — | Real, but `get_profile` is the identity capability. |
| `isPatientAdmitted` | Currently an inpatient | — | ✓ | ✓ | A clinical state the scraper drops today. Whether the patient is in hospital right now belongs in the shortest view. |
| `conditionList[]`, `journeyList[]`, `actionPlans[]` | Conditions, care journeys, action plans | — | ✓ | — | Uncaptured; passed through whole. Out of concise until the element shape is known. |
| `schoolReportInfo.schoolReportTitle`, `.schoolReportID` | School health form | — | — | — | Internal: a report id no capability fetches. |
| `quickLinkDictionary.*` | Ten portal URLs | — | — | — | Portal link. |
| `canAccessSharingHub`, `isProxyContext` | Caller state | — | — | — | Session context. |
| `lastVisit.date`, `.visitType`; `nextVisit.date`, `.visitType` | Most recent and next visit | — | ✓ | ✓ | Two dates a reader asks for first. `nextVisit` is dropped by the scraper today. |
| `lastVisit.visitDetailsURL`, `.openRemotely`, `.mode`, `.visitCategory`; same on `nextVisit` | Link and rendering hints | — | — | — | Portal link / UI flag. |
| `upcomingVisitsList[]` | camelCase copy of `get_upcoming_visits` | — | — | — | Duplicate; one capability per fact. |
