# `careJourneys`

Care journeys and care plans — Epic's longitudinal programmes (pregnancy, oncology,
joint replacement) that group appointments, tasks and education under one plan.

| | |
| --- | --- |
| **Capabilities** | `get_care_journeys` (read, `lessFrequentlyUsed`) |
| **Source** | [`careJourneys.ts`](careJourneys.ts) · [`careJourneys.processor.ts`](careJourneys.processor.ts) |
| **Activity** | React `/app/care-journeys` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/care-journeys` | — | antiforgery token |
| `POST /api/care-journeys/GetCareJourneys` | `{}` | the journeys |

## Notes and research

- **Envelope confirmed, element shape unknown.** No captured account is enrolled in a care
  journey, so every capture returns an empty list. The processor passes elements through
  whole; narrowing them would mean inventing field names.
- Deliberately **not** flagged `unverified`
  ([#405](https://github.com/Fan-Pier-Labs/openrecord/pull/405)) for the same reason as
  `get_allergies`: the envelope is real and elements pass through whole, so the empty
  answer this returns is an honest one.
- Care journeys are per-deployment content. An organization that has configured none serves
  the activity and an empty list — indistinguishable, from the endpoint alone, from a
  patient enrolled in none.

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

## `get_care_journeys`

`POST /api/care-journeys/GetCareJourneys`. No captured skeleton; the field names
the scraper reads are fixture-only.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `careJourneys[]` | One journey each, whole | — | ✓ | ✓ | Uncaptured; passed through. Narrows to name, status and provider once captured. |
