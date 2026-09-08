# `questionnaires`

Questionnaires and health assessments assigned to the patient — the ones waiting to be
filled in, the optional ones on offer, and the completed ones.

| | |
| --- | --- |
| **Capabilities** | `get_questionnaires` (read, `lessFrequentlyUsed`) |
| **Source** | [`questionnaires.ts`](questionnaires.ts) · [`questionnaires.processor.ts`](questionnaires.processor.ts) |
| **Activity** | React `/app/questionnaires` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/questionnaires` | — | antiforgery token (302s to the activity, which carries it) |
| `POST /api/questionnaire/GetQuestionnaireList` | `{}` | the four lists |

Epic's own client posts this route no request data at all
(`makeRequest({path: "/api/questionnaire/GetQuestionnaireList"})`), so the body is `{}`.

## Notes and research

**The legacy activity is dead; this scraper moved to the React one.** It used to call
`GET /Questionnaire` → `POST /Questionnaire/GetQuestionnaireList`.

- `GET /Questionnaire` answers with Epic's `/Home/Error?code=15` page on **4 of 4 real
  accounts** — three on the November 2025 web build, one on August 2025. Since that fetch
  is what carries the antiforgery token, the whole capability failed there rather than
  returning anything.
- `GET /app/questionnaires` → `POST /api/questionnaire/GetQuestionnaireList` answers
  **HTTP 200 with JSON on the same 4 of 4**.
- **A 404 page here still carries an antiforgery token.** So a token fetch succeeding is
  not evidence the activity exists, and a reader that trusts it parses an error page's
  markup into an empty list. The collector's error-page detection is what catches it now.

**The response is four lists, not one.** `assignedQuestionnaires` were given to the patient
to fill in and carry a `dueDateISO`; `optionalQuestionnaires` are offered and never due;
`questionnaireContextLists` regroups assigned entries by what assigned them (an
appointment, a care journey, a letter), each under its own `listContext`; and
`completedQuestionnaires` are done. They stay apart under MyChart's own names, because
"due" and "you may fill this in if you like" are different answers.

**`completedQuestionnaires` was `[]` on all four captures**, so no element of it has ever
been seen. Its elements pass through whole (rule 10) until one is.

**Open question — the May 2026 web build.** Anonymous bundle analysis across 16 hosts on
five web builds (May 2025, August 2025, November 2025, February 2026, May 2026) found
`/api/questionnaire/*` named in `epic.px.client.questionnaires.js` on every build through
February 2026. The May 2026 build moved that client into a shared chunk — still reachable
through `getQuestionnaireList` — and its UI destructures a
`questionnaireLists.assignedQuestionnaireGroups[].assignedQuestionnaireEntries[]` wrapper
that the four captures do not have. **No May 2026 instance has been probed with a real
account**, so that wrapper is unverified and is deliberately not modelled here or in
fake-mychart. If a May 2026 capture shows it, the processor reads the wrapper too; until
then, guessing at it would be rule 10 in reverse.

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

`POST /api/questionnaire/GetQuestionnaireList`. Skeleton:
`fake-mychart/src/data/realShapes.ts` → `getQuestionnaireList`.

### Top level

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `assignedQuestionnaires[]` | Given to the patient to fill in | — | ✓ | ✓ | The answer. Fields below. |
| `optionalQuestionnaires[]` | Offered, never due | — | ✓ | ✓ | The answer. Fields below. |
| `questionnaireContextLists[]` | Assigned entries regrouped by what assigned them | — | ✓ | ✓ | Says which appointment or journey each set belongs to. Fields below. |
| `completedQuestionnaires[]` | Already filled in, whole | — | ✓ | ✓ | Uncaptured element (`[]` on all four); passed through. |
| `showSeriesText`, `showBackButton`, `showPretext`, `messageQnrExpired` | Which text and buttons the activity renders | — | — | — | UI flag. |
| `callingApp`, `sourceActivity` | Which app and activity opened the list | — | — | — | Session context. |

### An `assignedQuestionnaires[]` entry (and each one inside `questionnaireContextLists[]`)

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `questionnaire.id`, `questionnaire.name` | Which questionnaire | — | ✓ | ✓ | What it is, and the handle for it. |
| `questionnaire.status` | Epic's status enum | — | ✓ | ✓ | Whether it still needs doing. |
| `dueDateISO` | When it is due | — | ✓ | ✓ | When. Already an explicit instant — no local formatting (rule 8). |
| `displayNameOverride` | The name the activity shows instead of `name`, when set | — | ✓ | ✓ | It is the name the patient sees. |
| `apptDateISO` | The appointment it was assigned for | — | ✓ | — | Detail. |
| `isHistory` | A history questionnaire rather than a one-off | — | ✓ | — | Detail. |
| `isTravelScreening` | A travel-screening questionnaire | — | ✓ | — | Detail. |
| `questionnaire.rootName`, `questionnaire.type`, `questionnaire.filterType`, `questionnaire.isContextSpecific` | Epic's own naming and typing of it | — | ✓ | — | Detail. |
| `questionnaire.preText`, `questionnaire.postText`, `questionnaire.isPreTextSmartText`, `questionnaire.isPostTextSmartText` | Instructions shown before and after, and whether each is SmartText | — | ✓ | — | Addressed to the patient; detail. |
| `seriesData` | Series name, past responses, surgery data, assigning encounter — whole | — | ✓ | — | Captured, but nothing on it answers "what / when"; kept whole rather than narrowed on one capture set. |
| `hxData` | Which history activity assigned it — whole | — | ✓ | — | Same. |
| `context` | What it hangs off: `contextType`, `contextIdentifier`, `extraContextInfo` — whole | — | ✓ | — | Says whether an appointment, a care journey or a letter assigned it. Dropping it would need evidence (rule 4). |
| `isProxyAccessing` | Whether the caller is a proxy | — | — | — | Session context. |

### An `optionalQuestionnaires[]` entry

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `questionnaire.id`, `questionnaire.name` | Which questionnaire | — | ✓ | ✓ | What it is, and the handle for it. |
| `questionnaire.status` | Epic's status enum | — | ✓ | ✓ | Whether it has been started. |
| `description` | What it is for, in Epic's words | — | ✓ | ✓ | Why a patient would fill it in. There is no due date here. |
| `questionnaire.rootName`, `questionnaire.type`, `questionnaire.isContextSpecific`, `questionnaire.preText`, `questionnaire.postText`, `questionnaire.isPreTextSmartText`, `questionnaire.isPostTextSmartText` | Epic's naming, typing and instructions | — | ✓ | — | Detail. An optional entry's `questionnaire` has no `filterType`. |
| `context` | What it hangs off — whole | — | ✓ | — | As above. |
| `disablePastResponse` | Whether the "view past responses" control renders | — | — | — | UI flag. |

### A `questionnaireContextLists[]` entry

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `assignedQuestionnaires[]` | The entries in this context, projected exactly as above | — | ✓ | ✓ | The answer. |
| `listContext` | What the group hangs off — whole | — | ✓ | — | Which appointment or journey this set belongs to. |
| `index` | The order the activity renders the groups in | — | — | — | UI flag. |
