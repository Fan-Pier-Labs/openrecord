# `vitals` — what each mode carries

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

## `get_vitals`

`POST /api/track-my-health/GetFlowsheets`, then per flowsheet one or more
`POST /api/track-my-health/GetFlowsheetReadings` pages. Regrouping readings by
row and de-duplicating page overlaps become processor work; paging stays in the
scraper.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `flowsheets[].name` | Episode name ("Blood pressure monitoring") | — | ✓ | ✓ | What the readings are for. |
| `flowsheets[].status`, `.startDateIso`, `.endDateIso`, `.instructions` | Episode state and care instructions | — | ✓ | — | The instructions are care instructions; detail. |
| `flowsheets[].episodeId`, `.templateId`, `.entryType`, `.entryMode`, `.hasEpisodeData` | Episode plumbing | — | — | — | Internal. |
| `flowsheets[].hasMoreData` | Paging hint | — | — | — | Always wrong: false while older readings exist (scraper comment). |
| `rows[].id` | Row (vital type) id | — | ✓ | — | Internal handle that ties readings to rows; concise groups by name instead. |
| `rows[].name` | Vital type ("Weight", "Pulse") | — | ✓ | ✓ | The measurement. |
| `rows[].unitsDisplayName` | Units | — | ✓ | ✓ | A value without units is not a value. |
| `rows[].rowType`, `.valueType`, `.decimalPlaces` | Value formatting | — | ✓ | — | Tells a consumer how to render; detail. |
| `rowGroups[].id`, `.name`, `.rowIds[]` | Which rows belong together (systolic/diastolic) | — | ✓ | — | Structure a consumer needs to pair readings; detail. |
| `readings[].rowId` | Which vital type | — | ✓ | ✓ | Ties the reading to its row. |
| `readings[].instantTakenIso` | When taken, clinic-local, no zone | — | ✓ | ✓ | The date of every reading. |
| `readings[].timeZone` | The zone of `instantTakenIso` | — | ✓ | — | What makes the instant interpretable; dropped today. Concise shows the clinic-local time as MyChart does. |
| `readings[].stringValue`, `.numericValue` | The value; string rows fill one, numeric rows the other | — | ✓ | — | Both raw forms kept in standard so nothing is lost. |
| `value` | First non-empty of the two, as a string | ✓ | ✓ | ✓ | Derived from `stringValue` / `numericValue`; the one field a reader looks at. |
| `readings[].isAbnormal` | Flagged abnormal | — | ✓ | ✓ | The one verdict MyChart does give on vitals. Emitted when false (rule 6). |
| `readings[].entryType`, `.documentationSource` | Who recorded it (clinic, patient, device) | — | ✓ | — | Provenance; detail. |
| `readings[].id`, `.fsdId`, `.sourceRowId`, `.line`, `.valueType`, `.dataType`, `.decimalPlaces` | Storage ids and formatting | — | — | — | Internal, or duplicate of the row's formatting. |
| `userSettings.*` | Session, device, patient ids | — | — | — | Session context. |

Concise renders per vital type (`flowsheets[].rows[]`): `name`,
`unitsDisplayName`, and three derived fields — `readingCount`, `latestReading`
(`instantTakenIso`, `value`, `isAbnormal`) and `abnormalReadings[]`
(`instantTakenIso`, `value`).
