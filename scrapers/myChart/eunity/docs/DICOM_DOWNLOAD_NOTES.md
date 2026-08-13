# DICOM Image Download - Reverse Engineering Notes

## Summary

Example Health System MyChart exposes DICOM images to patients via **eUnity** (by Client Outlook), a web-based DICOM viewer at `eunity.example.org`. Example Health does NOT expose images at all.

## Current Static Scraper Status

A static TypeScript scraper exists that can:
1. List all imaging results (MRI, X-ray, CT, fluoroscopy, ultrasound, OCT, etc.)
2. Extract radiology report text (narrative + impression)
3. Extract FDI context (`fdi` + `ord` params) from report HTML
4. Generate SAML URLs for the eUnity image viewer via FdiData API
5. Follow the SAML chain to get authenticated eUnity session (`JSESSIONID`)
6. Construct AMF3 binary requests for `AmfServicesServlet` to initialize the study session
7. Download image data from `CustomImageServlet` in CLHAAR/CLWAVE format

**Partially implemented:** AMF session initialization sends the `getStudyListMeta` call but the exact member names for `AmfServicesRequest` need verification (server returns code=1 with current names). CLHAAR/CLWAVE binary decompression to standard image formats (PNG/TIFF) is not yet implemented.

### Key Files

- `src/main/scrapers/myChart/eunity/imagingViewer.ts` — FDI context extraction, FdiData API, SAML chain following
- `src/main/scrapers/myChart/eunity/imagingDirectDownload.ts` — Direct HTTP download with AMF3 binary protocol, `AMF3Writer` class
- `src/main/scrapers/myChart/labs_and_procedure_results/labResults.ts` — `getImagingResults()` function
- `src/main/scrapers/myChart/labs_and_procedure_results/labtestresulttype.ts` — `ImagingResult` interface

## What We Have

- `MRI_SHOULDER_ARTHROGRAM_overview.png` - Screenshot of 4 MRI series from the eUnity viewer
- `MRI_SHOULDER_ARTHROGRAM_RIGHT_report.txt` - Full radiology report text
- `eunity-mri-viewer.png` - Screenshot with DICOM header visible

## Study Details

| Field | Value |
|-------|-------|
| Study UID | `1.2.840.114350.2.362.2.798268.2.1470434258.1` |
| Accession | `E54563047` |
| Patient ID (MRN) | `<MRN>` |
| Description | `UPPER_EXTREMITY^Shoulder Arthrogram` |
| Date | `2025-03-12` |
| Total Series | 12 |
| Service Instance | `EXAMPLEstudystrategy` |

### Displayed Series UIDs (4 of 12)

1. `1.3.12.2.1107.5.2.41.169552.2025031214152346442686979.0.0.0` (120 slices)
2. `1.3.12.2.1107.5.2.41.169552.2025031214155143237588063.0.0.0` (9 slices)
3. `1.3.12.2.1107.5.2.41.169552.2025031214155143354588073.0.0.0` (11 slices)
4. `1.3.12.2.1107.5.2.41.169552.2025031214155143466388085.0.0.0` (15 slices)

## How the Image Viewer Works

### Authentication Flow (Complete — Reverse Engineered)

1. MyChart `LoadReportContent` API returns HTML containing `data-fdi-context` JSON attribute with `fdi` and `ord` params
2. Client calls `GET /Home/CSRFToken` to get a fresh CSRF token
3. Client calls `POST /Extensibility/Redirection/FdiData?fdi=...&ord=...` with CSRF token → returns `{url: "https://sts.example.org/...", launchmode: 2}`
4. Browser opens the STS URL → returns HTML form with `SAMLResponse` hidden field
5. Browser auto-submits SAML form to `redirect.example.org` assertion consumer
6. `redirect.example.org` redirects to `eunity.example.org/e/viewer?CLOAccessKeyID=<key>&arg=<token>`
7. Session cookie `JSESSIONID` is set on `eunity.example.org`
8. The `CLOAccessKeyID` + `arg` token is **single-use** — page reload returns 401

### Where `fdi` and `ord` Come From

The **key discovery**: `fdi` and `ord` are embedded in the report content HTML inside a `data-fdi-context` JSON attribute. The flow:
1. Call `POST /api/test-results/GetDetails` to get the lab result with `reportDetails.reportID`
2. Call `POST /api/report-content/LoadReportContent` with the `reportID` and `reportVars`
3. Parse the returned HTML for `[data-fdi-context]` → `{"fdi": "...", "ord": "..."}`

The "Show images" link is rendered inside a shadow DOM (`div.InternalReportViewerWrapper`), but the data is accessible from the API response HTML without needing a browser.

### Image Loading Protocol

eUnity uses two proprietary servlets (NOT standard DICOMweb/WADO):

1. **`POST /e/AmfServicesServlet`** — AMF3 binary protocol (raw typed objects, no AMF0 envelope)
   - Used for session init via `StudyService.getStudyListMeta`
   - MUST be called before CustomImageServlet (otherwise 403)
   - Request/response are `com.clientoutlook.web.metaservices.AmfServicesMessage` typed objects
   - See [EUNITY_PROTOCOL.md](EUNITY_PROTOCOL.md) for full AMF3 message format details

