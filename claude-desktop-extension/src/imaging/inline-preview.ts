/**
 * Size-budgeted previews of an imaging study for the conversation.
 *
 * Claude Desktop rejects any tool result over 1MB, and a single full-size
 * radiograph is ~4MB as a quality-100 JPEG (5.7MB once base64-encoded). So
 * the pictures shown inline are previews: downscaled and re-encoded until the
 * whole set fits under {@link INLINE_BUDGET_BYTES}. Full resolution is what
 * `save_to_downloads` writes to disk, never what goes in the chat.
 *
 * A CT is hundreds of slices, and hundreds of thumbnails is not a useful
 * preview of one, so at most {@link MAX_INLINE_IMAGES} are shown, spread
 * evenly across the study.
 */
import jpegJs from 'jpeg-js';
import type { Bitmap } from '../../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { grayscaleToRgba } from '../../../scrapers/myChart/clo-image-parser/exporters/to_jpg_purejs';
import type { DecodedImage, DecodedStudy, StudyJpeg } from './download-study';

/**
 * Base64 bytes the images may take in one tool result. Claude Desktop's cap is
 * 1MB on the whole result; the rest is headroom for the JSON summary and
 * whatever framing the host adds.
 */
export const INLINE_BUDGET_BYTES = 800 * 1024;
export const MAX_INLINE_IMAGES = 12;
const PREVIEW_QUALITY = 85;
/** Longest-edge sizes to try, largest first; the first that fits the per-image budget wins. */
const EDGE_LADDER = [1400, 1200, 1024, 800, 640, 512, 400];

export interface InlinePreviews {
  images: StudyJpeg[];
  /** True when at least one shown image is smaller than its source. */
  downscaled: boolean;
  errors: string[];
}

/**
 * Shrink a grayscale bitmap so its longest edge is at most `maxEdge`, by
 * averaging each destination pixel's source block. Returns the input untouched
 * when it already fits — a small image must not be blown up or re-sampled.
 */
export function downscale(bitmap: Bitmap, maxEdge: number): Bitmap {
  const { width, height, pixels } = bitmap;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return bitmap;

  const scale = maxEdge / longest;
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(outW * outH);

  for (let y = 0; y < outH; y++) {
    const y0 = Math.floor((y * height) / outH);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / outH));
    for (let x = 0; x < outW; x++) {
      const x0 = Math.floor((x * width) / outW);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / outW));
      let sum = 0;
      for (let sy = y0; sy < y1; sy++) {
        const row = sy * width;
        for (let sx = x0; sx < x1; sx++) sum += pixels[row + sx]!; // sx < width, sy < height by construction
      }
      out[y * outW + x] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return { width: outW, height: outH, pixels: out };
}

/** `count` indices spread evenly over `0..total-1`, always including both ends. */
export function spreadIndices(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, i) => Math.round((i * (total - 1)) / (count - 1)));
}

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

function encodePreview(img: DecodedImage, budget: number): StudyJpeg {
  const longest = Math.max(img.bitmap.width, img.bitmap.height);
  // A source no bigger than the top rung is tried untouched first; rungs at or
  // above the source size would only re-encode the same pixels, so they go.
  const rungs = [...(longest <= EDGE_LADDER[0]! ? [longest] : []), ...EDGE_LADDER.filter((e) => e < longest)];
  let best: { bitmap: Bitmap; data: Uint8Array } | undefined;
  for (const edge of rungs) {
    const bitmap = downscale(img.bitmap, edge);
    const encoded = jpegJs.encode(
      { data: grayscaleToRgba(bitmap.pixels), width: bitmap.width, height: bitmap.height },
      PREVIEW_QUALITY,
    );
    best = { bitmap, data: encoded.data };
    if (base64Length(encoded.data.length) <= budget) break;
  }
  // `rungs` is never empty: either the source fits the top rung or every rung is below it.
  const { bitmap, data } = best!;
  return {
    index: img.index,
    seriesDescription: img.seriesDescription,
    width: bitmap.width,
    height: bitmap.height,
    bytes: data.length,
    jpegBase64: Buffer.from(data).toString('base64'),
  };
}

/**
 * Pick which images to show and encode each within an equal share of the
 * budget. If even the smallest rung of the ladder overshoots, the image is
 * shown at that size anyway — a slightly-too-large preview beats none.
 */
export function inlinePreviews(study: DecodedStudy, budgetBytes: number = INLINE_BUDGET_BYTES): InlinePreviews {
  const chosen = spreadIndices(study.images.length, MAX_INLINE_IMAGES).map((i) => study.images[i]!); // indices < length
  const perImage = chosen.length ? Math.floor(budgetBytes / chosen.length) : budgetBytes;
  const images: StudyJpeg[] = [];
  const errors: string[] = [];
  let downscaled = false;

  for (const img of chosen) {
    try {
      const preview = encodePreview(img, perImage);
      if (preview.width < img.bitmap.width || preview.height < img.bitmap.height) downscaled = true;
      images.push(preview);
    } catch (err) {
      errors.push(`Failed to encode image ${img.index} (${img.seriesDescription}): ${(err as Error).message}`);
    }
  }

  return { images, downscaled, errors };
}
