/**
 * Convert 16-bit grayscale bitmaps to lossless WebP using sharp.
 *
 * WebP is limited to 8-bit per channel. For higher bit depths, use AVIF
 * or PNG instead.
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import type { Bitmap, Bitmap16 } from "../clo_to_bitmap";
import { encode16bitPng } from "./png16";

export async function convertBitmap16ToWebp(
  bitmap: Bitmap16,
  outputPath?: string | null,
): Promise<Buffer> {
  const png = encode16bitPng(bitmap.pixels, bitmap.width, bitmap.height);
  const buffer = await sharp(png).webp({ lossless: true }).toBuffer();

  if (outputPath) {
    writeFileSync(outputPath, buffer);
  }

  return buffer;
}

/**
 * Encode an already-8-bit bitmap to lossless WebP.
 *
 * As with `convertBitmapToJpg`, this feeds sharp the 8-bit samples directly
 * rather than round-tripping through a 16-bit PNG, and existing consumers
 * depend on those exact bytes.
 */
export async function convertBitmapToWebp(
  bitmap: Bitmap,
  outputPath?: string | null,
): Promise<Buffer> {
  const img = sharp(
    Buffer.from(bitmap.pixels.buffer, bitmap.pixels.byteOffset, bitmap.pixels.byteLength),
    { raw: { width: bitmap.width, height: bitmap.height, channels: 1 } },
  );
  const buffer = await img.webp({ lossless: true }).toBuffer();
  if (outputPath) writeFileSync(outputPath, buffer);
  return buffer;
}
