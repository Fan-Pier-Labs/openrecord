/**
 * Unit test for the MCPB's imaging-study encode wiring (download-study.ts).
 *
 * Reads committed CLO fixtures (the same ones fake-mychart serves) and runs
 * them through encodeStudyJpegs — no server required. The CLO→JPEG pipeline
 * itself is tested next to its implementation in
 * scrapers/myChart/clo-image-parser/exporters.unit.test.ts; this guards the
 * extension-side glue (payload handling, base64, per-image error capture).
 */
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { encodeStudyJpegs } from '../download-study';
import { encodeImageId, decodeImageId, type StudyImagePayload } from '../../../../shared/capabilities';

const CLO_DIR = join(__dirname, '../../../../fake-mychart/src/data/clo-images');

function readClo(prefix: string): { pixel: Buffer; wrapper: Buffer } {
  return {
    pixel: readFileSync(join(CLO_DIR, `${prefix}_pixel.clo`)),
    wrapper: readFileSync(join(CLO_DIR, `${prefix}_wrapper.clo`)),
  };
}

function makePayload(images: StudyImagePayload['images'], errors: string[] = []): StudyImagePayload {
  return { studyName: 'XR CHEST', totalImages: images.length, images, errors };
}

describe('encodeStudyJpegs', () => {
  it('encodes a 512×512 CLO fixture as a base64 JPEG', () => {
    const { pixel, wrapper } = readClo('checkerboard_512x512');
    const result = encodeStudyJpegs(makePayload([
      { index: 0, seriesUID: 'S1', seriesDescription: 'PA VIEW', pixelData: pixel, wrapperData: wrapper },
    ]));

    expect(result.studyName).toBe('XR CHEST');
    expect(result.returned).toBe(1);
    expect(result.errors).toEqual([]);

    const img = result.images[0]!;
    expect(img.width).toBe(512);
    expect(img.height).toBe(512);
    expect(img.seriesDescription).toBe('PA VIEW');
    expect(img.bytes).toBeGreaterThan(1000);

    // Valid JPEG: SOI (FFD8) … EOI (FFD9).
    const jpeg = Buffer.from(img.jpegBase64, 'base64');
    expect(jpeg.length).toBe(img.bytes);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    expect(jpeg[jpeg.length - 2]).toBe(0xff);
    expect(jpeg[jpeg.length - 1]).toBe(0xd9);
  });

  it('encodes a skull X-ray fixture without the wrapper metadata (pixels only)', () => {
    const { pixel } = readClo('skull_ap');
    const result = encodeStudyJpegs(makePayload([
      { index: 0, seriesUID: 'S1', seriesDescription: 'AP', pixelData: pixel },
    ]));

    expect(result.returned).toBe(1);
    expect(result.images[0]!.width).toBeGreaterThan(0);
    expect(result.images[0]!.height).toBeGreaterThan(0);
    expect(result.images[0]!.bytes).toBeGreaterThan(1000);
  });

  it('skips images without pixel data and captures per-image encode failures', () => {
    const { pixel, wrapper } = readClo('checkerboard_512x512');
    const result = encodeStudyJpegs(makePayload(
      [
        { index: 0, seriesUID: 'S1', seriesDescription: 'NO PIXELS' },
        { index: 1, seriesUID: 'S2', seriesDescription: 'CORRUPT', pixelData: new Uint8Array([1, 2, 3]) },
        { index: 2, seriesUID: 'S3', seriesDescription: 'GOOD', pixelData: pixel, wrapperData: wrapper },
      ],
      ['upstream warning'],
    ));

    // The pixel-less image is filtered out, the corrupt one becomes an error,
    // the good one encodes; upstream errors are preserved.
    expect(result.totalImages).toBe(3);
    expect(result.returned).toBe(1);
    expect(result.images[0]!.seriesDescription).toBe('GOOD');
    expect(result.errors[0]!).toBe('upstream warning');
    expect(result.errors.some((e) => e.includes('CORRUPT'))).toBe(true);
  });
});

describe('image_id round-trip', () => {
  it('round-trips an image_id through encode/decode', () => {
    const ctx = { fdi: 'FDI-XRAY-001', ord: 'ORD-XRAY-001' };
    const id = encodeImageId(ctx);
    // base64url: no '+', '/', or '=' that would trip up URL/arg handling.
    expect(id).not.toMatch(/[+/=]/);
    expect(decodeImageId(id)).toEqual(ctx);
  });

  it('rejects a malformed image_id', () => {
    expect(() => decodeImageId('not-a-valid-token')).toThrow();
    // valid base64url but not the expected {fdi, ord} shape
    const bad = Buffer.from(JSON.stringify({ nope: 1 }), 'utf8').toString('base64url');
    expect(() => decodeImageId(bad)).toThrow();
  });
});
