# `insurance` — what each mode carries

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

## `get_insurance`

`GET /Insurance`, HTML. Parsing moves out of the scraper.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `planName` | Plan | ✓ | ✓ | ✓ | Derived from the page. The coverage. |
| `subscriberName` | Subscriber | ✓ | ✓ | — | Derived. Detail. |
| `memberId`, `groupNumber` | Member and group | ✓ | ✓ | ✓ | Derived. What a clinic asks for. |
| `details[]` | Other lines on the card | ✓ | ✓ | — | Derived. Whatever else the page printed. |
| `hasCoverages` | Page did not say "no coverages" | ✓ | ✓ | ✓ | Derived. "No coverage on file" is an answer. |
| `pageText` | Block-separated text of the page | ✓ | ✓ | — | Derived. The parser's selectors are unverified against a real instance (see below); this is the audit trail. |

The selectors the scraper uses (`.coverage-card`, `.plan-name`, `.member-id`)
match the fake's page and nothing captured from a real instance; the captured
account had no coverage on file and every `/api/insurance-hub/*` endpoint
answered 500 (`api-surface-gaps.md` §2d). `raw` mode carries the page for anyone
checking the parser until a coverage page is captured.
