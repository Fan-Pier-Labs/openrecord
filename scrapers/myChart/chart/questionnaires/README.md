# `questionnaires`

Questionnaires and health assessments assigned to the patient — open ones waiting to be
filled in, and completed ones.

| | |
| --- | --- |
| **Capabilities** | `get_questionnaires` (read, `lessFrequentlyUsed`) |
| **Source** | [`questionnaires.ts`](questionnaires.ts) · [`questionnaires.processor.ts`](questionnaires.processor.ts) |
| **Activity** | Legacy jQuery `/Questionnaire` (see below — this is probably the wrong endpoint) |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Questionnaire` | — | antiforgery token |
| `POST /Questionnaire/GetQuestionnaireList` | `{}` | the list |

## Notes and research

**The endpoint this scraper calls is probably the wrong one.** This is the open question on
this scraper, and it is well evidenced:

- Against four live accounts, the legacy endpoint above has never returned a questionnaire:
  three instances serve the legacy activity and answer with an empty list, and the fourth
  answers `/Questionnaire` with HTTP 500
  ([#405](https://github.com/Fan-Pier-Labs/openrecord/pull/405)).
- The React sibling, `POST /api/questionnaire/GetQuestionnaireList`, **answered 200 with
  populated lists on all three instances probed for
  [#410](https://github.com/Fan-Pier-Labs/openrecord/pull/410)** — one with an assigned
  questionnaire and a context list, another with five optional ones — with known element
  keys. That is a fix waiting to be made, not a gap to document; it is filed as the next
  piece of work on this capability.
- A related trap was closed on the way: the scraper used to read the **404 page's markup**
  as an empty list. That page carries an antiforgery token, so the exchange looked
  successful and the body was merely HTML.

Until that fix lands, elements pass through whole — no capture pins the legacy element's
shape, so narrowing it would mean inventing field names.

Do not confuse this with the **anonymous scheduling questionnaire gate** in
[`../../prelogin/`](../../prelogin/), which is a pre-login booking obstacle rather than a
chart record.

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

## `get_questionnaires`

`POST /Questionnaire/GetQuestionnaireList`. No captured skeleton; the field names
the scraper reads are fixture-only.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `questionnaires[]` | One questionnaire each, whole | — | ✓ | ✓ | Uncaptured; passed through. Narrows to name, status and due date once captured. |

See the research above: the React sibling `/api/questionnaire/GetQuestionnaireList`
returns real data on every probed account, so this endpoint is expected to change.
