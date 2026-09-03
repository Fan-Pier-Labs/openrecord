# `preventiveCare` — what each mode carries

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

## `get_preventive_care`

`GET /HealthAdvisories`, an HTML page. There is no JSON endpoint. Parsing moves
out of the scraper.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `name` | Screening name | ✓ | ✓ | ✓ | Derived from the page. The screening. |
| `status` | `overdue` / `not_due` / `completed` / `unknown` | ✓ | ✓ | ✓ | Derived. The point of the page. |
| `overdueSince`, `notDueUntil`, `completedDate` | The date that goes with the status | ✓ | ✓ | ✓ | Derived. A status without its date is half an answer. |
| `previouslyDone[]` | Prior completion dates | ✓ | ✓ | — | Derived. History; detail. |
| `pageText` | Block-separated text of the advisories section | ✓ | ✓ | — | Derived. Lets a consumer check what the parser saw when a row comes out `unknown`; the parser is heuristic and this is its audit trail. |
