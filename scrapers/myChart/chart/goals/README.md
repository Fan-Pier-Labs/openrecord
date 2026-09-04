# `goals`

Health goals — the ones the care team set for the patient, and the ones the patient set for
themselves.

| | |
| --- | --- |
| **Capabilities** | `get_goals` (read) |
| **Source** | [`goals.ts`](goals.ts) · [`goals.processor.ts`](goals.processor.ts) |
| **Activity** | React `/app/goals` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/goals` | — | antiforgery token |
| `POST /api/goals/LoadCareTeamGoals` | `{ FullLoad: true }` | goals set by the care team |
| `POST /api/goals/LoadPatientGoals` | `{}` | goals set by the patient |

`FullLoad: true` is the **goals activity's** own request. The bare `{}` is what the
health-summary widget sends for its abbreviated list. Neither list is a superset of the
other by construction, so the activity's request is the one to make.

## Notes and research

- **MyChart returns one patient goal even when the patient has none.** Three of four
  captured accounts — none of which has ever set a goal — answered `LoadPatientGoals` with a
  single element whose every field is blank. It is the empty editable slot the activity
  renders. Epic's own client drops it (`epic.px.client.goals` gates on
  `!isNullOrEmpty(patientGoals[0].text)`, and its `setPatientGoal` reducer deletes an element
  whose `text` is `''`), and so does the processor. Without that drop every patient in the
  product has exactly one nameless goal. This is the single sanctioned exception to
  "membership is by field name, never by value" — see rule 6 in
  [`docs/processor-layer-proposal.md`](../../../../docs/processor-layer-proposal.md).
- **One endpoint failing does not empty the other.** A captured instance answers
  `LoadPatientGoals` with HTTP 500 on *every* request while care-team goals load fine. The
  failed endpoint is named in `unavailable[]` and the other list is still returned. Both
  failing is a failed read and throws.
- Every captured `careTeamGoals` was `[]` and the only captured `patientGoals` element is
  the empty slot, so **both element shapes are uncaptured** and both lists pass through
  whole. fake-mychart's fixture is modelled on the field names Epic's own client bundle
  reads — which is better than invented, but still not a capture.
- Both fixes landed in [#409](https://github.com/Fan-Pier-Labs/openrecord/pull/409) (split
  from [#405](https://github.com/Fan-Pier-Labs/openrecord/pull/405)).

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

## `get_goals`

`POST /api/goals/LoadCareTeamGoals` (with `{ FullLoad: true }`, the goals activity's own
request rather than the health-summary widget's abbreviated one) and
`POST /api/goals/LoadPatientGoals`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `careTeamGoals[]` | Goals set by the care team, whole | — | ✓ | ✓ | Uncaptured (empty on every captured account); passed through whole. |
| `patientGoals[]` | Goals set by the patient, whole | — | ✓ | ✓ | Uncaptured; passed through, minus the empty slot. See the note. |
| `source` | `care_team` or `patient`, on each goal | ✓ | ✓ | ✓ | Derived from which endpoint answered. Who set the goal changes what it means. |
| `unavailable[]` | Endpoints that did not answer | ✓ | ✓ | ✓ | Derived. Non-empty means the matching list is "not known", never "empty". |
| `hasChartGraphSecurity`, `isSharingNotesEnabled`, `quickLinkDictionary.*` | Page config | — | — | — | UI flag / portal link. |

**MyChart returns one patient goal even when the patient has none.** Three of the four
captured accounts, none of which has ever set a health goal, answered `LoadPatientGoals` with
a single element whose every field is blank — `goalId: ""`, `goalType: 0`, `readings: []`. It
is the empty editable slot the activity renders, not a goal: `epic.px.client.goals` decides
whether the patient has any with `patientGoals.length > 0 && !isNullOrEmpty(patientGoals[0].text)`,
and its `setPatientGoal` reducer deletes an element whose `text` is `''`. The processor drops
it the same way; without that, every patient in the product has exactly one nameless goal.

**A failing endpoint is named, not reported as empty.** One captured instance answers
`LoadPatientGoals` with HTTP 500 on every request while care-team goals load fine. That
endpoint goes in `unavailable` and the other list is still returned — "you have set no goals"
is the wrong thing to say about a 500, and losing the care-team half is the wrong thing to do
about it.

**Both element shapes are still uncaptured** and both lists pass through whole (rule 10): every
captured `careTeamGoals` was `[]`, and the only captured `patientGoals` element is the empty
slot. `fake-mychart`'s fixture models them on the field names `epic.px.client.goals` reads —
`title`, `goalId`, `goalType`, `complianceType`, `readings[]`, `createdByUser`, `creationDate`
on a care-team goal, `text` on a patient goal — which is Epic's own client code, not a
capture. Once captured, concise narrows to the goal's text, its type and its latest reading.
