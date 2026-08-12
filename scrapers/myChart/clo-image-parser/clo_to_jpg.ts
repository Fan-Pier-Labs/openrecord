#!/usr/bin/env bun
/**
 * Convert eUnity CLO (ClientOutlook) image files to various formats.
 *
 * Thin wrapper that composes clo_to_bitmap + exporters.
 * Kept for backward compatibility and CLI usage.
 *
 * Usage:
 *   bun scripts/clo_to_jpg/clo_to_jpg.ts <input.clo> [output.jpg]
 *   bun scripts/clo_to_jpg/clo_to_jpg.ts <directory_with_clo_files> [output_directory]
 */

import { readFileSync, existsSync, mkdirSync, statSync, readdirSync } from "fs";
import { join, basename, extname, dirname } from "path";

import { convertCloToBitmap, convertCloToBitmap16 } from "./clo_to_bitmap";
import { convertBitmap16ToJpg } from "./exporters/to_jpg";
import { convertBitmap16ToPng } from "./exporters/to_png";
import { convertBitmap16ToAvif } from "./exporters/to_avif";
import { convertBitmap16ToTiff } from "./exporters/to_tiff";
import { convertBitmap16ToWebp } from "./exporters/to_webp";

// Re-export everything from clo_to_bitmap for backward compatibility
export {
  AMF3Reader,
  parsePixelHeader,
  parseWrapper,
  extractTiles,
  tileKey,
  parseTileKey,
  computeWaveletLevels,
  zigzagDecode,
  to8bit,
  to16bit,
  applyVoiLut,
  convertCloToBitmap,
  convertCloToBitmap16,
} from "./clo_to_bitmap";
export type { Bitmap, Bitmap16, CloMetadata, TileKey, TileMap } from "./clo_to_bitmap";

// Re-export all exporters
export { convertBitmap16ToJpg } from "./exporters/to_jpg";
export type { JpgOptions } from "./exporters/to_jpg";
export { convertBitmap16ToPng } from "./exporters/to_png";
export type { PngOptions } from "./exporters/to_png";
export { convertBitmap16ToAvif } from "./exporters/to_avif";
export type { AvifOptions } from "./exporters/to_avif";
export { convertBitmap16ToTiff } from "./exporters/to_tiff";
export type { TiffOptions } from "./exporters/to_tiff";
export { convertBitmap16ToWebp } from "./exporters/to_webp";

// Backward-compatible re-exports for existing consumers.
// These use sharp directly with 8-bit input to maintain exact pixel-level
// compatibility with the original bitmap_to_jpg.ts and bitmap_to_webp.ts.
import sharp from "sharp";
import { writeFileSync } from "fs";
import type { Bitmap } from "./clo_to_bitmap";
import { logger } from '../../../shared/logger';

export async function convertBitmapToJpg(
  bitmap: Bitmap,
  outputPath?: string | null,
): Promise<Buffer> {
  const img = sharp(Buffer.from(bitmap.pixels.buffer, bitmap.pixels.byteOffset, bitmap.pixels.byteLength), {
    raw: { width: bitmap.width, height: bitmap.height, channels: 1 },
  });
  const buffer = await img.jpeg({ quality: 100 }).toBuffer();
  if (outputPath) writeFileSync(outputPath, buffer);
  return buffer;
}

export async function convertBitmapToWebp(
  bitmap: Bitmap,
  outputPath?: string | null,
): Promise<Buffer> {
  const img = sharp(Buffer.from(bitmap.pixels.buffer, bitmap.pixels.byteOffset, bitmap.pixels.byteLength), {
    raw: { width: bitmap.width, height: bitmap.height, channels: 1 },
  });
  const buffer = await img.webp({ lossless: true }).toBuffer();
  if (outputPath) writeFileSync(outputPath, buffer);
  return buffer;
}

const CLOCLHAAR_MAGIC = Buffer.from("CLOCLHAAR###");

// ==================== Convenience wrapper ====================

/** Extensions `convertCloToJpg` knows how to write, for its error message. */
const SUPPORTED_OUTPUT_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".tif",
  ".tiff",
] as const;

/**
 * Decode a CLO image and write it out in the format named by `outputPath`'s
 * extension, or return a JPEG buffer when no path is given.
 *
 * **The extension decides the format.** This used to special-case `.webp` and
 * send every other extension to the JPEG encoder, so `out.png` got JPEG bytes
 * under a PNG name — a file that opens fine in every viewer (they sniff the
 * magic, not the name) right up until something trusts the extension. It also
 * meant the `.png`, `.avif` and `.tiff` exporters sitting next to this function
 * were unreachable through it.
 *
 * An unrecognised extension now throws rather than guessing. Silently writing
 * one format under another name is the bug being fixed here, and picking JPEG
 * for `.gif` would just be the same bug with a smaller blast radius.
 *
 * JPEG and WebP keep going through the 8-bit `convertBitmapTo*` helpers, whose
 * byte-for-byte output some callers depend on. The formats that can carry more
 * than 8 bits decode straight to 16-bit and keep it — a PNG of a 16-bit medical
 * image should not be quantised to 256 levels on the way out.
 */
