# CLO-to-Image Conversion Approaches

## The Problem

eUnity's image viewer serves images in proprietary CLO formats:
- **CLOCLHAAR**: Haar wavelet compressed pixel data (zstd + custom Haar codec)
- **CLOHEADERZ01**: Wrapper with zlib-compressed AMF3 metadata + embedded pixel data

These are NOT standard image formats. The viewer's Dart-compiled WASM module (`LookupWrapperJSW512MB.wasm`) decodes them client-side into raw pixels for canvas rendering.

We need to convert these to standard image formats (JPEG/PNG). Four approaches are outlined below, followed by a recommendation weighing effort, reliability, and long-term value.

### Option A: Run the WASM in a Headless Browser (Most Feasible)

**How it works:**
1. Download the WASM module + JS glue code from eUnity (they're publicly served static assets)
2. Load them in a Playwright/Puppeteer headless browser
3. Feed our downloaded CLO data to the WASM decoder
4. Extract rendered pixels from the `<canvas>` element via `canvas.toDataURL('image/png')`

**Pros:**
- The WASM already knows how to initialize its own environment
- The JS glue code handles all the complex Dart runtime setup
- We get pixel-perfect output (same as what the viewer renders)
- No reverse engineering needed

**Cons:**
- Requires a headless browser runtime
- The WASM is large (512MB virtual memory allocation)
- Need to figure out how to feed CLO data without a real eUnity session

**Key assets to download (all served as static files):**
- `https://eunity.example.org/e/viewer/main.dart.js` — Dart-compiled JS (the main viewer logic)
- `https://eunity.example.org/e/viewer/LookupWrapperJSW512MB.wasm` — Main WASM decoder
- `https://eunity.example.org/e/viewer/LookupWrapperWorkerJSW.wasm` — Worker WASM (10 instances)

**Implementation sketch:**
```typescript
// 1. Create a minimal HTML page that loads the WASM decoder
// 2. Override the network layer to serve CLO data from local files
// 3. Call the decoder's exported functions directly

// The viewer JS creates these global objects:
// - window.VIEWER (main viewer API)
// - Workers that handle decompression

// We'd need to:
// a) Intercept XHR/fetch calls that request CLO data from CustomImageServlet
// b) Respond with our locally-saved CLO files instead
// c) Wait for the canvas to render
// d) Extract via canvas.toDataURL()
```

### Option B: Direct WASM Invocation in Node.js (Harder but Faster)

**How it works:**
1. Download the WASM binary
2. Use `wasm2wat` (from wabt toolkit) to disassemble and find exported decode functions
3. Instantiate the WASM in Node.js with `WebAssembly.instantiate()`
4. Call the CLHAAR decode function directly with CLO data as input
5. Read raw pixel data from WASM memory

**Pros:**
- No browser needed, pure Node.js
- Very fast once set up
- Could be packaged as a reusable library

**Cons:**
- Dart-compiled WASM has complex initialization (Dart runtime, GC, async event loop)
- The WASM likely expects a browser-like environment (DOM, Canvas, WebGL stubs)
- Function signatures may not be clean — Dart mangles names
- The 512MB memory requirement is unusual and may indicate it uses memory-mapped tricks
- The WASM uses 10 worker threads — Node.js WASM doesn't have built-in worker support

**Investigation steps:**
```bash
# 1. Download the WASM
curl -o LookupWrapperJSW512MB.wasm 'https://eunity.example.org/e/viewer/LookupWrapperJSW512MB.wasm'

# 2. Analyze exports
wasm-objdump -x LookupWrapperJSW512MB.wasm | grep -i export | head -50

# 3. Look for decode-related functions
wasm2wat LookupWrapperJSW512MB.wasm | grep -i 'haar\|decode\|decompress\|pixel' | head -20

# 4. Check the JS glue code for function names
curl -o main.dart.js 'https://eunity.example.org/e/viewer/main.dart.js'
grep -oE 'function \w+Haar\w+|function \w+decode\w+|function \w+Decompress\w+' main.dart.js
```

### Option C: Intercept the Viewer's Canvas During Normal Session (Simplest)

**How it works:**
1. We already follow the SAML chain to get an authenticated eUnity session
2. Instead of downloading raw CLO data, open the viewer URL in Playwright
3. Wait for each series to render on the canvas
4. Use `page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'))`
5. Save the PNG data

**Pros:**
- Simplest approach — no WASM extraction needed
- Uses the viewer exactly as intended
- Gets window/level adjusted images (proper contrast)
- We already have `imagingDownloader.ts` doing something similar with export buttons

**Cons:**
- Requires a live eUnity session (can't decode offline CLO files)
- Slower than direct WASM decode (full viewer load + render time)
- SAML URLs are single-use and expire quickly
- The viewer's WASM takes several seconds to initialize
- Need to iterate through all series (double-click each one in the viewer)

**This is essentially what `imagingDownloader.ts` already does**, but instead of clicking Export > JPEG, we'd grab the canvas directly. The canvas approach avoids the export dialog and is more reliable.

### Option D: Fully Reverse-Engineer the CLO/CLHAAR Format (Pure Decoder)

**How it works:**
1. Analyze the CLO binary format structure (headers, chunks, metadata)
2. Decompress the zstd layer (standard, well-documented)
3. Reverse-engineer the CLHAAR Haar wavelet codec (the hard part)
4. Implement wavelet inverse transform → raw pixels → JPEG/PNG
5. Handle progressive level compositing (3 levels → full resolution)

**What we already know about the format:**
```
CLOCLHAAR###          — 12-byte magic header identifying Haar wavelet format
FF FF FF FF           — Separator marker
35 FA XX YY           — Chunk markers (0x35FA prefix), XX YY = chunk type
                        Multiple chunks contain metadata + pixel data
28 B5 2F FD           — zstd magic number (standard compression)
... zstd payload ...  — After decompression: Haar wavelet coefficients
```

The CLOWRAPPER response (`CLOHEADERZ01`) contains:
- zlib-compressed AMF3 metadata (ImageDescription with DICOM fields: dimensions, bit depth, photometric interpretation, window center/width)
- Embedded pixel data in CLHAAR format

The CLOPIXEL progressive levels:
- `level=0,3,1` → approximation coefficients (LL subband) — ~102x102 for a 2337x2259 image
- `level=2,3,2` → horizontal/vertical/diagonal detail (LH, HL, HH subbands)
- `level=2,4,3` → final detail refinement
- These three responses must be composited via inverse Haar wavelet transform to reconstruct the full image

**Reverse engineering steps:**
1. **Parse the chunk structure** — map out all `35 FA` chunk types and their payloads
2. **Decompress zstd** — use standard zstd library, this is trivial
3. **Analyze decompressed data** — compare known image dimensions (2337x2259, 16-bit grayscale from DICOM metadata) against decompressed byte count to figure out the pixel layout
4. **Haar wavelet basics** — standard Haar transform is well-documented (split signal into low/high frequency pairs, recursively). The "custom" part is how ClientOutlook packs the coefficients and what quantization they apply
5. **Compare level outputs** — download all 3 levels for a known image, decompress each, compare sizes and byte patterns to understand the progressive structure
6. **Build inverse transform** — reconstruct full-res image from wavelet coefficients
7. **Apply DICOM windowing** — use WindowCenter/WindowWidth from metadata to map pixel values to displayable range

**Pros:**
- Zero external dependencies — pure code, no browser, no WASM, no network
- Fastest possible decode path (native code, no overhead)
- Works completely offline on saved CLO files
- Full control over output format, quality, bit depth
- Can extract 16-bit raw pixel data (medical imaging grade) not just 8-bit JPEG
- No dependency on eUnity's viewer code — immune to their updates
- Reusable as a standalone library

**Cons:**
- **Highest engineering effort** — the CLHAAR codec is proprietary with no documentation
- Haar wavelets are well-understood in theory, but ClientOutlook's specific implementation (coefficient packing, quantization, progressive scheme) needs to be reverse-engineered from binary data
- Risk of subtle decoding errors that produce wrong pixel values (dangerous for medical images)
- The `35 FA` chunk format, coefficient ordering, and progressive compositing scheme are all unknowns
- If eUnity changes their format, our decoder breaks (though CLO files already downloaded would still decode)
- Could take days-to-weeks of binary analysis

**Investigation approach:**
```python
import zstandard  # pip install zstandard
import struct

# 1. Load a CLOPIXEL level-0 response
with open('image_pixel_L0-3-1.clo', 'rb') as f:
    data = f.read()

# 2. Find and decompress zstd payload
zstd_offset = data.find(b'\x28\xb5\x2f\xfd')  # zstd magic
if zstd_offset >= 0:
    dctx = zstandard.ZstdDecompressor()
    raw = dctx.decompress(data[zstd_offset:])
    print(f"Compressed: {len(data) - zstd_offset} bytes → Decompressed: {len(raw)} bytes")
    # For a 102x102 16-bit image: expect ~20,808 bytes (102*102*2)
    # For a 2337x2259 16-bit image: expect ~10,558,566 bytes

# 3. Map chunk structure before zstd
pos = 12  # skip CLOCLHAAR### header
while pos < zstd_offset:
    if data[pos:pos+2] == b'\x35\xfa':
        chunk_type = struct.unpack('>H', data[pos+2:pos+4])[0]
        print(f"Chunk at 0x{pos:04x}: type=0x{chunk_type:04x}")
        pos += 4
    else:
        pos += 1
```

## Comparison & Recommendation

### Effort vs. Value Matrix

| Approach | Effort | Speed | Offline? | Quality | Reliability | Maintenance |
|----------|--------|-------|----------|---------|-------------|-------------|
| **A: WASM in Browser** | Medium (2-4 days) | Slow (~5s/image) | Yes (after setup) | Pixel-perfect | High | Medium (WASM updates) |
| **B: Direct WASM Node** | High (1-2 weeks) | Fast (~100ms) | Yes | Pixel-perfect | Medium | High (Dart runtime) |
| **C: Canvas Capture** | Low (done) | Slow (~10s/series) | No (live session) | Good (8-bit) | Medium | Low |
| **D: Full RE Decoder** | Very High (1-3 weeks) | Very Fast (~10ms) | Yes | Perfect (16-bit) | Low initially | Low once stable |

### When to pick which

**Option C (Canvas Capture)** — Best for right now. Already working via `imagingDownloader.ts`. Good enough for most use cases. Main limitation is needing a live eUnity session and being slow.

**Option A (WASM in Browser)** — Best bang for the buck if we need offline decode. The WASM already handles all the complexity; we just need to feed it data. Moderate effort, high reliability. **Recommended next step after C.**

**Option D (Full Reverse Engineering)** — Best long-term investment IF we're building a serious medical imaging pipeline. The payoff is huge (zero dependencies, fastest decode, 16-bit output, fully portable) but the upfront cost is high and there's real risk of getting stuck on the proprietary codec details. The zstd decompression is trivial, but the Haar wavelet coefficient packing and progressive compositing are the unknowns. **Worth investigating in parallel** — start with the investigation script above to assess how hard the actual codec is. If the decompressed data maps cleanly to known image dimensions, the codec may be simpler than expected.

**Option B (Direct WASM Node)** — Least recommended. It has all the complexity of reverse engineering (understanding the Dart WASM runtime) with none of the independence (still depends on eUnity's code). The Dart runtime initialization is notoriously complex and the WASM expects browser APIs. Only makes sense if you need batch processing speed AND Options A/D don't pan out.

### Recommended Strategy

1. **Now:** Option C (canvas capture) is already working. Use it.
2. **Next:** Start Option D investigation in parallel — run the zstd decompression script above on existing CLO files to assess codec complexity. If the decompressed data is straightforward (raw wavelet coefficients mapping to known dimensions), a full decoder could be faster to build than expected.
3. **Fallback:** If Option D stalls on the codec, pivot to Option A (WASM in headless browser) for reliable offline decode.
4. **Skip:** Option B unless all else fails.

## Key Technical Details

### WASM Module Structure
- **Main WASM** (`LookupWrapperJSW512MB.wasm`): ~large, Dart-compiled. Handles AMF parsing, CLHAAR decompression, pixel rendering.
- **Worker WASMs** (`LookupWrapperWorkerJSW.wasm`): Smaller, 10 instances created. Handle parallel decompression of wavelet tiles.
- **JS glue** (`main.dart.js`): Dart-to-JS compiled code that sets up the Dart runtime, manages WASM memory, and bridges to browser APIs.

### CLO Data Format (what the WASM decodes)
```
CLOCLHAAR###          — 12-byte magic header
FF FF FF FF           — Marker
35 FA 00 01           — Chunk marker (0x35FA) + type
... metadata chunks ...
28 B5 2F FD           — zstd magic (compressed pixel data starts)
... zstd compressed Haar wavelet coefficients ...
```

### Progressive Refinement
The viewer requests 3 CLOPIXEL levels per image:
- `level=0,3,1` — Base approximation coefficients
- `level=2,3,2` — Medium detail wavelets
- `level=2,4,3` — Full detail wavelets

All 3 levels are composited client-side for full resolution. The WASM handles this compositing.

### Canvas Capture Quick Reference
```javascript
// Get the main viewer canvas
const canvas = document.querySelector('#viewerCanvas') || document.querySelector('canvas');

// Option 1: PNG (lossless, larger files)
const pngDataUrl = canvas.toDataURL('image/png');

// Option 2: High-quality JPEG
const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.95);

// Option 3: Raw pixel data
const ctx = canvas.getContext('2d');
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
// imageData.data is Uint8ClampedArray of RGBA pixels
```

## Files Reference
- `src/main/scrapers/myChart/eunity/imagingDirectDownload.ts` — Direct HTTP download pipeline (CLO files)
- `src/main/scrapers/myChart/eunity/imagingDownloader.ts` — Playwright-based download (export button approach)
- `src/main/scrapers/myChart/eunity/imagingViewer.ts` — SAML chain + session management
- `src/main/scrapers/myChart/eunity/docs/EUNITY_PROTOCOL.md` — Full eUnity protocol reverse engineering notes
- `scripts/clo_to_jpg.py` — WIP Python CLO-to-JPEG converter (being worked on separately)
