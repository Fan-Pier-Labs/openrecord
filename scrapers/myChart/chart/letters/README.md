# `letters`

Letters written to the patient by a provider — work notes, referral letters, results
letters — and the full text of any one of them.

| | |
| --- | --- |
| **Capabilities** | `get_letters` (read, `lessFrequentlyUsed`) · `get_letter_details` (read, `lessFrequentlyUsed`) |
| **Source** | [`letters.ts`](letters.ts) · [`letters.processor.ts`](letters.processor.ts) |
| **Activity** | React `/app/letters` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/letters` | — | antiforgery token |
| `POST /api/letters/GetLettersList` | `{}` | the list |
| `POST /api/letters/GetLetterDetails` | `{ hnoId, csn }` | one letter's body |

## Notes and research

- **`GetLetterDetails` needs both ids.** `hnoId` identifies the note and `csn` the encounter
  it belongs to; sending only one does not return the letter. `get_letters` therefore emits
  both on every row, and they are the handle `get_letter_details` takes.
- **An unknown id answers `200` with a literal JSON `null`**, not a 404 — the same
  behaviour `GetVisitNotes` and `GetConversationDetails` have. `if (!response.ok) throw` is
  not enough on this API: a `null` read as an object becomes an empty letter. The processor
  passes the `null` through as `null`.
- The letter body arrives as HTML (`bodyHTML`). Markup stays in `raw`; the readable
  `bodyHTMLText` is derived beside it, the same treatment message bodies and visit notes get.
- Author names are not on the letter — `empId` is a key into a `users` directory in the same
  response, which the processor resolves into `providerName`.
- The list is sorted newest-first, with unparseable dates last
  ([#156](https://github.com/Fan-Pier-Labs/openrecord/pull/156)); `dateISO` can be blank.

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

## `get_letters`

`POST /api/letters/GetLettersList`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `letters[].hnoId`, `.csn` | Letter and visit ids | — | ✓ | ✓ | Handle: `get_letter_details` takes both. |
| `letters[].dateISO` | Letter date; may be blank | — | ✓ | ✓ | When. |
| `letters[].reason` | Subject | — | ✓ | ✓ | What. |
| `letters[].viewed` | Read state | — | ✓ | ✓ | Unread letters are the ones a reader wants first. |
| `letters[].empId` | Author id, key into `users` | — | ✓ | — | Kept so the name resolution is checkable; detail. |
| `providerName` | `users[empId].name` resolved onto the letter | ✓ | ✓ | ✓ | Derived. Who wrote it. |
| `users{}` | Author directory (`empId`, `name`, `photoUrl`) | — | — | — | Resolved into `providerName`; `photoUrl` is an asset. |
| `departments{}` | Department directory; empty on capture | — | ✓ | — | Uncaptured; passed through. |

The list is sorted newest first with unparseable dates last (today's scraper
behavior, now processor behavior).

---

## `get_letter_details`

`POST /api/letters/GetLetterDetails` `{ hnoId, csn }`. Literal `null` for an
unknown id, passed through.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `bodyHTML` | The letter, as HTML | — | — | — | Markup stays in `raw` (rule 9). |
| `bodyHTMLText` | Plain text | ✓ | ✓ | ✓ | Derived from `bodyHTML`. The letter, readable. |