2. **`POST /e/CustomImageServlet`** — Image pixel data
   - Called 100+ times (once per MRI slice)
   - Request body is `application/x-www-form-urlencoded` with study/series/instance UIDs
   - Response body is binary compressed pixel data in CLHAAR/CLWAVE format (NOT standard DICOM)
   - `image/CLJPEG` format is NOT supported — server returns `CLOERROR`
   - The WASM decoder (`LookupWrapperWorkerJSW.wasm`) decompresses the pixel data client-side

### JavaScript API (window.VIEWER)

The eUnity viewer exposes a rich JS API:
- `VIEWER.getViewerState()` — Returns full study/series/instance metadata
- `VIEWER.getViewer()` — Internal viewer object
- `EUNITY_getStudyStatuses()` — Study UID, accession, patient ID
- `EUNITY_loadStudy*()` — Load studies by UID/accession
- `VIEWER.openImage()` — Navigate to specific image
- `VIEWER.executeCommandByName()` — Execute toolbar commands programmatically

### What Did NOT Work

- **WADO-RS** (`/e/wado-rs/studies/...`) — 404, not exposed
- **WADO-URI** (`/e/wado?requestType=WADO&...`) — 404, not exposed
- **MyChart API `imageStudies`** — Returns `[]` even when images exist (image viewer link is in the HTML, not API JSON)
- **Page reload** — CLOAccessKeyID token is single-use
- **Canvas pixel extraction** — Could work for PNG screenshots but eUnity renders all 4 series on a single `mdiStage` canvas (1440x1644)

## How To Get Image Files

### Option 1: Direct HTTP Download (In Progress — Recommended)

The `imagingDirectDownload.ts` module implements direct HTTP image download without Playwright:

```typescript
// Full pipeline implemented in downloadImagingDirect():
// 1. Follow SAML chain → get JSESSIONID on eunity.example.org
// 2. POST AMF3 getStudyListMeta to AmfServicesServlet → initialize session
// 3. POST to CustomImageServlet → download CLHAAR/CLWAVE binary data
```

**Status:** Steps 1-3 are implemented. Step 2 (AMF init) needs member name verification — the server accepts the `AmfServicesRequest` class but returns code=1 (see Known Issues in [EUNITY_PROTOCOL.md](EUNITY_PROTOCOL.md)). Once AMF init succeeds (code=0), CustomImageServlet should return image data.

**Remaining work:**
- Verify `AmfServicesRequest` member names by capturing actual browser traffic
- Parse AMF response to extract series/instance UIDs
- Decode CLHAAR binary format to standard image (PNG/TIFF)

### Option 2: Export JPEG via eUnity UI (Fallback)

1. Use Playwright to click Export > "Export Image to JPEG / PNG"
2. Intercept with `page.on('download', ...)` and save the file
3. Repeat for each slice by scrolling through the series
4. This gives lossy JPEG images, not DICOM, but is the simplest approach

### Option 3: Canvas Pixel Data Extraction

1. Use `canvas.toDataURL('image/png')` on the `mdiStage` canvas
2. This captures the rendered image (with overlays/annotations)
3. Need to scroll through each slice in each series
4. Result is PNG screenshots, not DICOM

### What Does NOT Work

- **`image/CLJPEG` format** — Example Health System's eUnity server returns `CLOERROR`. No standard JPEG output via CustomImageServlet.
- **WADO-RS/WADO-URI** — Not exposed (404). Standard DICOMweb is not available.
- **CustomImageServlet without AMF init** — Returns 403. The `getStudyListMeta` AMF call must succeed first.

## Other Imaging Studies at Example Health System

| Study | Date | Type |
|-------|------|------|
| OCT, OPTIC NERVE, BOTH EYES | Oct 30, 2025 | Imaging |
| MRI SHOULDER ARTHROGRAM (RIGHT) | Mar 12, 2025 | Imaging |
| FL SHOULDER ARTHROGRAM (RIGHT) | Mar 12, 2025 | Imaging (fluoroscopy) |
| XR Shoulder (Right) | Feb 21, 2025 | Imaging (X-ray) |
| MRI SHOULDER ARTHROGRAM (RIGHT) | Sep 03, 2024 | Imaging |
| FL SHOULDER ARTHROGRAM (RIGHT) | Sep 03, 2024 | Imaging (fluoroscopy) |
| XR Shoulder (Right) | Aug 13, 2024 | Imaging (X-ray) |
| EXCISION OF CHALAZION (RIGHT EYE) | Feb 13, 2024 | Imaging |
| EXCISION OF CHALAZION (RIGHT EYE) | Sep 07, 2023 | Imaging |

## Example Health vs Example Health System

| Feature | Example Health | Example Health System |
|---------|--------------|-----|
| Image viewer | NOT available | eUnity (Client Outlook) |
| `imageStudies` in API | `[]` | `[]` |
| "Show images" link | Not present | Present |
| DICOM viewer URL | N/A | `eunity.example.org` |
| WADO endpoints | N/A | Not exposed (404) |
| Image protocol | N/A | Proprietary AMF + CustomImageServlet |
