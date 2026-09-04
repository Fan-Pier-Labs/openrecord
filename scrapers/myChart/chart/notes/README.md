# `notes`

Clinical notes attached to a past visit, the text of any one of them, and the After Visit
Summary.

| | |
| --- | --- |
| **Capabilities** | `get_visit_notes` (read) · `get_note_content` (read) · `get_visit_avs` (read) |
| **Source** | [`notes.ts`](notes.ts) · [`notes.processor.ts`](notes.processor.ts) |
| **Activity** | Legacy `/Visits/VisitsList` (for the token) |

Every call here is keyed on a **CSN** — Epic's contact serial number for an encounter —
which comes from [`../visits/`](../visits/).

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Visits/VisitsList?noCache=<random>` | — | antiforgery token |
| `POST /api/visit-notes/GetVisitNotes` | `{ CSN, FromPvdPage: true }` | the notes on that visit |
| `POST /api/report-content/LoadReportContent` | `{ reportMnemonic: 'OPEN_NOTES', reportID: lrpId, contextID: hnoId, contextDAT: hnoDat, contextINI: 'HNO', csn, … }` | one note's text |
| `POST /api/report-content/LoadReportContent` | `{ reportMnemonic: 'AMB_AVS', reportID: '', csn, … }` | the After Visit Summary |

`LoadReportContent` is a **general report renderer**, dispatched by `reportMnemonic`. The
lab scraper calls the same endpoint with a report id for result reports. `lrpId` is shared
by every note of a visit; `hnoId`/`hnoDat` identify the note within it.

## Notes and research

- **An unknown CSN answers `200` with a literal JSON `null`**, not a 404 — as
  `GetLetterDetails` and `GetConversationDetails` also do. The `null` is passed through in
  every mode rather than being read as a visit with no notes.
- **`requireJsonBody` lives here and is shared with the visits scraper.** Some deployments
  sit behind an F5 Volterra WAF that answers a rejected request shape with **HTTP 200 and a
  `text/html` "Request Rejected" body**. Without the check, the caller finds an HTML string
  where JSON was expected and the most likely reading is an empty chart. The check names the
  WAF explicitly and distinguishes it from a probably-expired session.
- The token header on these calls is the **lower-case** `__requestverificationtoken`.
- Note content is an HTML fragment. Markup stays in `raw`; `reportContentText` is derived
  beside it. A note has no shorter faithful form — a model may summarize one, a processor
  must not — so `concise` carries the whole text.
- Shipped in [#154](https://github.com/Fan-Pier-Labs/openrecord/pull/154), with fixtures in
  [#164](https://github.com/Fan-Pier-Labs/openrecord/pull/164).

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

## `get_visit_notes`

`POST /api/visit-notes/GetVisitNotes` `{ CSN, FromPvdPage }`. An unknown CSN
answers a literal JSON `null`, passed through in every mode (rule 7).

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `csn` | Echo of the input | ✓ | ✓ | ✓ | Derived. The result names the visit it belongs to. |
| `lrpID` | Report id shared by every note of the visit | — | ✓ | ✓ | Handle: `get_note_content` takes it. |
| `depPhoneNumber` | Department phone | — | ✓ | — | Real; detail. |
| `isAtLeastOneNoteSensitive` | Any note is marked sensitive | — | ✓ | — | Detail. |
| `noteList[].hnoID`, `.hnoDAT` | Note id and date key | — | ✓ | ✓ | Handle: `get_note_content` takes both. A listing whose only purpose is choosing a note to open must carry what opening it needs. |
| `noteList[].displayName` | Note type ("Progress Notes", "Discharge Summary") | — | ✓ | ✓ | What the note is. |
| `noteList[].iso` | Note timestamp | — | ✓ | ✓ | When. |
| `noteList[].provider.name` | Author | — | ✓ | ✓ | Who. |
| `noteList[].provider.magicID` | Author id | — | ✓ | — | Identifier; detail. |
| `noteList[].isAddendum`, `.isNoteSensitive` | Note flags | — | ✓ | — | Detail. |
| `noteList[].attachments[]` | Attachments | — | ✓ | — | Uncaptured; passed through. |
| `noteList[].provider.hasPhotoOnBlob` | Photo flag | — | — | — | Asset. |

Today's scraper renames `hnoID` → `hnoId`, `hnoDAT` → `hnoDat`, `lrpID` →
`lrpId`. Under rule 2 the standard object keeps MyChart's spelling; the
`get_note_content` parameter names are our API and can stay as they are.

---

## `get_note_content` and `get_visit_avs`

`POST /api/report-content/LoadReportContent` with `reportMnemonic: 'OPEN_NOTES'`
(note) or `'AMB_AVS'` (after-visit summary). `reportContent` is an HTML
fragment.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `reportContent` | The note or summary, as HTML | — | — | — | Markup stays in `raw` (rule 9). |
| `reportContentText` | Plain text of the note | ✓ | ✓ | ✓ | Derived from `reportContent`. A note has no shorter faithful form; a model can summarize it, a processor must not. |
| `reportCss`, `baseFontSize`, `stylesheets[]` | Styling | — | — | — | Asset. |
