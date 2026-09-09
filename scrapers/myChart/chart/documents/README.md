# `documents`

Clinical documents and visit records filed to the chart — the "Document Center" activity.

| | |
| --- | --- |
| **Capabilities** | `get_documents` (read) · `download_document` (read, returns a file) |
| **Source** | [`documents.ts`](documents.ts) · [`documents.processor.ts`](documents.processor.ts) · [`documentDownload.ts`](documentDownload.ts) |
| **Activity** | React `/app/document-center` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /app/document-center` | — | antiforgery token |
| `POST /api/documents/viewer/LoadOtherDocuments` | `{ isInitialLoad: true \| false }` | one page of the document list |
| `POST /api/documents/viewer/GetDocumentDetails` | `{ dcsId, fileExtension, organizationId, useOldMobileLink: true }` | where one document's file is — `downloadUrl`, `mimeType`, `displayName` |
| `GET <downloadUrl>` | — | the file itself, `/Documents/ViewDocument/DownloadOrStream?dcsid=…&displayName=…&dcsExt=…` |

## Notes and research

- **`isInitialLoad` is the whole endpoint.** The cursor is server-side session
  state — the request never names a page. `true` rewinds it and answers the first
  25 documents; anything else answers the next 25 from wherever the session left
  off, and answers `{"documents":[]}` once the walk is done. So a `{}` body on a
  fresh session asks for the page *after* a walk that never started, and gets a
  200 with an empty list. This scraper sent `{}` until
  [#453](https://github.com/Fan-Pier-Labs/openrecord/pull/453), which is why an
  account with 42 documents read as "no documents on file".
- **25 per page, and a short page is the only end-of-walk signal** — no count,
  no cursor, no `hasMore`. Epic's own page hides its "Load more" button on
  `documents.length < 25`; the scraper stops on the same condition.
- **`dateRaw` is an Epic day number** (`shared/epicDate.ts`), not a timestamp.
  It agreed with the `date` string on all 42 documents of the captured account,
  so `dateISO` is derived from it rather than from parsing `date`.
- **The activity is `/app/document-center`, not `/app/documents`.** The latter is
  not a page on any instance and redirects to Home. That still yields a usable
  token, which is why the old path worked at all, but it costs `RawCollector` its
  "this activity is not served here" signal.
- **`LoadDocumentsToSign` is the page's other list** — documents awaiting the
  patient's signature. It answered `{"documentsToSign":[]}` on the one live
  account, so its element shape has never been observed and nothing scrapes it.
- **`download_document` is the same DCS exchange attachments use.** Epic's own
  row calls `useDcsDocument({ dcsId: doc.dcsID, fileExtension: doc.docExt })` with
  `useOldMobileLink: true` and no `legacyEncryption`, which is what picks
  `GetDocumentDetails` over the `…Legacy` sibling
  [`messages/messageAttachment.ts`](../messages/messageAttachment.ts) uses. Both
  answered identically here — same bytes, same length — differing only in
  `legacyEncryption` and whether the link is `Download` or `DownloadOrStream`.
- **`fileExtension` is ignored, so a download needs no list walk.** Measured five
  ways on one live instance — correct, empty, omitted, wrong, and `dcsId` alone —
  every variant returned the same `mimeType`, the same `displayName` and the same
  135,807-byte PDF. MyChart resolves everything from `dcsId`, so `download_document`
  takes only the id and sends `''`, the portal hook's own default. Walking the
  document list first would have cost up to 40 requests per download for an
  extension the server never reads.
- **Three payload traps on the download, none of them a status code.** An id the
  record does not hold answers **200 with a literal JSON `null`**; a document
  MyChart will not release answers with `downloadUrl` and `token` both empty (1 of
  42, a BMP) and its `previewUrl` then streams **200 with an empty body**; a bogus
  link answers **200 with an empty body and no Content-Type**.
- **`text/html` is a real document type here** — an e-signed document is HTML, 8 of
  42 — so "a web page where the file should be" is only a failure when MyChart
  itself did not say the file was HTML.
- **The file is named from `Content-Disposition`.** It carried
  `attachment; filename="<displayName>.<ext>"` on every download, while
  `displayName` alone had the extension on some documents and not others.
- **The identifiers are long.** `dcsID` measured 85-94 characters, `docID` 82-114,
  `dat` 82-92 — all past the 60-character table-cell limit in
  [`processors/markdown.ts`](../../processors/markdown.ts), which is why concise
  carries none of them and why the fake's fixture uses tokens of the same length
  rather than tidy short ids.

**Verified on 1 live account** (42 documents, `docExt` ∈ {PDF, TIF, JPG, PNG, BMP,
HTML}) end to end, plus the `epic.px.client.document-center` bundle on 5 further
instances, which name `isInitialLoad` and the `< 25` page-end rule identically.
`download_document` was verified on the same account against one document of every
extension: all five downloadable types came back with the right magic bytes
(`%PDF`, `II*\0`, `ÿØÿà`, `\x89PNG`, `<mai`) and the sixth, the BMP, refused.

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

## `download_document`

Not part of the processor layer: `run` returns a `FilePayload` (bytes plus a safe
file name and MIME type), not JSON, so it has no output modes. Each client decides
where the file goes — the MCPB saves it to Downloads, the CLI writes it under
`--output`, the mobile app shows an image inline — by branching on the registry's
`returnsFile` flag, never on the id.

| Field | What it is |
| --- | --- |
| `fileName` | `Content-Disposition`'s name, made safe (`safeFileName`) |
| `mimeType` | `mimeType` from the details call, falling back to the download's `Content-Type` |
| `bytes` | the file |
| `dcsID` | the id that was asked for |
| `displayName` | MyChart's own name for the file, before it was made safe |

## `get_documents`

`POST /api/documents/viewer/LoadOtherDocuments`, once per page. Every page's
`documents` is concatenated and sorted newest first on `dateRaw`, the key Epic's
own page sorts on.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `dcsID` | The handle `GetDocumentDetailsLegacy` takes as `dcsId` to fetch the file | — | ✓ | — | The only way back to the document's bytes, but nothing takes it yet — and at 85-94 characters it is a third of concise and enough on its own to push every row out of table form. Belongs in concise the day a capability accepts it. |
| `docType` | What the Document Center shows as the document's name | — | ✓ | ✓ | The title. |
| `docDesc` | Free-text description; `""` on half the captured documents, and what Epic shows instead of `docType` on a pending or rejected upload | — | ✓ | ✓ | Names the document when `docType` is generic. |
| `docExt` | `PDF`, `TIF`, `JPG`, `PNG`, `BMP` or `HTML` (an e-signed document) | — | ✓ | ✓ | Says what a download would produce, and is the `fileExtension` that exchange needs. |
| `dateISO` | The document's date | ✓ | ✓ | ✓ | Derived from `dateRaw`. The one date form a caller can sort or filter on. |
| `new` | Not yet opened in MyChart | — | ✓ | ✓ | What the patient has not read. |
| `date` · `dateRaw` | MyChart's M/D/YYYY display date, and the Epic day number behind it | — | ✓ | — | Kept whole (rule 1), but `dateISO` is the one worth showing. |
| `docID` · `dat` · `blobCat` | Epic's other identifiers for the document and its blob category | — | ✓ | — | Opaque, and `docID` / `dat` are 82-114 characters; no observed use beyond `dcsID`. |
| `wasESigned` · `isExpired` · `downloadOnly` · `onlyAllowedPreview` · `pendingRequiredSignatures` · `pendingApprovalStatus` · `rejectionReasonFreetext` | Signature, expiry, upload-approval and download-restriction state | — | ✓ | — | All neutral on every captured document, so no per-mode judgement is possible yet; kept in standard rather than dropped for being empty (rule 2). |
