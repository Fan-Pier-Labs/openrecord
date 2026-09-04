# `eunity` — downloading the actual pictures

MyChart hands imaging off to **eUnity** (by Client Outlook), a separate DICOM viewer on its
own host, reached through a SAML chain. eUnity speaks a proprietary binary protocol — raw
AMF3 over two servlets — and returns pixels in a proprietary compressed format. This package
gets the bytes; [`../clo-image-parser/`](../clo-image-parser/) turns them into images.

| | |
| --- | --- |
| **Capabilities** | `download_imaging_study` (read, media) — the discovery half is [`../chart/labs/`](../chart/labs/) |
| **Source** | [`imagingViewer.ts`](imagingViewer.ts) (FDI context, SAML chain) · [`imagingDirectDownload.ts`](imagingDirectDownload.ts) (AMF session, downloads) · [`amf3Reader.ts`](amf3Reader.ts) (strict AMF3 decoder) |
| **Protocol reference** | [`docs/EUNITY_PROTOCOL.md`](docs/EUNITY_PROTOCOL.md) — the byte-level notes |

The AMF3 **writer** is [`shared/amf3Writer.ts`](../../../shared/amf3Writer.ts), shared with
fake-mychart, so a request frame and the fake's answer are built by one encoder.

**No browser is involved.** The pipeline is pure HTTP.

## The pipeline

| # | Step | Where |
| --- | --- | --- |
| 1 | `POST /api/report-content/LoadReportContent` — the report HTML | MyChart |
| 2 | Extract `data-fdi-context` (`{fdi, ord}`), or parse `fdiLink.redirectUrl` | — |
| 3 | `GET /Home/CSRFToken` | MyChart |
| 4 | `POST /Extensibility/Redirection/FdiData?fdi=…&ord=…` → `{url: "https://<sts>/…"}` | MyChart |
| 5 | Follow the SAML chain: STS → redirect endpoint → `selfauth` → the eUnity server | eUnity |
| 6 | `POST /e/AmfServicesServlet` — `StudyService.getStudyListMeta` | eUnity |
| 7 | `POST /e/CustomImageServlet` — pixel data, per instance | eUnity |
| 8 | Sort the slices anatomically, decode, encode | local |

Step 5 yields a `CLOAccessKeyID` in the URL and a `JSESSIONID` cookie.

## The things that bite

- **`getStudyListMeta` is mandatory.** Without it `CustomImageServlet` answers **403**. The
  AMF call is what initializes the server-side study session, not just a metadata read.
- **AMF3 member names and order are exact.** `AmfServicesMessage`'s sealed members are
  `messageID`, `messageType`, `body` — **in that order** — and `AmfServicesRequest`'s are
  `service`, `method`, **`parameters`** (not `args`; `args` returns `code=1`). The parameter
  is a `StudyListRequest` **Externalizable** object, not a string array. Verified by
  byte-for-byte comparison against captured browser traffic.
- **`patientId` is `<MRN>$$$<SITE>`** — three dollar signs.
- **CT scans need a second AMF call.** Some studies live under a different
  `serviceInstance` than the one the viewer URL carries. The browser does a **two-phase
  init**: call once with the viewer's value, read the *real* `serviceInstance` out of the
  response, then call again with it and use it for every `CustomImageServlet` request.
  Skipping phase two is why CT returned 403 while X-rays worked.
- **`image/CLJPEG` is not served** — the server answers `CLOERROR`. Only CLHAAR and CLWAVE
  work. The browser nonetheless *offers* `image/CLWAVE;image/CLHAAR;image/CLJPEG` in its
  `contentType`, and so does this scraper.
- **`CLOAccessKeyID` tokens are single-use and SAML URLs expire in one to two minutes.**
  Treat the URL like a credential; it is dead by the time anyone reads it out of a log.
- **`node-fetch` fails the SAML `selfauth` hop** on TLS fingerprinting. Use
  `globalThis.fetch` (undici) — which is what [`scrapers/http.ts`](../../http.ts) does.
- **The SAML chain includes a JavaScript redirect** at the `redirecttoviewer` page, not an
  HTTP 302.
- **Not every instance exposes images at all.** Some health systems serve reports only.

## Getting the UIDs right

**Every image has its own series UID.** The AMF parse may report several instance UIDs under
what looks like one series, but the viewer treats each `(seriesUID, objectUID)` pair as a
separate image request: a network capture shows three `CLOWRAPPER` requests with three
**different** series UIDs, each with `frameNumber=1`, and asking for the same series UID with
different object UIDs returns a ~217-byte error. The `level` parameter also varies per series
(0, 3, 4), not just per progressive refinement step. So each entry's own UID pair is used
as-is; nothing is grouped by series UID.

This is why [`amf3Reader.ts`](amf3Reader.ts) exists and why it is **strict**. The response is
parsed *structurally* — Study → Series → Image — rather than by scanning the binary for
UID-shaped strings and guessing. The guessing broke on Mass General Brigham multi-slice
studies, where a series' `frameOfReferenceUID` was mistaken for the series UID and every
download came back `CLOERROR "Failed to find image in any supplied providers"`. A mispaired
UID triple is answered with `CLOERROR`, never a 4xx, so a wrong guess looks like an empty
study.

There is **one** AMF3 reader in the repo and no lenient mode. Resilience belongs at the call
site: a throw here falls back to the heuristic UID scan, because a misdecoded UID must
surface as an error rather than as a plausible-but-wrong download request.

## Downloading a study

- **Every instance in the study is downloaded**, and junk responses are skipped. eUnity's
  instance list can lead with **pseudo-instances** (the viewer's `SeriesSelector` entries)
  that answer every pixel request with a ~226-byte `CLOERROR`, and some pairings from the
  positional parse are invalid and fail the same way. A study where *every* instance fails
  reports an error rather than a silent empty result.
  An earlier `maxImages` budget sliced the first N entries, which on `SeriesSelector`-led
  studies spent the whole budget on junk and returned **zero images with zero errors**. The
  budget is gone.
- **Slices come back in anatomical order.** Instances download in parallel batches, so raw
  completion order is meaningless. Every multi-slice series is re-sorted before returning:
  [`sortByPatientPosition.ts`](../clo-image-parser/sortByPatientPosition.ts) reads each CLO
  wrapper's `calibration.orientation.positionPatient`, picks the axis the series travels
  along, and sorts by it — so a CT or MRI stack is walked the way the scanner swept it, in
  every client and in the CLI's numbered filenames.
- `CLOWRAPPER` returns metadata plus pixel data; `CLOPIXEL` returns progressive refinement
  levels for maximum quality.
- **MRI works.** The CLI used to skip anything whose name contained "mri"; the pipeline is
  modality-agnostic — X-ray, CT and MRI are all the same CLO format — and the skip is gone.

## Response format

`CLOHEADERZ01` magic + zstd-compressed Haar wavelet data, with zlib-compressed AMF3 metadata
in the wrapper. Decoding is [`../clo-image-parser/`](../clo-image-parser/).

## What is deliberately not here

The viewer's own export path — load eUnity in a headless browser and read
`canvas.toDataURL('image/jpeg', 1.0)` off its WASM renderer — works, and was how this
started. It is gone: it needs a live browser, it is slow, the viewer is Dart-compiled so
`element.click()` does not fire its event handlers (only real `page.mouse.click(x, y)`
does), and driving its series tray was never reliable. The pure-HTTP pipeline above replaced
it. See [`../clo-image-parser/CLO_TO_IMAGE_WASM_APPROACH.md`](../clo-image-parser/CLO_TO_IMAGE_WASM_APPROACH.md)
for the options that were weighed.
