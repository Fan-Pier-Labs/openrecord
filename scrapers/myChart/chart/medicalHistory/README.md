# `medicalHistory`

Past medical history as the patient and clinicians have recorded it: prior diagnoses, past
surgeries, family history, and the social history (tobacco, alcohol).

| | |
| --- | --- |
| **Capabilities** | `get_medical_history` (read) |
| **Source** | [`medicalHistory.ts`](medicalHistory.ts) · [`medicalHistory.processor.ts`](medicalHistory.processor.ts) |
| **Activity** | React `/app/histories` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/histories` | — | antiforgery token |
| `POST /api/histories/LoadHistoriesViewModel` | `{}` | all four histories in one body |

One request returns `medicalHistory`, `surgicalHistory`, `familyHistoryAndStatus` and
`socialHistory` together.

## Notes and research

- **This is history, not the problem list.** Active conditions are `get_health_issues`;
  what is here is what was true before. The two overlap by design in MyChart and are kept
  apart here.
- **The social-history block is part of the answer**, not page furniture: smoking status
  and alcohol use are among the first questions in any clinical history. Status is in
  `concise`, the amounts and quit dates in `standard`.
- Family history is per relative: `relationshipToPatientName` plus `conditions[]`, with
  `statusName` (living / deceased) and, in `standard`, the relative's age — age at diagnosis
  or death is what makes a family history clinically usable.
- The rest of `familyMembers[]` is code-table ids and edit-form state
  (`removeFamilyMember`, `createdOnClient`, `changes[]`), which is the shape of an activity
  the patient can edit rather than a read-only record.

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
