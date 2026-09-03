# `careJourneys` — what each mode carries

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

## `get_questionnaires` and `get_care_journeys`

`POST /Questionnaire/GetQuestionnaireList` and
`POST /api/care-journeys/GetCareJourneys`. Neither has a captured skeleton; the
field names the scrapers read are fixture-only.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `questionnaires[]` | One questionnaire each, whole | — | ✓ | ✓ | Uncaptured; passed through. Narrows to name, status and due date once captured. |
| `careJourneys[]` | One journey each, whole | — | ✓ | ✓ | Uncaptured; passed through. Narrows to name, status and provider once captured. |

`api-surface-gaps.md` lists a React-era `/api/questionnaire/GetQuestionnaireList`
that returns real data on the probed account, so the endpoint itself may change.
