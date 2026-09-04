# `clo-image-parser` — turning CLO bytes into images

eUnity does not serve JPEGs. It serves **CLO**, a proprietary format from Mach7
Technologies (formerly Client Outlook) that repackages DICOM for progressive web streaming:
Haar wavelet coefficients under zstd, with the DICOM metadata as zlib-compressed AMF3.
There is no public documentation and no open-source decoder. This was built entirely by
reverse engineering.

| | |
| --- | --- |
| **Source** | [`clo_to_bitmap.ts`](clo_to_bitmap.ts) (decoder) · [`exporters/`](exporters/) (encoders) · [`sortByPatientPosition.ts`](sortByPatientPosition.ts) · [`generate_clo.ts`](generate_clo.ts) (test-fixture encoder) |
| **Format reference** | [`CLO-FORMAT.md`](CLO-FORMAT.md) — headers, subbands, every AMF3 metadata field |
| **Approach notes** | [`CLO_TO_IMAGE_WASM_APPROACH.md`](CLO_TO_IMAGE_WASM_APPROACH.md) — the four options weighed, and why this one won |
| **Getting the bytes** | [`../eunity/`](../eunity/) |

**Decoding and encoding are two steps, on purpose.** `clo_to_bitmap.ts` produces a raw
grayscale bitmap; `exporters/` turns a bitmap into JPEG, PNG, AVIF, TIFF or WebP. Fusing
them into one `clo → jpg` call means every new output format re-implements the decode.
`dev-scripts/clo-to-jpg.ts` is the terminal wrapper that wires both together.

Pure TypeScript — `fzstd` and `zlib`, no `sharp` — so it runs on device in the Expo app as
well as on a server.

## The format, in one screen

Each image is **two files**:

| File | Magic | Contents |
| --- | --- | --- |
| `*_pixel.clo` | `CLOCLHAAR###` | Haar wavelet coefficients, zstd-compressed |
| `*_wrapper.clo` | `CLOHEADERZ01` | zlib-compressed AMF3 — the DICOM metadata |

The pixel file is a 96-byte header, then 16-byte `35FA` marker records (level 2 starts a
resolution group, level 3 gives a tile position, level 5 points at a compressed block), then
the blocks. The image is a **4-level Haar decomposition**: group −1 is the LL approximation
at ~1/16 resolution, groups 0–3 are progressively finer detail subbands tiled at 256×256.
Each subband is two byte planes — LSB in block N, MSB in block 65536+N — combined into
16-bit values.

Decode: parse the header → parse the wrapper for DICOM metadata → extract tiles → assemble
the LL approximation → inverse Haar through each detail level → apply the DICOM display
pipeline → normalize to 8-bit with MONOCHROME1 inversion where the metadata says so.

Everything else — every AMF3 field, the compression variants, the spatial calibration, the
annotation overlays — is in [`CLO-FORMAT.md`](CLO-FORMAT.md).

## What was hard, and how it came out

- **The sign encoding is zigzag.** Detail coefficients are stored as unsigned magnitudes,
  and recovering their signs was the last unsolved piece for a long time — an early Python
  converter gave up and faked detail with edge-adaptive sharpening. Two's complement was
  tried, on the strength of eUnity's own GPU shader (`unpackedValueFromSignedShort`), and
  produced **worse** output with visible checkerboard/tile artifacts: that shader's two's
  complement is for the final pixel display stage, not for wavelet coefficient decoding.
  **Zigzag is correct.** The decoder now reaches a 98%+ pixel-perfect match against the
  eUnity viewer's own export.
- **Windowing needs the modality LUT.** `windowCenter`/`windowWidth` in the wrapper are in
  **output** units (Hounsfield for CT); the reconstructed pixels are **stored** values.
  Apply `stored × slope + intercept` — `rescaleSlope` / `rescaleIntercept` from the wrapper
  — per pixel *before* windowing. Comparing the two directly clips everything above ~125
  with a typical intercept of −1024: soft tissue saturates to white and only air keeps any
  gradation. Wide windows (centre 350, width 2000) still look plausible either way, so this
  is easy to miss. **Window centres are signed**: report and scout frames commonly use −512
  and lung windows sit near −600, so a `> 0` guard drops real values.
- **Slice order has to be reconstructed.** eUnity answers one image per (series, instance)
  pair and the downloader fetches them in parallel batches, so the arriving order is not even
  download order, let alone scan order. Each wrapper carries the DICOM patient position, so
  [`sortByPatientPosition.ts`](sortByPatientPosition.ts) picks the axis the series actually
  travels along and sorts by it. Below 0.1 mm of variation across a series the positions are
  noise or absent, and the original order is kept. It runs in the shared download path, so
  every client gets a readable stack rather than whichever one re-implements it.
- **Text annotations** from the wrapper ("R", "DML") are parsed but not rendered onto the
  image.

## Testing

[`generate_clo.ts`](generate_clo.ts) **encodes** synthetic CLOCLHAAR pixel files, reversing
the decode pipeline, so the decoder is exercised against inputs whose exact pixels are
known. The matching `CLOHEADERZ01` wrapper is written by
[`shared/cloWrapper.ts`](../../../shared/cloWrapper.ts) — the **same encoder fake-mychart
uses to synthesize wrappers at runtime**, so a fixture and a served wrapper can never
disagree about the format.

The AMF3 reader is [`../eunity/amf3Reader.ts`](../eunity/amf3Reader.ts), the repo's only
one, and it is strict. Here a throw is not fatal: wrapper parsing falls back to text-based
photometric detection and slice sorting falls back to the server's order, so the image still
renders and only windowing or slice order degrades — and the fallback logs itself.

## `files-pulled-from-mychart/`

eUnity's **own viewer**, downloaded verbatim off a real instance: the Dart-compiled
`eunityviewer.dart.js`, its worker, and the `LookupWrapper*.wasm` modules. Reference
material for the reverse engineering only — **nothing imports it and none of it ships**. See
[its README](files-pulled-from-mychart/README.md), and
[`PII_FILES_NOT_IN_GIT.md`](PII_FILES_NOT_IN_GIT.md) for the two files alongside it that are
gitignored because they carry real patient identifiers.

## Still open

The wrapper holds complete DICOM metadata and the pixel file holds the original pixel data,
losslessly compressed. **Reconstructing real DICOM files from a CLO pair should be
possible**, and would preserve the full 16-bit dynamic range and all the metadata — far more
useful medically than an 8-bit JPEG.

`clo_to_jpg.py` is the original Python prototype, kept for reference. The TypeScript decoder
supersedes it.
