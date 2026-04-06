import { describe, it, expect } from "bun:test";
import { existsSync, unlinkSync } from "fs";
import sharp from "sharp";
import { deflateSync, inflateSync } from "zlib";

import {
  convertCloToBitmap,
  convertCloToBitmap16,
  to8bit,
  to16bit,
} from "./clo_to_bitmap";
import type { Bitmap16 } from "./clo_to_bitmap";
import { convertBitmap16ToJpg } from "./exporters/to_jpg";
import { convertBitmap16ToPng } from "./exporters/to_png";
import { convertBitmap16ToAvif } from "./exporters/to_avif";
import { convertBitmap16ToTiff } from "./exporters/to_tiff";
import { convertBitmap16ToWebp } from "./exporters/to_webp";
import { encode16bitPng } from "./exporters/png16";
import {
  encodePixelFile,
  encodeWrapperFile,
  generateGradientH,
  generateCheckerboard,
} from "./generate_clo";

// Helper: create a Bitmap16 from a Uint16Array
function makeBitmap16(pixels: Uint16Array, width: number, height: number): Bitmap16 {
  return { pixels, width, height };
}

// Helper: create a test bitmap from synthetic CLO data
function makeTestBitmap16(): Bitmap16 {
  const w = 512, h = 512;
  const img = generateGradientH(w, h);
  const pixelData = encodePixelFile(img, w, h);
  const wrapperData = encodeWrapperFile({
    photometricInterpretation: "MONOCHROME2",
    bitsStored: 16,
    windowCenter: 32768,
    windowWidth: 65536,
  });
  return convertCloToBitmap16(Buffer.from(pixelData), Buffer.from(wrapperData));
}

// Helper: read 16-bit pixel values from a PNG buffer
function readPng16Pixels(pngBuf: Buffer): { pixels: number[]; bitDepth: number; width: number; height: number } {
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Buffer[] = [];

  while (pos < pngBuf.length) {
    const len = pngBuf.readUInt32BE(pos);
    const type = pngBuf.subarray(pos + 4, pos + 8).toString("ascii");
    if (type === "IHDR") {
      width = pngBuf.readUInt32BE(pos + 8);
      height = pngBuf.readUInt32BE(pos + 12);
      bitDepth = pngBuf[pos + 8 + 8];
      colorType = pngBuf[pos + 8 + 9];
    }
    if (type === "IDAT") {
      idatChunks.push(pngBuf.subarray(pos + 8, pos + 8 + len));
    }
    pos += 8 + len + 4;
  }

  const decompressed = inflateSync(Buffer.concat(idatChunks));
  const pixels: number[] = [];
  const bytesPerPixel = bitDepth === 16 ? 2 : 1;
  const rowSize = 1 + width * bytesPerPixel;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const offset = r * rowSize + 1 + c * bytesPerPixel;
      if (bitDepth === 16) {
        pixels.push(decompressed.readUInt16BE(offset));
      } else {
        pixels.push(decompressed[offset]);
      }
    }
  }

  return { pixels, bitDepth, width, height };
}

// ==================== encode16bitPng ====================

describe("encode16bitPng", () => {
  it("produces valid 16-bit grayscale PNG", () => {
    const pixels = new Uint16Array([0, 32768, 65535, 16384]);
    const png = encode16bitPng(pixels, 4, 1);
    const result = readPng16Pixels(png);
    expect(result.bitDepth).toBe(16);
    expect(result.width).toBe(4);
    expect(result.height).toBe(1);
    expect(result.pixels).toEqual([0, 32768, 65535, 16384]);
  });

  it("round-trips through sharp correctly", async () => {
    const pixels = new Uint16Array([0, 21845, 43690, 65535]);
    const png = encode16bitPng(pixels, 4, 1);

    const { data, info } = await sharp(png)
      .pipelineColourspace("grey16")
      .toColourspace("grey16")
      .raw({ depth: "ushort" })
      .toBuffer({ resolveWithObject: true });

    expect(info.channels).toBe(1);
    expect(info.depth).toBe("ushort");
    for (let i = 0; i < 4; i++) {
      expect(data.readUInt16LE(i * 2)).toBe(pixels[i]);
    }
  });

  it("handles multi-row images", () => {
    const pixels = new Uint16Array([100, 200, 300, 400, 500, 600]);
    const png = encode16bitPng(pixels, 3, 2);
    const result = readPng16Pixels(png);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(result.pixels).toEqual([100, 200, 300, 400, 500, 600]);
  });
});

// ==================== convertCloToBitmap16 ====================

