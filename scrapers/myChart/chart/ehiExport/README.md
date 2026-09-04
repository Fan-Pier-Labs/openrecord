# `ehiExport`

The Electronic Health Information export templates an instance offers — the
21st Century Cures Act "export your whole record" surface.

| | |
| --- | --- |
| **Capabilities** | `get_ehi_export` (read, `lessFrequentlyUsed`) |
| **Source** | [`ehiExport.ts`](ehiExport.ts) · [`ehiExport.processor.ts`](ehiExport.processor.ts) |
| **Activity** | React `/app/release-of-information` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/release-of-information` | — | antiforgery token |
| `POST /api/release-of-information/GetEHIETemplates` | `{}` | the templates on offer |

## Notes and research

- **This lists what can be requested; it does not request anything.** Submitting an export
  is a write, it generates a package a human has to collect, and the request endpoint is
  deliberately not implemented. Reading the catalogue is safe and answers the question
  patients actually ask — *does this hospital offer a full export at all?*
- Coverage is uneven per deployment: an instance that has not configured the activity
  serves it and returns an empty template list.
- The templates are the closest thing MyChart has to a "download everything" button, which
  is why the capability exists at all despite returning no clinical data itself.

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

## `get_ehi_export`

`POST /api/release-of-information/GetEHIETemplates`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `ehieTemplates[].name`, `.description` | Export template | — | ✓ | ✓ | What can be exported. |
| `ehieTemplates[].id` | Template id | — | ✓ | — | Identifier a future export capability would take. |
| `existingEHIE`, `isNoBuildEhie` | Whether an export exists / is offered | — | ✓ | — | Detail. |
| `ehieTemplates[].hideAdditionalComments` | Form config | — | — | — | UI flag. |
| `__Status`, `__UpdateableSettings.*` | Throttle and queue settings of the server itself | — | — | — | Internal. |
