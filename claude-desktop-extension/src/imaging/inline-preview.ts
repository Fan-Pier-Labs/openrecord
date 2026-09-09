/**
 * Size-budgeted previews of an imaging study for the conversation.
 *
 * Claude Desktop rejects any tool result over 1MB, and a single full-size
 * radiograph is ~4MB as a quality-100 JPEG (5.7MB once base64-encoded). So
 * the pictures shown inline are previews: downscaled and re-encoded until the
 * whole set fits under {@link INLINE_BUDGET_BYTES}. Full resolution is what
 * `save_to_downloads` writes to disk, never what goes in the chat — and a
 * saving call shows no pictures at all, only where the files went.
 *
 * A CT is hundreds of slices, and hundreds of thumbnails is not a useful
 * preview of one, so at most {@link MAX_INLINE_IMAGES} are shown, spread
 * evenly across the study.
 *
 * Resizing is pica, pure JS/WASM — sharp is native and cannot ship in the
 * .mcpb bundle.
 */
import jpegJs from 'jpeg-js';
import Pica from 'pica';
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

// No canvas, no workers: this runs in a stdio server process.
const pica = new Pica({ features: ['js', 'wasm'] });

export interface InlinePreviews {
  images: StudyJpeg[];
  /** True when at least one shown image is smaller than its source. */
  downscaled: boolean;
  errors: string[];
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

async function encodePreview(img: DecodedImage, budget: number): Promise<StudyJpeg> {
  const { width, height } = img.bitmap;
  const longest = Math.max(width, height);
  // A source no bigger than the top rung is tried untouched first; rungs at or
  // above the source size would only re-encode the same pixels, so they go.
  const rungs = [...(longest <= EDGE_LADDER[0]! ? [longest] : []), ...EDGE_LADDER.filter((e) => e < longest)];
  const src = grayscaleToRgba(img.bitmap.pixels);

  let best: { width: number; height: number; data: Uint8Array } | undefined;
  for (const edge of rungs) {
    const toWidth = Math.max(1, Math.round((width * edge) / longest));
    const toHeight = Math.max(1, Math.round((height * edge) / longest));
    const data =
      edge === longest
        ? src
        : await pica.resizeBuffer({ src, width, height, toWidth, toHeight });
    const encoded = jpegJs.encode({ data, width: toWidth, height: toHeight }, PREVIEW_QUALITY);
    best = { width: toWidth, height: toHeight, data: encoded.data };
    if (base64Length(encoded.data.length) <= budget) break;
  }
  // `rungs` is never empty: either the source fits the top rung or every rung is below it.
  const { width: w, height: h, data } = best!;
  return {
    index: img.index,
    seriesDescription: img.seriesDescription,
    width: w,
    height: h,
    bytes: data.length,
    jpegBase64: Buffer.from(data).toString('base64'),
  };
}

/**
 * Pick which images to show and encode each within an equal share of the
 * budget. If even the smallest rung of the ladder overshoots, the image is
 * shown at that size anyway — a slightly-too-large preview beats none.
 */
export async function inlinePreviews(study: DecodedStudy, budgetBytes: number = INLINE_BUDGET_BYTES): Promise<InlinePreviews> {
  const chosen = spreadIndices(study.images.length, MAX_INLINE_IMAGES).map((i) => study.images[i]!); // indices < length
  const perImage = chosen.length ? Math.floor(budgetBytes / chosen.length) : budgetBytes;
  const images: StudyJpeg[] = [];
  const errors: string[] = [];
  let downscaled = false;

  for (const img of chosen) {
    try {
      const preview = await encodePreview(img, perImage);
      if (preview.width < img.bitmap.width || preview.height < img.bitmap.height) downscaled = true;
      images.push(preview);
    } catch (err) {
      errors.push(`Failed to encode image ${img.index} (${img.seriesDescription}): ${(err as Error).message}`);
    }
  }

  return { images, downscaled, errors };
}
