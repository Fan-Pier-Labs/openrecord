# `educationMaterials` — what each mode carries

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

## `get_education_materials`

`POST /api/education/GetPatEducationTitles`, a bare array.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `displayName` | Title | — | ✓ | ✓ | What was assigned. |
| `assignedDate` | When assigned | — | ✓ | ✓ | When. |
| `elementId`, `eduKey` | Ids | — | ✓ | — | Identifiers; detail. |
| `numTopics` | Topics in the material | — | ✓ | — | Detail. |
| `wasAssignedThisVisit` | Assigned at the current visit | — | ✓ | — | Detail. |
| `numPagesReviewed`, `numPagesUnderstood`, `numPagesQuestions` | Patient's progress | — | ✓ | — | Real, if minor; detail. |
| `numPoints`, `isAdmitted`, `encounterContext`, `canUserTrackUnderstanding`, `thumbnailImage`, `thumbnailImageBlobToken`, `thumbnailIcon`, `tvSupported`, `removeThumbnails` | Gamification, thumbnails, bedside-TV | — | — | — | Asset / UI flag / session context. |
