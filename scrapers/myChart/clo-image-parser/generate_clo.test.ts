import { describe, it, expect } from "bun:test";
import { unlinkSync } from "fs";
import sharp from "sharp";
import {
  AMF3Writer,
  zigzagEncode,
  forwardHaarLevel,
  encodePixelFile,
  encodeWrapperFile,
  generateGradientH,
  generateGradientV,
  generateCheckerboard,
  generateCircle,
  generateDiagonal,
} from "./generate_clo";
import {
  AMF3Reader,
  parsePixelHeader,
  parseWrapper,
  extractTiles,
  tileKey,
  parseTileKey,
  zigzagDecode,
  convertCloToBitmap,
  convertCloToJpg,
} from "./clo_to_jpg";

// ==================== AMF3Writer ====================

describe("AMF3Writer", () => {
  it("writes and reads back integer", () => {
    const writer = new AMF3Writer();
    writer.writeValue(42);
    const reader = new AMF3Reader(writer.getBuffer());
    expect(reader.readValue()).toBe(42);
  });

  it("writes and reads back double", () => {
    const writer = new AMF3Writer();
    writer.writeValue(3.14);
    const reader = new AMF3Reader(writer.getBuffer());
    expect(reader.readValue()).toBeCloseTo(3.14);
  });

  it("writes and reads back string", () => {
    const writer = new AMF3Writer();
    writer.writeValue("hello world");
    const reader = new AMF3Reader(writer.getBuffer());
    expect(reader.readValue()).toBe("hello world");
  });

  it("writes and reads back boolean values", () => {
    const writer = new AMF3Writer();
    writer.writeValue(true);
    writer.writeValue(false);
    const reader = new AMF3Reader(writer.getBuffer());
    expect(reader.readValue()).toBe(true);
    expect(reader.readValue()).toBe(false);
  });

  it("writes and reads back null", () => {
    const writer = new AMF3Writer();
    writer.writeValue(null);
    const reader = new AMF3Reader(writer.getBuffer());
    expect(reader.readValue()).toBeNull();
  });

  it("writes and reads back object with mixed types", () => {
    const writer = new AMF3Writer();
    writer.writeValue({
      _class: "TestClass",
      name: "test",
      count: 42,
      ratio: 1.5,
    });
    const reader = new AMF3Reader(writer.getBuffer());
    const result = reader.readValue();
    expect(result._class).toBe("TestClass");
    expect(result.name).toBe("test");
    expect(result.count).toBe(42);
    expect(result.ratio).toBe(1.5);
  });
});

// ==================== zigzagEncode ====================

