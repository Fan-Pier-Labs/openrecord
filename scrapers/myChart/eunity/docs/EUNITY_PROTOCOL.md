# eUnity DICOM Viewer Protocol - Reverse Engineering Notes

**Date:** 2026-03-03
**Method:** Playwright MCP → Chrome DevTools Protocol (CDP) network interception + Node.js AMF binary probing

## Overview

The eUnity viewer at `eunity.example.org` uses a proprietary binary protocol, NOT standard DICOMweb/WADO. Images are fetched via HTTP POST to servlets, and pixel data is returned in a custom compressed format. The protocol uses raw **AMF3** (Action Message Format 3) objects — there is no AMF0 envelope. This is a custom typed-object protocol, NOT standard Adobe Flex RemotingMessage.

## Endpoints

### 1. `POST /e/AmfServicesServlet` — Study Metadata & Session Init

- **Content-Type (request):** `application/octet-stream`
- **Protocol:** Raw AMF3 typed objects (NOT AMF0 envelope, NOT Flex RemotingMessage)
- **Purpose:** Initialize the server-side session for a study AND retrieve study metadata (series UIDs, etc.)
- **CRITICAL:** This must be called BEFORE `CustomImageServlet` — without it, CustomImageServlet returns **403 Forbidden**.
- **Method called:** `StudyService.getStudyListMeta`
- **Key data in request:**
  - `patientId`: `<MRN>$$$<site>` (format: `<id>$$$<site>`)
  - `accessionNumber`: `E48330984`
  - `serviceInstance`: `EXAMPLEstudystrategy`
  - `studyUID`: DICOM Study Instance UID
- **Response:** AMF binary containing series UIDs, instance UIDs, series descriptions, etc.

### 2. `POST /e/CustomImageServlet` — Image Data

- **Content-Type (request):** `application/x-www-form-urlencoded; charset=UTF-8`
- **Content-Type (response):** `application/clopixel`
- **Prerequisite:** AmfServicesServlet `getStudyListMeta` must be called first, or this endpoint returns **403**

#### Two Request Types:

##### a) `CLOWRAPPER` — Metadata + Low-Res Preview
```
requestType=CLOWRAPPER
contentType=image/CLWAVE;image/CLHAAR
studyUID=<DICOM Study Instance UID>
seriesUID=<DICOM Series Instance UID>
objectUID=<DICOM SOP Instance UID>
frameNumber=1
locale=en_US
haveImageData=partialnops
serializeType=zlib
compressionVersion=3
serviceInstance=EXAMPLEstudystrategy
level=0   (values seen: 0, 3, 4)
```

##### b) `CLOPIXEL` — Full-Resolution Pixel Data
```
requestType=CLOPIXEL
contentType=image/CLHAAR
studyUID=<DICOM Study Instance UID>
seriesUID=<DICOM Series Instance UID>
objectUID=<DICOM SOP Instance UID>
frameNumber=1
locale=en_US
haveImageData=partialps
serializeType=zlib
compressionVersion=3
serviceInstance=EXAMPLEstudystrategy
level=0,3,1   (or 2,3,2 or 2,4,3 — progressive refinement levels)
```

**NOTE:** `image/CLJPEG` is NOT supported by the Example Health System eUnity server. Requesting CLJPEG returns a `CLOERROR` response. Only `image/CLHAAR` and `image/CLWAVE` work.

## Response Format

### Binary Structure

```
Offset 0x00: "CLOCLHAAR###" — Magic header (12 bytes)
             CLO = ClientOutlook (company)
             CLHAAR = Haar wavelet compression codec
             ### = separator

Offset 0x0C: FF FF FF FF — Marker
Offset 0x10: 35 FA 00 01 — Chunk marker (0x35FA) + type 0x01
             ... metadata chunks ...
Offset 0x70: 28 B5 2F FD — zstd magic number (compressed pixel data starts here)
```

### Chunk Format
- Each chunk starts with `35 FA` (2 bytes)
- Followed by 2-byte chunk type ID
- Variable-length data

### Compression
- Pixel data is compressed with **zstd** (magic bytes `28 B5 2F FD`)
- The `serializeType=zlib` parameter in the request is misleading — response uses zstd
- The decompressed data is in **CLHAAR** format (proprietary Haar wavelet encoding)

