# Imaging Scraper

The `get-imaging` CLI action (`--action get-imaging`) scrapes imaging results (MRI, X-ray, CT, fluoroscopy, ultrasound, OCT, etc.) from MyChart. It uses keyword-based and structured-data filtering to identify imaging studies from the test-results API.

## Key Files

- `scrapers/myChart/eunity/imagingViewer.ts` — FDI context extraction, FdiData API, SAML chain following (uses `globalThis.fetch` for TLS fingerprinting compatibility)
- `scrapers/myChart/eunity/imagingDirectDownload.ts` — Direct HTTP download with AMF3 binary protocol (`AMF3Writer`, `buildAmfCall()`, `initializeAmfSession()`, `downloadImagingDirect()`)
- `scrapers/myChart/eunity/imagingDownloader.ts` — Playwright-based download (fallback approach)
- `scrapers/myChart/labs_and_procedure_results/labResults.ts` — `getImagingResults()` and `listLabResults()`
- `scrapers/myChart/labs_and_procedure_results/labtestresulttype.ts` — `ImagingResult` interface
- `scrapers/myChart/eunity/docs/EUNITY_PROTOCOL.md` — Detailed eUnity AMF3 protocol reverse engineering notes
- `scrapers/myChart/eunity/docs/DICOM_DOWNLOAD_NOTES.md` — High-level DICOM download architecture notes

## How It Works

1. Calls `GetList` API with group types 0–3 to get all test results
2. Filters for imaging by keyword matching (`mri`, `x-ray`, `ct`, `ultrasound`, etc.) and structured data checks (`imageStudies`, `scans`, `narrative`, `reportDetails`)
3. For each imaging result, loads the report content HTML via `LoadReportContent` API
4. Extracts `data-fdi-context` JSON from the HTML (contains `fdi` and `ord` params for image viewer)
5. Calls `FdiData` API to get SAML URLs for the eUnity image viewer
6. Follows the SAML chain (`followSamlChain()`) to get authenticated eUnity session (`JSESSIONID`)
7. (WIP) Calls `AmfServicesServlet` with `getStudyListMeta` to initialize the server-side study session
8. (WIP) Downloads image data from `CustomImageServlet` in CLHAAR/CLWAVE format

## eUnity AMF3 Protocol

The eUnity viewer uses raw AMF3 typed objects (NOT standard Flex RemotingMessage):
- **Request wrapper:** `com.clientoutlook.web.metaservices.AmfServicesMessage` (messageType="call", messageID, body)
- **Request body:** `com.clientoutlook.web.metaservices.AmfServicesRequest` (service, method, args)
- **Response body:** `com.clientoutlook.web.metaservices.AmfServicesResponse` (code: int, response: string|null)
- AMF `getStudyListMeta` call is REQUIRED before `CustomImageServlet` will serve images (otherwise 403)
- See `scrapers/myChart/eunity/docs/EUNITY_PROTOCOL.md` for full protocol details

## Example Health System-Specific Notes

- eUnity image viewer at `eunity.example.org` uses proprietary AMF + CustomImageServlet (NOT standard DICOMweb/WADO)
- `image/CLJPEG` format is NOT supported — server returns `CLOERROR`. Only CLHAAR/CLWAVE work.
- `CLOAccessKeyID` tokens are single-use; SAML URLs expire in ~1-2 minutes
- `redirect.example.org/cgi/selfauth` does TLS fingerprinting — `node-fetch` fails, `globalThis.fetch` (undici) works
- SAML chain includes a JavaScript redirect at `redirecttoviewer` page (not HTTP 302)
- Example Health System 2FA sends codes to patient's registered email (not Resend inbound) — manual 2FA required
- Example Health does NOT expose images at all
