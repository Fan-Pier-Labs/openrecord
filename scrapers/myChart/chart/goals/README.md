# `goals` — what each mode carries

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

## `get_goals`

`POST /api/goals/LoadCareTeamGoals` and `POST /api/goals/LoadPatientGoals`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `careTeamGoals[]` | Goals set by the care team, whole | — | ✓ | ✓ | Uncaptured (empty on every captured account); passed through whole. |
| `patientGoals[]` | Goals set by the patient, whole | — | ✓ | ✓ | Uncaptured; passed through. See the note. |
| `source` | `care_team` or `patient`, on each goal | ✓ | ✓ | ✓ | Derived from which endpoint answered. Who set the goal changes what it means. |
| `hasChartGraphSecurity`, `isSharingNotesEnabled`, `quickLinkDictionary.*` | Page config | — | — | — | UI flag / portal link. |

**The patient-goal shape is unverified and probably wrong.** The captured
`loadPatientGoals` element has `goalId`, `goalType`, `readings[]`,
`complianceType`, `lastUpdatedDate`, `creationDate`. It has no `name`,
`description`, `status`, `startDate` or `targetDate`; those five exist only in
the fixture, which `conformToShape` serves alongside the real keys. Against a
real instance with patient goals, today's scraper returns five empty strings per
goal. Once captured, concise narrows to name, status and target date, whatever
those are called.
