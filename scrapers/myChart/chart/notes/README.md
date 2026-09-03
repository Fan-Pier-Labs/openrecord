# `notes` — what each mode carries

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
