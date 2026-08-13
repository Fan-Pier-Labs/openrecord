/**
 * Convert 16-bit grayscale bitmaps to JPEG using sharp.
 *
 * JPEG is inherently 8-bit, so 16-bit input is downsampled internally.
 * Uses quality 100 (maximum JPEG quality) by default.
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import type { Bitmap, Bitmap16 } from "../clo_to_bitmap";
import { encode16bitPng } from "./png16";

export interface JpgOptions {
  /** JPEG quality 1-100. Default: 100 */
  quality?: number;
}

export async function convertBitmap16ToJpg(
  bitmap: Bitmap16,
  options?: JpgOptions,
  outputPath?: string | null,
): Promise<Buffer> {
  const quality = options?.quality ?? 100;

  const png = encode16bitPng(bitmap.pixels, bitmap.width, bitmap.height);
  const buffer = await sharp(png).jpeg({ quality }).toBuffer();

  if (outputPath) {
    writeFileSync(outputPath, buffer);
  }

  return buffer;
}

/**
 * Encode an already-8-bit bitmap to JPEG at quality 100.
 *
 * Kept separate from `convertBitmap16ToJpg` rather than folded into it: this
 * path feeds sharp the 8-bit samples directly, where the 16-bit one goes via a
 * 16-bit PNG. Existing consumers depend on these exact bytes, so the two are
 * deliberately not unified.
 */
export async function convertBitmapToJpg(
  bitmap: Bitmap,
  outputPath?: string | null,
): Promise<Buffer> {
  const img = sharp(
    Buffer.from(bitmap.pixels.buffer, bitmap.pixels.byteOffset, bitmap.pixels.byteLength),
    { raw: { width: bitmap.width, height: bitmap.height, channels: 1 } },
  );
  const buffer = await img.jpeg({ quality: 100 }).toBuffer();
  if (outputPath) writeFileSync(outputPath, buffer);
  return buffer;
}
