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

Three things about this API return a plausible-looking answer if you get them wrong, so
they are worth knowing before changing anything here.

- **`GetFlowsheets` never carries values.** Its top-level `readings` array is **always
  empty**: it returns flowsheet *definitions* only, and the values come from the second
  endpoint. The id field on a definition is `templateId` / `episodeId` — there is no
  `flowsheetId`.

- **`hasMoreData` cannot be used for paging: MyChart reports it `false` while older
  readings still exist.** The loop instead walks back from the oldest instant each page
  returned, and stops only when a request reaches no further back. Consecutive pages overlap
  on the boundary instant, so readings are de-duplicated.

- **`numReadings` caps distinct reading *instants* (flowsheet columns), not individual
  readings.** At 200 that is roughly 693 readings across 7 vital types — enough to look
  like a full history while silently truncating it. It is 1000 here, with a 100-page bound.

- **A reading's value is in one of two fields, and the other one is present but empty.**
  Pulse and Weight carry the number in `numericValue` beside an **empty** `stringValue`;
  Blood Pressure fills `stringValue` with `"145/95"`. Take the first field that actually
  holds something — `stringValue ?? numericValue` reads the empty string as a value and
  blanks every numeric vital ([#370](https://github.com/Fan-Pier-Labs/openrecord/pull/370)).

- **`numericValue` is Epic's base unit, not the unit the row names.** Verified on one real
  instance (Epic November 2025 release, seven rows): Weight rows carry `units: "6"`,
  `unitsDisplayName: "lbs"` and a `numericValue` in **ounces** (a 150 lb patient arrives as
  `2400`); Height rows carry `units: "7"`, `unitsDisplayName: "ft"` and **inches** (`70`);
  Temperature carries `units: "11"`, `unitsDisplayName: "°F"` and is already °F. Read as-is
  that is a 2400 lb, 70-foot patient. The processor converts `numericValue` into the row's
  `unitsDisplayName` for the derived `value` (`150`, `5' 10"`) and leaves `numericValue`
  untouched. **`kg` / `cm` are not converted**: no metric instance has been captured, so
  whether a metric row keeps the imperial base unit or sends kilograms outright is unknown,
  and the number passes through as sent. The `units` code (`6` lbs, `7` ft, `11` °F here)
  is what a future metric capture should be checked against — the processor keys on the
  display name only because the two were 1:1 on every captured row.

- **`units` / `unitsDisplayName` are present only on rows that have a unit.** Weight, Height,
  Temperature and Blood Pressure (`mmHg`, no `units` code) carry them; Pulse, Respirations
  and the calculated BMI row omit the keys entirely. That is why the generated skeleton in
  `realShapes.ts` lists rows as `{ id, name, rowType, valueType, decimalPlaces }` — it
  records the fields every row has — and why the fixture must set them per row rather than
  the skeleton supplying an empty string to rows real MyChart leaves bare.

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
| `rows[].unitsDisplayName` | Display unit (`lbs`, `ft`, `°F`, `mmHg`); absent on unitless rows | — | ✓ | ✓ | A value without units is not a value. |
| `rows[].units` | Epic's unit code (`6` lbs, `7` ft, `11` °F) | — | — | — | Duplicate of `unitsDisplayName`. |
| `rows[].rowType`, `.valueType`, `.decimalPlaces` | Value formatting | — | ✓ | — | Tells a consumer how to render; detail. |
| `rowGroups[].id`, `.name`, `.rowIds[]` | Which rows belong together (systolic/diastolic) | — | ✓ | — | Structure a consumer needs to pair readings; detail. |
| `readings[].rowId` | Which vital type | — | ✓ | ✓ | Ties the reading to its row. |
| `readings[].instantTakenIso` | When taken, clinic-local, no zone | — | ✓ | ✓ | The date of every reading. |
| `readings[].timeZone` | The zone of `instantTakenIso` | — | ✓ | — | What makes the instant interpretable; dropped today. Concise shows the clinic-local time as MyChart does. |
| `readings[].stringValue`, `.numericValue` | The value; string rows fill one, numeric rows the other. `numericValue` is Epic's base unit (ounces, inches) | — | ✓ | — | Both raw forms kept in standard so nothing is lost. |
| `value` | The reading in the row's `unitsDisplayName`: `stringValue` as is, or `numericValue` converted | ✓ | ✓ | ✓ | Derived from `stringValue` / `numericValue`; the one field a reader looks at. |
| `readings[].isAbnormal` | Flagged abnormal | — | ✓ | ✓ | The one verdict MyChart does give on vitals. Emitted when false (rule 6). |
| `readings[].entryType`, `.documentationSource` | Who recorded it (clinic, patient, device) | — | ✓ | — | Provenance; detail. |
| `readings[].id`, `.fsdId`, `.sourceRowId`, `.line`, `.valueType`, `.units`, `.dataType`, `.decimalPlaces` | Storage ids and formatting | — | — | — | Internal, or duplicate of the row's formatting. |
| `userSettings.*` | Session, device, patient ids | — | — | — | Session context. |

Concise renders per vital type (`flowsheets[].rows[]`): `name`,
`unitsDisplayName`, and three derived fields — `readingCount`, `latestReading`
(`instantTakenIso`, `value`, `isAbnormal`) and `abnormalReadings[]`
(`instantTakenIso`, `value`).
