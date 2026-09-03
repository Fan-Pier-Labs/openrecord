# `medicalHistory` — what each mode carries

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

## `get_medical_history`

`POST /api/histories/LoadHistoriesViewModel`. The scraper keeps diagnoses,
surgeries and family members and drops the whole `socialHistory` block.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `medicalHistory.diagnoses[].diagnosisName`, `.diagnosisDate` | Past diagnoses | — | ✓ | ✓ | Core history. |
| `medicalHistory.medicalHistoryNotes` | Free-text notes | — | ✓ | — | Clinician prose; detail. |
| `surgicalHistory.surgeries[].surgeryName`, `.surgeryDate` | Past surgeries | — | ✓ | ✓ | Core history. |
| `surgicalHistory.surgicalHistoryNotes` | Free-text notes | — | ✓ | — | Detail. |
| `familyHistoryAndStatus.familyMembers[].relationshipToPatientName`, `.conditions[]` | Relative and their conditions | — | ✓ | ✓ | Family history is what a clinician asks for. |
| `…familyMembers[].statusName` | Living / deceased | — | ✓ | ✓ | Part of family history as clinicians record it. |
| `…familyMembers[].nameOrAlias`, `.sexName`, `.relativeAge`, `.relativeAgeEnd` | Relative detail | — | ✓ | — | Age at diagnosis or death is clinically relevant; dropped today. Detail. |
| `…familyMembers[].familyMemberId`, `.relationshipToPatientId`, `.sexId`, `.genderId`, `.statusId` | Code-table ids | — | — | — | Internal. |
| `…familyMembers[].removeFamilyMember`, `.createdOnClient`, `.changes[]` | Edit-form state | — | — | — | UI flag. |
| `familyHistoryAndStatus.familyHistoryNotes`, `.familyStatusNotes` | Free-text notes | — | ✓ | — | Dropped today; detail. |
| `socialHistory.smokingHistory.smokingTobaccoStatus`, `.tobaccoUse` | Smoking status | — | ✓ | ✓ | Dropped entirely today. One of the first questions in any history. |
| `socialHistory.smokingHistory.smokingTobaccoTypes[]`, `.smokingTobaccoQuitDate` | Smoking detail | — | ✓ | — | Detail behind the status. |
| `socialHistory.smokelessHistory.smokelessTobaccoStatus`, `.smokelessTobaccoTypes[]`, `.smokelessQuitDate` | Smokeless tobacco | — | ✓ | — | Detail. |
| `socialHistory.alcoholHistory.alcoholUse` | Alcohol use | — | ✓ | ✓ | Same standing as smoking status. |
| `socialHistory.alcoholHistory.alcoholAmount`, `.alcoholUnit` | Alcohol amount | — | ✓ | — | Detail. |
| `socialHistory.socialHistoryNotes` | Free-text notes | — | ✓ | — | Detail. |
| `socialHistory.*.show*QuitDate`, `socialHistory.isProxy`, `isShareEverywhere` | Rendering and caller state | — | — | — | UI flag / session context. |
