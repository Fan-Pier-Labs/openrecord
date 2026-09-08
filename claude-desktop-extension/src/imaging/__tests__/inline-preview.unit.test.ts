/**
 * The inline pictures must fit Claude Desktop's 1MB tool-result cap, or the
 * user sees "Tool result is too large" instead of their X-ray. A real
 * radiograph is ~4MB at full resolution, so this pins the budgeting: big
 * images shrink until the set fits, small ones pass through untouched, and a
 * CT's hundreds of slices are sampled rather than dumped.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Bitmap } from '../../../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { decodeStudy, type DecodedStudy } from '../download-study';
import { inlinePreviews, INLINE_BUDGET_BYTES, MAX_INLINE_IMAGES, spreadIndices } from '../inline-preview';

const CLO_DIR = join(__dirname, '../../../../fake-mychart/src/data/clo-images');

/** A noisy gradient — pure gradients compress unrealistically well. */
function noisyBitmap(width: number, height: number): Bitmap {
  const pixels = new Uint8Array(width * height);
  let seed = 7;
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[i] = Math.max(0, Math.min(255, Math.round(((i % width) / width) * 200 + (seed % 40) - 20)));
  }
  return { width, height, pixels };
}

function study(bitmaps: Bitmap[]): DecodedStudy {
  return {
    studyName: 'XR SHOULDER',
    totalImages: bitmaps.length,
    images: bitmaps.map((bitmap, index) => ({ index, seriesDescription: `VIEW ${index}`, bitmap })),
    errors: [],
  };
}

function base64Bytes(images: { jpegBase64: string }[]): number {
  return images.reduce((sum, img) => sum + img.jpegBase64.length, 0);
}

describe('spreadIndices', () => {
  test('returns every index when the study is small enough', () => {
    expect(spreadIndices(3, 12)).toEqual([0, 1, 2]);
    expect(spreadIndices(0, 12)).toEqual([]);
  });

  test('samples evenly, keeping the first and last slice', () => {
    const picked = spreadIndices(300, 12);
    expect(picked).toHaveLength(12);
    expect(picked[0]).toBe(0);
    expect(picked[11]).toBe(299);
    expect(picked).toEqual([...picked].sort((a, b) => a - b));
    expect(new Set(picked).size).toBe(12);
  });
});

describe('inlinePreviews', () => {
  test('a three-view study of full-size radiographs fits the budget', async () => {
    const result = await inlinePreviews(study([noisyBitmap(2500, 2048), noisyBitmap(2048, 2500), noisyBitmap(2500, 2048)]));
    expect(result.images).toHaveLength(3);
    expect(result.downscaled).toBe(true);
    expect(result.errors).toEqual([]);
    expect(base64Bytes(result.images)).toBeLessThanOrEqual(INLINE_BUDGET_BYTES);
    for (const img of result.images) {
      expect(Math.max(img.width, img.height)).toBeLessThan(2500);
      const jpeg = Buffer.from(img.jpegBase64, 'base64');
      expect(jpeg[0]).toBe(0xff);
      expect(jpeg[1]).toBe(0xd8);
    }
  });

  test('a small fixture is shown at its own size', async () => {
    const decoded = decodeStudy({
      studyName: 'XR CHEST',
      totalImages: 1,
      images: [{
        index: 0,
        seriesUID: 'S1',
        seriesDescription: 'PA VIEW',
        pixelData: readFileSync(join(CLO_DIR, 'checkerboard_512x512_pixel.clo')),
        wrapperData: readFileSync(join(CLO_DIR, 'checkerboard_512x512_wrapper.clo')),
      }],
      errors: [],
    });
    const result = await inlinePreviews(decoded);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.width).toBe(512);
    expect(result.images[0]!.height).toBe(512);
    expect(result.downscaled).toBe(false);
  });

  test('a CT is sampled down to MAX_INLINE_IMAGES slices, still within budget', async () => {
    const slices = Array.from({ length: 40 }, () => noisyBitmap(512, 512));
    const result = await inlinePreviews(study(slices));
    expect(result.images).toHaveLength(MAX_INLINE_IMAGES);
    expect(result.images[0]!.index).toBe(0);
    expect(result.images[MAX_INLINE_IMAGES - 1]!.index).toBe(39);
    expect(base64Bytes(result.images)).toBeLessThanOrEqual(INLINE_BUDGET_BYTES);
  });
});
