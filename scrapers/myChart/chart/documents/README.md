# `documents`

Clinical documents and visit records filed to the chart — the "Document Center" activity.

| | |
| --- | --- |
| **Capabilities** | `get_documents` (read) |
| **Source** | [`documents.ts`](documents.ts) · [`documents.processor.ts`](documents.processor.ts) |
| **Activity** | React `/app/documents` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/documents` | — | antiforgery token |
| `POST /api/documents/viewer/LoadOtherDocuments` | `{}` | the document list |

`LoadOtherDocuments` is the only endpoint this scraper calls.

## Notes and research

- **No captured skeleton.** The six fields the scraper reads exist only in the fixture, so
  `realShapes.ts` cannot hold this endpoint to a live shape. Elements therefore pass through
  whole, and concise will narrow to title / type / date / provider once a real response is
  captured.
- Deliberately **not** flagged `unverified`
  ([#405](https://github.com/Fan-Pier-Labs/openrecord/pull/405)): passing elements through
  whole means the answer is honest even when the element shape is unknown.
- Downloading a document's bytes is not implemented — no download exchange for this
  activity has been captured.

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

## `get_documents`

`POST /api/documents/viewer/LoadOtherDocuments`. No captured skeleton; the six
fields the scraper reads exist only in the fixture.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `documents[]` | One document per element, whole | — | ✓ | ✓ | Uncaptured; passed through whole. Once captured, concise narrows to title, type, date and provider. |
