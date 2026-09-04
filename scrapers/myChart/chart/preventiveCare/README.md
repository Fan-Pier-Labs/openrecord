# `preventiveCare`

Health maintenance — the screenings and vaccines that are due, overdue or done: Epic's
"Health Advisories".

| | |
| --- | --- |
| **Capabilities** | `get_preventive_care` (read) |
| **Source** | [`preventiveCare.ts`](preventiveCare.ts) · [`preventiveCare.processor.ts`](preventiveCare.processor.ts) |
| **Activity** | Legacy `/HealthAdvisories` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /HealthAdvisories` | — | the page |

**There is no JSON endpoint.** This is the only chart scraper whose payload is HTML and
nothing else; everything it returns is parsed out of the page, which is why every field in
the mode table is marked derived.

## Notes and research

- **Parse rows, not text.** The original parser flattened the page with `$('body').text()`
  and paired adjacent lines. Block-level elements contribute no whitespace to `.text()`, so
  the whole results table collapsed onto one line, the page heading matched
  `/Overdue since (.+)/`, and the capability emitted a **synthetic first record** whose date
  fields were three unrelated screenings run together
  ([#374](https://github.com/Fan-Pier-Labs/openrecord/pull/374)):

  ```json
  { "name": "Preventive Care", "status": "completed",
    "overdueSince": "01/01/2024Influenza VaccineDueNot due until 10/01/2026Lipid Panel…" }
  ```

  One `<tr>` is now one screening, and a row with no status anywhere is skipped — which also
  keeps unrelated tables on the page out of the results.
- **The text fallback still exists**, for instances that render advisories as flowing text
  rather than a table. It inserts newlines at block boundaries before splitting, and rejects
  column headers, status badges, `Previously done:` lines and bare dates as screening names,
  so it cannot invent a record out of page chrome either.
- `pageText` is the parser's audit trail. The parser is heuristic; when a row comes back
  `unknown`, `pageText` is what lets a caller see what it was looking at.
- fake-mychart used to carry a hidden newline-separated `healthAdvisories` div "for scraper
  compat". It was an accommodation for the broken parser, not something real MyChart emits,
  and it is gone — the visible table is the contract.

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
