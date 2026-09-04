# `vitals`

Track My Health flowsheets — blood pressure, weight, pulse and anything else the care team
or the patient records over time.

| | |
| --- | --- |
| **Capabilities** | `get_vitals` (read) |
| **Source** | [`vitals.ts`](vitals.ts) · [`vitals.processor.ts`](vitals.processor.ts) |
| **Activity** | React `/app/track-my-health` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/track-my-health` | — | antiforgery token |
| `POST /api/track-my-health/GetFlowsheets` | `{ organizationId: '' }` | flowsheet **definitions** — episode ids and row metadata, no values |
| `POST /api/track-my-health/GetFlowsheetReadings` | `{ episodeId, endInstantIso, numReadings }` | the readings for one episode, one page |

## Notes and research

This scraper has been wrong in three different ways, each of which returned a plausible
answer. They are worth reading before changing it.

- **1. It only called `GetFlowsheets`, whose `readings` array is always empty.**
  That endpoint returns *definitions* only. The values come from `GetFlowsheetReadings`,
  which was never called; the scraper also read a `flowsheetId` field that does not exist
  (the id is `templateId`/`episodeId`), so even the metadata came back empty. Fixed in
  [#207](https://github.com/Fan-Pier-Labs/openrecord/pull/207), which ported
  [#201](https://github.com/Fan-Pier-Labs/openrecord/pull/201).

- **2. Paging must not key off `hasMoreData`.** MyChart reports it **false while older
  readings still exist**. The loop instead walks back from the oldest instant each page
  returned and stops only when a request reaches no further back. Consecutive pages overlap
  on the boundary instant, so readings are de-duplicated. Related:
  **`numReadings` caps distinct reading *instants* (flowsheet columns), not individual
  readings** — at 200 that silently truncated history to the most recent 200 instants,
  about 693 readings across 7 vital types, which looked like plenty and hid the cap for
  months. Now 1000, with a 100-page safety bound.

- **3. `??` blanked every numeric reading.** The parser read
  `r.stringValue ?? (r.numericValue != null ? String(r.numericValue) : '')`. `??` falls
  through only on `null`/`undefined`, and Pulse and Weight arrive with the number in
  `numericValue` and an **empty** `stringValue` — so the empty string won. Only Blood
  Pressure, which fills `stringValue` with `"145/95"`, ever worked. The fix takes the first
  field that actually holds something ([#370](https://github.com/Fan-Pier-Labs/openrecord/pull/370)).
  Both tests missed it: the unit test's numeric reading had no `stringValue` key at all —
  the one arrangement that never triggers the bug — and the integration test asserted only
  `result.length > 0`, which stayed true the whole time every value was blank.

- **`units` is still unverified.** `unitsDisplayName` appears in **no captured skeleton**:
  `realShapes.ts`, generated from three real instances, records flowsheet rows as
  `{ id, name, rowType, valueType, decimalPlaces }`. The fixture's `'mmHg'`/`'lbs'` are
  curated, not observed, so if real rows carry no units field then every vital OpenRecord
  returns is unitless on a real instance while the fake makes units look fine — the fidelity
  contract running backwards. The likeliest explanation is that the captured flowsheet held
  only Blood Pressure. `dev-scripts/probe-flowsheet-shape.ts` settles it against a real
  account ([#381](https://github.com/Fan-Pier-Labs/openrecord/pull/381)); it reports field
  names and presence only, never a reading's value or date.

- `instantTakenIso` is **clinic-local with no zone suffix**; `timeZone` beside it is what
  makes it interpretable.
- `isAbnormal` is the one verdict MyChart does give on a vital — unlike labs, where the
  abnormal flag is always `"Unknown"` (see [`../labs/`](../labs/)).

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