### Response Sizes (Shoulder X-ray, 3 views)
- Series 1 (R INT ROTATION TABLE): ~2.7 MB
- Series 2 (R GRID AXILLARY): ~2.7 MB
- Series 3 (R EXT ROTATION TABLE): ~6.0 MB

## AMF3 Protocol (Reverse-Engineered)

eUnity uses raw AMF3 typed objects for communication with `AmfServicesServlet`. There is **no AMF0 envelope** — the root object is directly an AMF3 typed object. This is NOT the standard Adobe Flex `RemotingMessage` pattern.

### Message Classes

All classes are in the `com.clientoutlook.web.metaservices` package.

#### `AmfServicesMessage` — Outer Wrapper (Request & Response)

| Sealed Member | Type    | Description                                    |
|---------------|---------|------------------------------------------------|
| `messageID`   | String  | `"HTTPSimpleLoader_1"`, `"HTTPSimpleLoader_2"`, etc. |
| `messageType` | String  | `"call"` for requests, `"response"` for responses |
| `body`        | Object  | `AmfServicesRequest` for requests, `AmfServicesResponse` for responses |

**Important:** Member order is `messageID`, `messageType`, `body` (not `messageType` first).

#### `AmfServicesRequest` — Call Body

Embedded in the `body` field of `AmfServicesMessage`.

| Sealed Member  | Type    | Description                                    |
|----------------|---------|------------------------------------------------|
| `service`      | String  | Service class name (e.g. `"StudyService"`)     |
| `method`       | String  | Method name (e.g. `"getStudyListMeta"`)        |
| `parameters`   | Array   | Array of method arguments (NOT `args`)         |

**Verified:** Member names confirmed by captured browser traffic (Playwright CDP Fetch interception). Using `args` instead of `parameters` returns code=1.

#### `AmfServicesResponse` — Response Body

Embedded in the `body` field of `AmfServicesMessage`.

| Sealed Member | Type          | Description                              |
|---------------|---------------|------------------------------------------|
| `code`        | Integer       | 0 = success, non-zero = error            |
| `response`    | String / Null | Error message text, or null on success   |

### Error Messages (Server Feedback)

The server provides helpful error messages in `AmfServicesResponse.response`:

| Error Text | Meaning |
|------------|---------|
| `"Expected AmfServicesMessage"` | Root object class name is wrong |
| `"messageType should be 'call', not 'X'"` | messageType must literally be `"call"` |
| `"body does not contain an AmfServicesRequest"` | body object class name doesn't match |
| `null` (with code=1) | Request class accepted but method dispatch failed |
| `null` (with code=0) | Success — study metadata returned |

### AMF3 Binary Encoding Notes