describe("convertCloToBitmap16", () => {
  it("returns correct dimensions from synthetic CLO", () => {
    const bitmap16 = makeTestBitmap16();
    expect(bitmap16.width).toBe(512);
    expect(bitmap16.height).toBe(512);
    expect(bitmap16.pixels).toBeInstanceOf(Uint16Array);
    expect(bitmap16.pixels.length).toBe(512 * 512);
  });

  it("pixel values are in 0-65535 range with full range utilization", () => {
    const bitmap16 = makeTestBitmap16();
    let min = 65535, max = 0;
    for (let i = 0; i < bitmap16.pixels.length; i++) {
      if (bitmap16.pixels[i] < min) min = bitmap16.pixels[i];
      if (bitmap16.pixels[i] > max) max = bitmap16.pixels[i];
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(65535);
    expect(max).toBe(65535);
  });

  it("16-bit downsampled to 8-bit matches native 8-bit bitmap", () => {
    const w = 512, h = 512;
    const img = generateGradientH(w, h);
    const pixelData = Buffer.from(encodePixelFile(img, w, h));
    const wrapperData = Buffer.from(encodeWrapperFile({
      photometricInterpretation: "MONOCHROME2",
      bitsStored: 16,
      windowCenter: 32768,
      windowWidth: 65536,
    }));

    const bitmap8 = convertCloToBitmap(pixelData, wrapperData);
    const bitmap16 = convertCloToBitmap16(pixelData, wrapperData);

    // Downsample 16-bit to 8-bit and compare
    const downsampled = to8bit(bitmap16.pixels, false);
    let maxDiff = 0;
    for (let i = 0; i < bitmap8.pixels.length; i++) {
      const diff = Math.abs(downsampled[i] - bitmap8.pixels[i]);
      if (diff > maxDiff) maxDiff = diff;
    }
    // Should match within ±1 due to double normalization rounding
    expect(maxDiff).toBeLessThanOrEqual(1);
  }, 30000);
});

// ==================== to16bit ====================

describe("to16bit", () => {
  it("scales to 0-65535 range", () => {
    const input = new Uint16Array([0, 500, 1000]);
    const result = to16bit(input, false);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(32768);
    expect(result[2]).toBe(65535);
  });

  it("inverts when requested", () => {
    const input = new Uint16Array([0, 500, 1000]);
    const result = to16bit(input, true);
    expect(result[0]).toBe(65535);
    expect(result[2]).toBe(0);
  });
});

// ==================== convertBitmap16ToJpg ====================

describe("convertBitmap16ToJpg", () => {
  it("produces valid JPEG buffer", async () => {
    const bitmap16 = makeTestBitmap16();
    const jpgBuffer = await convertBitmap16ToJpg(bitmap16);
    expect(Buffer.isBuffer(jpgBuffer)).toBe(true);
    const meta = await sharp(jpgBuffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 30000);

  it("respects quality parameter", async () => {
    const bitmap16 = makeTestBitmap16();
    const q100 = await convertBitmap16ToJpg(bitmap16, { quality: 100 });
    const q10 = await convertBitmap16ToJpg(bitmap16, { quality: 10 });
    // Higher quality should produce larger file
    expect(q100.length).toBeGreaterThan(q10.length);
  }, 30000);

  it("writes to disk when outputPath given", async () => {
    const out = "/tmp/test_bitmap16_to_jpg.jpg";
    const bitmap16 = makeTestBitmap16();
    await convertBitmap16ToJpg(bitmap16, undefined, out);
    expect(existsSync(out)).toBe(true);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    unlinkSync(out);
  }, 30000);
});

// ==================== convertBitmap16ToPng ====================

describe("convertBitmap16ToPng", () => {
  it("produces 16-bit PNG by default", async () => {
    const bitmap16 = makeBitmap16(new Uint16Array([0, 32768, 65535, 16384]), 4, 1);
    const pngBuffer = await convertBitmap16ToPng(bitmap16);
    const result = readPng16Pixels(pngBuffer);
    expect(result.bitDepth).toBe(16);
    expect(result.pixels).toEqual([0, 32768, 65535, 16384]);
  });

  it("16-bit PNG is truly lossless", async () => {
    const bitmap16 = makeTestBitmap16();
    const pngBuffer = await convertBitmap16ToPng(bitmap16);

    // Read back via manual PNG parser
    const result = readPng16Pixels(pngBuffer);
    expect(result.width).toBe(bitmap16.width);
    expect(result.height).toBe(bitmap16.height);

    let mismatches = 0;
    for (let i = 0; i < bitmap16.pixels.length; i++) {
      if (result.pixels[i] !== bitmap16.pixels[i]) mismatches++;
    }
    expect(mismatches).toBe(0);
  }, 30000);

  it("produces 8-bit PNG when bitdepth is 8", async () => {
    const bitmap16 = makeTestBitmap16();
    const pngBuffer = await convertBitmap16ToPng(bitmap16, { bitdepth: 8 });
    const meta = await sharp(pngBuffer).metadata();
    expect(meta.depth).toBe("uchar");
  }, 30000);

  it("writes to disk when outputPath given", async () => {
    const out = "/tmp/test_bitmap16_to_png.png";
    const bitmap16 = makeBitmap16(new Uint16Array([0, 65535, 32768, 16384]), 2, 2);
    await convertBitmap16ToPng(bitmap16, undefined, out);
    expect(existsSync(out)).toBe(true);
    unlinkSync(out);
  });
});

// ==================== convertBitmap16ToAvif ====================

describe("convertBitmap16ToAvif", () => {
  it("produces valid AVIF buffer", async () => {
    const bitmap16 = makeTestBitmap16();
    const avifBuffer = await convertBitmap16ToAvif(bitmap16);
    expect(Buffer.isBuffer(avifBuffer)).toBe(true);
    const meta = await sharp(avifBuffer).metadata();
    expect(meta.format).toBe("heif");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 30000);

  it("lossless AVIF round-trips with acceptable precision", async () => {
    const bitmap16 = makeTestBitmap16();
    const avifBuffer = await convertBitmap16ToAvif(bitmap16, { lossless: true });

    // Read back as 8-bit grayscale
    const { data } = await sharp(avifBuffer).grayscale().raw().toBuffer({ resolveWithObject: true });
    const decoded = new Uint8Array(data);

    // Compare to 8-bit downsampled version of original
    const expected8 = to8bit(bitmap16.pixels, false);
    let maxDiff = 0;
    for (let i = 0; i < decoded.length; i++) {
      const diff = Math.abs(decoded[i] - expected8[i]);
      if (diff > maxDiff) maxDiff = diff;
    }
    // Lossless AVIF should be very close (±1 from 16→8 rounding)
    expect(maxDiff).toBeLessThanOrEqual(2);
  }, 30000);

  it("writes to disk when outputPath given", async () => {
    const out = "/tmp/test_bitmap16_to_avif.avif";
    const bitmap16 = makeTestBitmap16();
    await convertBitmap16ToAvif(bitmap16, undefined, out);
    expect(existsSync(out)).toBe(true);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("heif");
    unlinkSync(out);
  }, 30000);
});

// ==================== convertBitmap16ToTiff ====================

describe("convertBitmap16ToTiff", () => {
  it("produces valid 16-bit TIFF by default", async () => {
    const bitmap16 = makeTestBitmap16();
    const tiffBuffer = await convertBitmap16ToTiff(bitmap16);
    expect(Buffer.isBuffer(tiffBuffer)).toBe(true);
    const meta = await sharp(tiffBuffer).metadata();
    expect(meta.format).toBe("tiff");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
    expect(meta.depth).toBe("ushort");
    expect(meta.bitsPerSample).toBe(16);
  }, 30000);

  it("16-bit TIFF is lossless", async () => {
    const bitmap16 = makeTestBitmap16();
    const tiffBuffer = await convertBitmap16ToTiff(bitmap16);

    // Read back as 16-bit
    const { data } = await sharp(tiffBuffer)
      .pipelineColourspace("grey16")
      .toColourspace("grey16")
      .raw({ depth: "ushort" })
      .toBuffer({ resolveWithObject: true });

    let mismatches = 0;
    for (let i = 0; i < bitmap16.pixels.length; i++) {
      const val = data.readUInt16LE(i * 2);
      if (val !== bitmap16.pixels[i]) mismatches++;
    }
    expect(mismatches).toBe(0);
  }, 30000);

  it("produces 8-bit TIFF when bitdepth is 8", async () => {
    const bitmap16 = makeTestBitmap16();
    const tiffBuffer = await convertBitmap16ToTiff(bitmap16, { bitdepth: 8 });
    const meta = await sharp(tiffBuffer).metadata();
    expect(meta.depth).toBe("uchar");
  }, 30000);

  it("supports deflate compression", async () => {
    const bitmap16 = makeTestBitmap16();
    const tiffBuffer = await convertBitmap16ToTiff(bitmap16, { compression: "deflate" });
    const meta = await sharp(tiffBuffer).metadata();
    expect(meta.format).toBe("tiff");
  }, 30000);

  it("writes to disk when outputPath given", async () => {
    const out = "/tmp/test_bitmap16_to_tiff.tiff";
    const bitmap16 = makeTestBitmap16();
    await convertBitmap16ToTiff(bitmap16, undefined, out);
    expect(existsSync(out)).toBe(true);
    unlinkSync(out);
  }, 30000);
});

// ==================== convertBitmap16ToWebp ====================

describe("convertBitmap16ToWebp", () => {
  it("produces valid WebP buffer", async () => {
    const bitmap16 = makeTestBitmap16();
    const webpBuffer = await convertBitmap16ToWebp(bitmap16);
    expect(Buffer.isBuffer(webpBuffer)).toBe(true);
    const meta = await sharp(webpBuffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(512);
  }, 30000);
});
