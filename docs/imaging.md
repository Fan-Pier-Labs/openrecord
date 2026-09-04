# Imaging Scraper

The `get-imaging` CLI action (`--action get-imaging`) scrapes imaging results (MRI, X-ray, CT, fluoroscopy, ultrasound, OCT, etc.) from MyChart. It uses keyword-based and structured-data filtering to identify imaging studies from the test-results API.

## Key Files

- `scrapers/myChart/eunity/imagingViewer.ts` — FDI context extraction, FdiData API, SAML chain following (uses `globalThis.fetch` for TLS fingerprinting compatibility)
- `scrapers/myChart/eunity/amf.ts` — the AMF3 wire layer: `buildAmfCall()` and the getStudyListMeta response parsers. Pure, no network; encodes frames with the shared `Amf3Writer`
- `scrapers/myChart/eunity/session.ts` — SAML chain → study params → `initializeAmfSession()`, the server-side session CustomImageServlet requires
- `scrapers/myChart/eunity/download.ts` — `downloadSingleImage()` and `downloadImagingStudyDirect()`, the direct HTTP pixel pull
- `shared/amf3Writer.ts` — The repo's only AMF3 writer; also used by fake-mychart, so a request frame and the server's answer are built by one encoder
- `scrapers/myChart/eunity/amf3Reader.ts` — Strict AMF3 decoder for the `getStudyListMeta` response; `parseStudySeriesFromAmfStructured()` walks the decoded Study → Series → Image tree for exact UID pairing (the positional heuristic `parseStudySeriesFromAmf` remains as fallback)
- `scrapers/myChart/chart/labs/labResults.ts` — `getImagingResults()` and `listLabResults()`
- `scrapers/myChart/chart/labs/labtestresulttype.ts` — `ImagingResult` interface
- `scrapers/myChart/eunity/docs/EUNITY_PROTOCOL.md` — Detailed eUnity AMF3 protocol reverse engineering notes
- `scrapers/myChart/eunity/docs/DICOM_DOWNLOAD_NOTES.md` — High-level DICOM download architecture notes

## How It Works

1. Calls `GetList` API with group types 0–3 to get all test results
2. Filters for imaging by keyword matching (`mri`, `x-ray`, `ct`, `ultrasound`, etc.) and structured data checks (`imageStudies`, `scans`, `narrative`, `reportDetails`)
3. For each imaging result, loads the report content HTML via `LoadReportContent` API
4. Extracts `data-fdi-context` JSON from the HTML (contains `fdi` and `ord` params for image viewer). Some instances (observed on Mass General Brigham) never embed `data-fdi-context` — each result instead carries a structured `fdiLink.redirectUrl` (`/Extensibility/Redirection/FdiRedirection?fdi=…&ord=…`), which `extractFdiContextFromFdiLink()` parses as a fallback
5. Calls `FdiData` API to get SAML URLs for the eUnity image viewer
6. Follows the SAML chain (`followSamlChain()`) to get authenticated eUnity session (`JSESSIONID`)
7. Calls `AmfServicesServlet` with `getStudyListMeta` to initialize the server-side study session, then decodes the AMF3 response structurally (`amf3Reader.ts`) to get the exact study/series/instance UID tree — a request with a mispaired UID triple gets `CLOERROR "Failed to find image in any supplied providers"`, not a 4xx
8. Downloads image data from `CustomImageServlet` in CLHAAR/CLWAVE format

## eUnity AMF3 Protocol

The eUnity viewer uses raw AMF3 typed objects (NOT standard Flex RemotingMessage):
- **Request wrapper:** `com.clientoutlook.web.metaservices.AmfServicesMessage` (messageType="call", messageID, body)
- **Request body:** `com.clientoutlook.web.metaservices.AmfServicesRequest` (service, method, args)
- **Response body:** `com.clientoutlook.web.metaservices.AmfServicesResponse` (code: int, response). For `getStudyListMeta`, `response` is a `StudyListResponse` — an *externalizable* whose custom body is: 4-byte big-endian header (2), a `DataRequestStatus` value, a version string ("1.0.0"), a second big-endian word, then the payload object whose `studyList` ArrayCollection holds `Study` → `series` → `Series` → `images` → `Image` typed objects
- AMF `getStudyListMeta` call is REQUIRED before `CustomImageServlet` will serve images (otherwise 403)
- The parsed instance list can lead with pseudo-instances (the viewer's `SeriesSelector` entries) that answer every pixel request with a ~226-byte `CLOERROR`; some (series, instance) pairings from the positional AMF parse are also invalid and fail the same way. `downloadImagingStudyDirect` downloads **every** instance in the study and skips these junk responses — they are never returned as images, and a study where *every* instance fails reports an error instead of a silent empty result. (An earlier `maxImages` budget sliced the first N entries, which on `SeriesSelector`-led studies spent the whole budget on junk and returned zero images with zero errors; the budget is gone.)
- Instances download in parallel batches, so the raw completion order is meaningless. `downloadImagingStudyDirect` re-orders every multi-slice series anatomically before returning — `sortByPatientPosition.ts` reads each CLO wrapper's `calibration.orientation.positionPatient`, picks the axis the series travels along, and sorts by it — so all clients (and the CLI's numbered JPEG filenames) walk a CT/MRI stack the way the scanner swept it.
- See `scrapers/myChart/eunity/docs/EUNITY_PROTOCOL.md` for full protocol details

## Example Health System-Specific Notes

- eUnity image viewer at `eunity.example.org` uses proprietary AMF + CustomImageServlet (NOT standard DICOMweb/WADO)
- `image/CLJPEG` format is NOT supported — server returns `CLOERROR`. Only CLHAAR/CLWAVE work.
- `CLOAccessKeyID` tokens are single-use; SAML URLs expire in ~1-2 minutes
- `redirect.example.org/cgi/selfauth` does TLS fingerprinting — `node-fetch` fails, `globalThis.fetch` (undici) works
- SAML chain includes a JavaScript redirect at `redirecttoviewer` page (not HTTP 302)
- Example Health System 2FA sends codes to patient's registered email (not Resend inbound) — manual 2FA required
- Example Health does NOT expose images at all