- **Object marker:** `0x0A` followed by U29 traits word
- **Traits word:** `0x03 | (memberCount << 4)` for inline, non-external, non-dynamic objects
- **String encoding:** `0x06` marker + U29 length (shifted left 1, OR'd with 1 for inline) + UTF-8 bytes
- **String reference table:** AMF3 maintains a string table; repeated strings can be referenced by index (`index << 1` without the inline bit)
  - In the response, `response` member name at index 4 in the string table is referenced as `0x08` (= 4 << 1)
- **Integer:** `0x04` marker + U29 value
- **Null:** `0x01`
- **Array:** `0x09` marker + U29 length (shifted) + empty string for associative section + items

### `getStudyListMeta` Parameters

The single parameter is a `StudyListRequest` — an **Externalizable** AMF3 object with custom binary serialization:

```
parameters = [
  StudyListRequest {                          // Externalizable (trait bits = 0x07)
    header: uint32_be(2),                     // 4-byte BE header, value=2
    methodQualifier: "getStudyList",          // AMF3 string
    version: "1.2.0",                         // AMF3 string
    options: {                                // Anonymous sealed object (3 members)
      notUsed: true,                          // boolean
      requestedPHI: ArrayCollection([         // Externalizable, wraps AMF3 array
        RequestedPHI {                        // Sealed object (8 members)
          patientId: "<MRN>$$$<site>",         // <MRN>$$$<site>
          studyUID: null,
          accessionNumber: "E48330984",
          serviceInstanceParameter: "",
          serviceInstanceProperties: null,
          serviceInstance: "EXAMPLEstudystrategy",
          originalServiceInstanceParameter: "",
          originalServiceInstance: "EXAMPLEstudystrategy",
        }
      ]),
      environment: Environment {              // Sealed object (6 members)
        levelValue: null,
        level: 0,                             // AMF3 integer
        user: null,
        roles: null,
        device: "WEB",
        numberOfScreens: "1",
      }
    }
  }
]
```

#### AMF3 Class Details

| Class | Package | Type | Members |
|-------|---------|------|---------|
| `StudyListRequest` | `com.clientoutlook.web.metaservices` | Externalizable | Custom binary format |
| `RequestedPHI` | `com.clientoutlook.data` | Sealed (8) | patientId, studyUID, accessionNumber, serviceInstanceParameter, serviceInstanceProperties, serviceInstance, originalServiceInstanceParameter, originalServiceInstance |
| `Environment` | `com.clientoutlook.data.hangingprotocol` | Sealed (6) | levelValue, level, user, roles, device, numberOfScreens |
| `ArrayCollection` | `flex.messaging.io` | Externalizable | Wraps standard AMF3 array |

### Session Initialization Flow

1. Follow SAML chain → get `JSESSIONID` on `eunity.example.org`
2. POST to `/e/AmfServicesServlet` with `getStudyListMeta` call → initializes server-side study context
3. NOW `CustomImageServlet` will return image data (without step 2, it returns 403)

This matches what the browser's WASM viewer does automatically on load.

## WASM Architecture

- Main WASM: `LookupWrapperJSW512MB.wasm` (~large, Dart-compiled)
- Worker WASMs: `LookupWrapperWorkerJSW.wasm` (10 workers created)
- The WASM handles:
  - AMF serialization/deserialization
  - CLHAAR/CLWAVE decompression
  - Pixel rendering to canvas
  - Window/level adjustments

## Authentication Chain

```
MyChart → FdiData API → STS SAML URL
  → STS returns HTML form with SAMLResponse
  → POST to redirect.example.org → meta-refresh to selfauth
  → 302 redirect chain → eunity.example.org/e/viewer?CLOAccessKeyID=...&arg=...
```

- `CLOAccessKeyID` tokens are **single-use** and expire in ~1-2 minutes
- Session cookie: `JSESSIONID` on `eunity.example.org`

## DICOM UIDs (Test Data - Shoulder X-ray)

- **Study UID:** `1.2.840.114350.2.362.2.798268.2.1334247850.1`
- **Accession:** `E48330984`
- **Service Instance:** `EXAMPLEstudystrategy`

| Series | Series UID | Instance UID | Description |
|--------|-----------|-------------|-------------|
| 1 | 1.3.51.0.7.748833181.4805.29255.36386.22408.54239.53943 | 1.3.51.0.7.1272019023.37494.53573.32951.58539.52999.27202 | R INT ROTATION TABLE |
| 2 | 1.3.51.0.7.3271007396.35359.25929.40621.44249.10393.55955 | 1.3.51.0.7.1476580709.39260.10317.37364.41212.20646.62903 | R GRID AXILLARY |
| 3 | 1.3.51.0.7.12998439005.15326.47943.46270.6779.40170.904 | 1.3.51.0.7.2914984340.43539.61507.45579.22367.26993.59294 | R EXT ROTATION TABLE |

## VIEWER JavaScript API

Available methods on `window.VIEWER`:
- `getViewerState()` — Returns studies, seriesData, selectedImage, screenLayout
- `openImage(context)` — Switch displayed image (requires seriesUID, instanceUID)
- `executeCommandByName(name)` — Run viewer commands
- `loadStudyWithStudyUID(uid)` / `loadStudyWithAccession(acc)` — Load studies

### getViewerState() Structure
```json
{
  "studies": [{ "uid": "...", "accessionNumber": "...", "description": "...", "serviceInstance": "..." }],
  "seriesData": [{ "studyUID": "...", "seriesUID": "...", "viewerSeriesID": "..." }],
  "selectedImage": {
    "studyUID": "...", "seriesUID": "...", "instanceUID": "...",
    "seriesDescription": "...", "imageCursor": 0, "frameNumber": 1
  }
}
```

## Known Issues

1. **`node-fetch` fails at selfauth** (FIXED): `redirect.example.org/cgi/selfauth` does TLS fingerprinting — `node-fetch` gets "socket hang up" but Node.js built-in `fetch` (undici) works fine. `followSamlChain()` now uses `globalThis.fetch` with manual `tough-cookie` jar management.

2. **SAML URLs are single-use**: Once consumed (even by a failed attempt), they return 400 on retry. Must get a fresh one from `FdiData` API each time.

3. **CLOAccessKeyID tokens are single-use and expire in ~1-2 minutes**: The eUnity viewer URL can only be loaded once. Page reload returns 401.

4. **image/CLJPEG is NOT supported**: The Example Health System eUnity server returns `CLOERROR` when `contentType=image/CLJPEG` is requested. Only `image/CLHAAR` and `image/CLWAVE` formats work. Standard JPEG download is NOT possible via CustomImageServlet.

5. **AMF `getStudyListMeta` response parsing incomplete**: The AMF response with code=0 contains binary metadata (series UIDs, instance UIDs) but full structured parsing of the AMF3 response is not yet implemented. Currently uses heuristic UID pattern matching.

6. ~~**AMF `AmfServicesRequest` member names unverified**~~: **RESOLVED.** The correct member name is `parameters` (not `args`), and the parameter is a complex `StudyListRequest` Externalizable object (not a simple string array). Member order for `AmfServicesMessage` is `messageID`, `messageType`, `body`. Verified by capturing actual browser AMF traffic via Playwright CDP Fetch interception — generated binary is byte-for-byte identical to the browser's WASM viewer.

7. **Example Health System 2FA limitation**: Example Health System sends 2FA codes to the patient's registered email, NOT to the Resend inbound address. The Resend auto-2FA feature does not work for Example Health System — manual 2FA code entry is required.

8. **JavaScript redirect in SAML chain**: The `redirecttoviewer` page at `redirect.example.org` uses a JavaScript `window.location.href` redirect instead of an HTTP 302 redirect. `followSamlChain()` handles this by parsing the HTML for JS redirect patterns.

## Next Steps

1. ~~**Verify AMF `AmfServicesRequest` member names**~~ — **DONE.** Captured browser AMF traffic, our generated binary is byte-for-byte identical.
2. **Build AMF3 response parser** to extract structured series/instance UIDs from `getStudyListMeta` response (currently using heuristic UID pattern matching which works but is fragile)
3. ~~**Complete end-to-end direct download pipeline**~~ — **DONE.** SAML → AMF init (code=0) → CustomImageServlet → 6.3 MB CLO image data. Full pipeline works without Playwright.
4. **Convert CLO/CLHAAR format to standard image formats**: The response uses `CLOHEADERZ01` magic with zstd-compressed Haar wavelet data. Need to investigate decompression: zstd → Haar wavelet decode → raw pixels → PNG/JPEG. The WASM (`LookupWrapperWorkerJSW.wasm`) does this client-side.
5. **Playwright export button fallback** — eUnity has Export > "Export Image to JPEG/PNG" button. This is the current working approach for getting standard image formats.

## Code Files

- `src/main/scrapers/myChart/eunity/imagingViewer.ts` — SAML chain following (`followSamlChain()`), FDI context extraction, FdiData API. Uses `globalThis.fetch` (undici) to pass TLS fingerprinting at `redirect.example.org`.
- `src/main/scrapers/myChart/eunity/imagingDirectDownload.ts` — Direct HTTP download with AMF3 binary protocol. Contains `AMF3Writer` class, `buildAmfCall()`, `initializeAmfSession()`, `downloadImage()`, `downloadImagingDirect()`.
- `src/main/scrapers/myChart/eunity/imagingDownloader.ts` — Playwright-based download (working, uses dblclick for export)
- `src/main/scrapers/myChart/labs_and_procedure_results/labResults.ts` — `getImagingResults()` function
- `test_amf_capture.ts` — AMF protocol probing script (12 member name patterns tested)
- `test_saml_cookies.ts` — SAML chain + CustomImageServlet test
- `get_saml_quick.ts` — Helper to get SAML URLs for testing

## Cookie Cache Fix

**Bug:** `MyChartRequest.serialize()` was synchronous but `cookieJar.serialize()` is async — serialized a Promise object instead of actual cookies, resulting in empty `{"cookies": {}}`.

**Fix:** Made `serialize()` async, added `await` to all callers:
- `src/main/scrapers/myChart/myChartRequest.ts` — `async serialize()`
- `src/cli.ts` — `await mychartRequest.serialize()`
- `src/main/storage/storage.ts` — `await mychartRequest.serialize()` + `Promise.all` for map
- `web/src/lib/mychart/myChartRequest.ts` — same fix
- `web/src/lib/mcp/keepalive.ts` — two call sites
- `web/src/app/api/mcp-session/route.ts` — one call site