export async function convertCloToJpg(opts: {
  pixelData: string | Buffer;
  wrapperData?: string | Buffer;
  outputPath?: string | null;
}): Promise<Buffer | string> {
  const outputPath = opts.outputPath ?? null;
  if (outputPath === null) {
    return await convertBitmapToJpg(
      convertCloToBitmap(opts.pixelData, opts.wrapperData),
    );
  }

  // Only one branch runs, so the file is decoded exactly once either way.
  const decode8 = () => convertCloToBitmap(opts.pixelData, opts.wrapperData);
  const decode16 = () => convertCloToBitmap16(opts.pixelData, opts.wrapperData);

  const ext = extname(outputPath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      await convertBitmapToJpg(decode8(), outputPath);
      break;
    case ".webp":
      await convertBitmapToWebp(decode8(), outputPath);
      break;
    case ".png":
      await convertBitmap16ToPng(decode16(), undefined, outputPath);
      break;
    case ".avif":
      await convertBitmap16ToAvif(decode16(), undefined, outputPath);
      break;
    case ".tif":
    case ".tiff":
      await convertBitmap16ToTiff(decode16(), undefined, outputPath);
      break;
    default:
      throw new Error(
        `convertCloToJpg: unsupported output extension ${ext || "(none)"} for ${outputPath}. ` +
          `Supported: ${SUPPORTED_OUTPUT_EXTENSIONS.join(", ")}. ` +
          `Omit outputPath to get a JPEG buffer back instead.`,
      );
  }

  return outputPath;
}

// ==================== CLI helpers ====================

function findCloPairs(directory: string): [string, string | undefined][] {
  const pairs: [string, string | undefined][] = [];
  const files = readdirSync(directory, { recursive: true }) as string[];

  const pixelFiles = files
    .filter((f) => f.endsWith("_pixel.clo"))
    .map((f) => join(directory, f))
    .sort();

  for (const pixelPath of pixelFiles) {
    const wrapperPath = pixelPath.replace("_pixel.clo", "_wrapper.clo");
    pairs.push([pixelPath, existsSync(wrapperPath) ? wrapperPath : undefined]);
  }

  const standalone = files
    .filter((f) => f.endsWith(".clo") && !f.endsWith("_pixel.clo") && !f.endsWith("_wrapper.clo"))
    .map((f) => join(directory, f))
    .sort();

  for (const path of standalone) {
    try {
      const magic = readFileSync(path, { encoding: null }).subarray(0, 12);
      if (magic.compare(CLOCLHAAR_MAGIC) === 0) {
        pairs.push([path, undefined]);
      }
    } catch (err) {
      logger.warn(`[clo_to_jpg] Failed to read ${path}:`, (err as Error).message);
    }
  }

  return pairs;
}

// ==================== CLI ====================

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    logger.error("Usage: bun clo_to_jpg.ts <input.clo|directory> [output.jpg|directory]");
    process.exit(1);
  }

  const input = args[0];
  const output = args[1] && !args[1].startsWith("--") ? args[1] : undefined;

  if (statSync(input).isDirectory()) {
    const pairs = findCloPairs(input);
    if (pairs.length === 0) {
      logger.error(`No CLO pixel files found in ${input}`);
      process.exit(1);
    }

    const outputDir = output || input;
    mkdirSync(outputDir, { recursive: true });

    for (const [pixelPath, wrapperPath] of pairs) {
      const stem = basename(pixelPath).replace("_pixel.clo", "").replace(".clo", "");
      const outputPath = join(outputDir, `${stem}.jpg`);
      try {
        await convertCloToJpg({ pixelData: pixelPath, outputPath, wrapperData: wrapperPath });
        logger.debug(`Converted: ${pixelPath} -> ${outputPath}`);
      } catch (e) {
        logger.error(`Failed: ${pixelPath}: ${e}`);
      }
    }
  } else {
    if (!existsSync(input)) {
      logger.error(`File not found: ${input}`);
      process.exit(1);
    }

    let wrapperPath: string | undefined;
    if (input.endsWith("_pixel.clo")) {
      const wp = input.replace("_pixel.clo", "_wrapper.clo");
      if (existsSync(wp)) wrapperPath = wp;
    }

    const outputPath = output || join(
      dirname(input),
      basename(input).replace("_pixel.clo", "").replace(".clo", "") + ".jpg"
    );

    try {
      const result = await convertCloToJpg({ pixelData: input, outputPath, wrapperData: wrapperPath });
      logger.debug(`Saved: ${result}`);
    } catch (e) {
      logger.error(`Error: ${e}`);
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  main();
}