describe("zigzagEncode", () => {
  it("encodes known values", () => {
    const input = new Int32Array([0, -1, 1, -2, 2, -3]);
    const result = zigzagEncode(input);
    expect(Array.from(result)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("round-trips with zigzagDecode", () => {
    const original = new Int32Array([0, -1, 1, -50, 50, -32768, 32767]);
    const encoded = zigzagEncode(original);
    const decoded = zigzagDecode(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it("handles empty input", () => {
    expect(zigzagEncode(new Int32Array(0)).length).toBe(0);
  });
});

// ==================== forwardHaarLevel ====================

describe("forwardHaarLevel", () => {
  it("produces expected LL for uniform image", () => {
    // A uniform 4x4 image should produce LL = same value, details = 0
    const img = new Uint16Array(16).fill(1000);
    const result = forwardHaarLevel(img, 4, 4, 2, 2);
    for (let i = 0; i < 4; i++) {
      expect(result.ll[i]).toBe(1000);
      expect(result.lh[i]).toBe(0);
      expect(result.hl[i]).toBe(0);
      expect(result.hh[i]).toBe(0);
    }
  });

  it("produces non-zero details for non-uniform image", () => {
    // Simple 4x4 image with variation
    const img = new Uint16Array([
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160,
    ]);
    const result = forwardHaarLevel(img, 4, 4, 2, 2);
    // There should be detail coefficients
    let hasDetail = false;
    for (let i = 0; i < 4; i++) {
      if (result.lh[i] !== 0 || result.hl[i] !== 0 || result.hh[i] !== 0) {
        hasDetail = true;
        break;
      }
    }
    expect(hasDetail).toBe(true);
  });
});

// ==================== parsePixelHeader on encoded files ====================

describe("encodePixelFile header", () => {
  it("produces valid CLOCLHAAR header for 512x512", () => {
    const img = generateGradientH(512, 512);
    const data = encodePixelFile(img, 512, 512);
    const header = parsePixelHeader(Buffer.from(data));
    expect(header.width).toBe(512);
    expect(header.height).toBe(512);
  });

  it("produces valid header for odd dimensions (510x510)", () => {
    const img = generateDiagonal(510, 510);
    const data = encodePixelFile(img, 510, 510);
    const header = parsePixelHeader(Buffer.from(data));
    expect(header.width).toBe(510);
    expect(header.height).toBe(510);
  });
});

// ==================== extractTiles on encoded files ====================

describe("extractTiles on encoded files", () => {
  it("extracts LL and detail tiles for 512x512", () => {
    const img = generateGradientH(512, 512);
    const data = encodePixelFile(img, 512, 512);
    const tiles = extractTiles(Buffer.from(data));

    // Should have LL (group -1) blocks
    expect(tiles.has(tileKey(-1, 0, 0, 0))).toBe(true);
    expect(tiles.has(tileKey(-1, 0, 0, 65536))).toBe(true);

    // Should have detail (group 0) blocks
    expect(tiles.has(tileKey(0, 0, 0, 1))).toBe(true); // LH LSB
    expect(tiles.has(tileKey(0, 0, 0, 65537))).toBe(true); // LH MSB
    expect(tiles.has(tileKey(0, 0, 0, 2))).toBe(true); // HL LSB
    expect(tiles.has(tileKey(0, 0, 0, 65538))).toBe(true); // HL MSB
    expect(tiles.has(tileKey(0, 0, 0, 3))).toBe(true); // HH LSB
    expect(tiles.has(tileKey(0, 0, 0, 65539))).toBe(true); // HH MSB
    expect(tiles.has(tileKey(0, 0, 0, 4))).toBe(true); // overflow
  });
});

// ==================== parseWrapper on encoded files ====================

describe("encodeWrapperFile", () => {
  it("produces valid CLOHEADERZ01 wrapper", () => {
    const wrapper = encodeWrapperFile({
      photometricInterpretation: "MONOCHROME2",
      bitsStored: 16,
      windowCenter: 32768,
      windowWidth: 65536,
    });
    const metadata = parseWrapper(Buffer.from(wrapper));
    expect(metadata.photometric).toBe("MONOCHROME2");
    expect(metadata.bits_stored).toBe(16);
    expect(metadata.window_center).toBe(32768);
    expect(metadata.window_width).toBe(65536);
  });

  it("handles MONOCHROME1 photometric", () => {
    const wrapper = encodeWrapperFile({
      photometricInterpretation: "MONOCHROME1",
      bitsStored: 12,
    });
    const metadata = parseWrapper(Buffer.from(wrapper));
    expect(metadata.photometric).toBe("MONOCHROME1");
    expect(metadata.bits_stored).toBe(12);
  });
});

// ==================== Full round-trip tests ====================

describe("encode → decode round-trip", () => {
  const ROUND_TRIP_WRAPPER = {
    photometricInterpretation: "MONOCHROME2",
    bitsStored: 16,
    windowCenter: 32768,
    windowWidth: 65536,
  } as const;

  /**
   * Compute the 8-bit pixels the display pipeline should produce from the
   * original 16-bit image, so the codec is measured against the source rather
   * than against itself.
   *   windowing (applyVoiLut): (v - 0) / 65536 * 65535
   *   to8bit:                  v / maxV * 255
   */
  function expected8bit(img: Uint16Array, width: number, height: number): Uint8Array {
    let maxWindowed = 1;
    const windowed = new Uint16Array(width * height);
    for (let i = 0; i < width * height; i++) {
      windowed[i] = Math.max(
        0,
        Math.min(65535, Math.round((img[i] / 65536) * 65535))
      );
      if (windowed[i] > maxWindowed) maxWindowed = windowed[i];
    }
    const result = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      result[i] = Math.round((windowed[i] / maxWindowed) * 255);
    }
    return result;
  }

  function compare(
    actual: Uint8Array,
    expected: Uint8Array
  ): { maxDiff: number; exactPct: number } {
    let maxDiff = 0;
    let exact = 0;
    for (let i = 0; i < expected.length; i++) {
      const diff = Math.abs(actual[i] - expected[i]);
      if (diff > maxDiff) maxDiff = diff;
      if (diff === 0) exact++;
    }
    return { maxDiff, exactPct: (exact / expected.length) * 100 };
  }

  /**
   * Encode to CLO and decode straight back to a bitmap. This is the codec
   * itself — the CLOCLHAAR container, the zigzag/overflow bit packing and the
   * Haar lift/unlift — with no image codec in between, so it is exact and is
   * asserted as such.
   */
  function roundTripTest(
    img: Uint16Array,
    width: number,
    height: number
  ): { maxDiff: number; exactPct: number } {
    const pixelData = encodePixelFile(img, width, height);
    const wrapperData = encodeWrapperFile(ROUND_TRIP_WRAPPER);

    const bitmap = convertCloToBitmap(
      Buffer.from(pixelData),
      Buffer.from(wrapperData)
    );

    expect(bitmap.width).toBe(width);
    expect(bitmap.height).toBe(height);

    return compare(bitmap.pixels, expected8bit(img, width, height));
  }

  it("horizontal gradient 512x512 is lossless", () => {
    const result = roundTripTest(generateGradientH(512, 512), 512, 512);
    expect(result.maxDiff).toBe(0);
    expect(result.exactPct).toBe(100);
  }, 30000);

  it("vertical gradient 512x512 is lossless", () => {
    const result = roundTripTest(generateGradientV(512, 512), 512, 512);
    expect(result.maxDiff).toBe(0);
    expect(result.exactPct).toBe(100);
  }, 30000);

  it("checkerboard 512x512 is lossless", () => {
    const result = roundTripTest(generateCheckerboard(512, 512), 512, 512);
    expect(result.maxDiff).toBe(0);
    expect(result.exactPct).toBe(100);
  }, 30000);

  it("circle 512x512 is lossless", () => {
    const result = roundTripTest(generateCircle(512, 512), 512, 512);
    expect(result.maxDiff).toBe(0);
    expect(result.exactPct).toBe(100);
  }, 30000);

  it("diagonal 510x510 (odd subbands) is lossless", () => {
    // 510 halves to a 255x255 subband, so this exercises the odd-width /
    // odd-height branches of the lift and unlift interleaving.
    const result = roundTripTest(generateDiagonal(510, 510), 510, 510);
    expect(result.maxDiff).toBe(0);
    expect(result.exactPct).toBe(100);
  }, 30000);

  /**
   * The same round-trip taken all the way through convertCloToJpg, which
   * encodes the decoded bitmap as JPEG (note: it only special-cases `.webp`,
   * so every other extension gets JPEG bytes regardless of its name).
   *
   * Tolerance is 1, not 0, and that is a property of JPEG rather than of this
   * codec: even at quality 100 libjpeg still does a DCT with quantisation, so
   * the forward/inverse transform rounds. Axis-aligned content survives it
   * exactly — a flat gradient and a 32px checkerboard aligned to the 8x8 DCT
   * grid are represented by a handful of coefficients that happen to round
   * back cleanly — while curved and diagonal edges spread energy across the
   * whole block and come back +/-1 on a few percent of pixels. The codec
   * itself is bit-exact for these same images; that is what the tests above
   * assert against convertCloToBitmap.
   */
  const JPEG_Q100_TOLERANCE = 1;

  it("survives the JPEG export path within JPEG's own rounding", async () => {
    const cases: [string, Uint16Array, number, number][] = [
      ["circle", generateCircle(512, 512), 512, 512],
      ["diag", generateDiagonal(510, 510), 510, 510],
    ];

    for (const [name, img, width, height] of cases) {
      const pixelData = encodePixelFile(img, width, height);
      const wrapperData = encodeWrapperFile(ROUND_TRIP_WRAPPER);

      const outPath = `/tmp/test_generate_clo_${name}.jpg`;
      await convertCloToJpg({
        pixelData: Buffer.from(pixelData),
        outputPath: outPath,
        wrapperData: Buffer.from(wrapperData),
      });

      const { data, info } = await sharp(outPath)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      unlinkSync(outPath);

      expect(info.width).toBe(width);
      expect(info.height).toBe(height);

      const result = compare(new Uint8Array(data), expected8bit(img, width, height));
      expect(result.maxDiff).toBeLessThanOrEqual(JPEG_Q100_TOLERANCE);
      // The overwhelming majority of pixels still come back exact; a wavelet
      // bug would blow well past this, where JPEG rounding alone does not.
      expect(result.exactPct).toBeGreaterThan(95);
    }
  }, 30000);

  it("returns JPEG buffer when outputPath is null", async () => {
    const img = generateCheckerboard(512, 512);
    const pixelData = encodePixelFile(img, 512, 512);
    const wrapperData = encodeWrapperFile({
      photometricInterpretation: "MONOCHROME2",
      bitsStored: 16,
      windowCenter: 32768,
      windowWidth: 65536,
    });

    const result = await convertCloToJpg({
      pixelData: Buffer.from(pixelData),
      wrapperData: Buffer.from(wrapperData),
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    const meta = await sharp(result as Buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 30000);
});
