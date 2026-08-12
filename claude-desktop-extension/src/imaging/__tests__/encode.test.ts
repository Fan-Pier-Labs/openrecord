/**
 * Unit test for the pure-JS CLO→JPEG encode path used by download_imaging_study.
 *
 * Reads committed CLO fixtures (the same ones fake-mychart serves) and runs
 * them through convertCloToBitmap16 + encodeCloAsJpeg — no server required.
 * Guards against regressions in the encoder wiring (e.g. passing the wrong
 * buffer or dropping the wrapper metadata).
 *
 * Run with: bun test src/imaging/__tests__/encode.test.ts
 */
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { convertCloToBitmap16 } from '../../../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { encodeCloAsJpeg } from '../jpeg-encoder';
import { encodeImageId, decodeImageId } from '../../../../shared/capabilities';

const CLO_DIR = join(__dirname, '../../../../fake-mychart/src/data/clo-images');

function readClo(prefix: string): { pixel: Buffer; wrapper: Buffer } {
  return {
    pixel: readFileSync(join(CLO_DIR, `${prefix}_pixel.clo`)),
    wrapper: readFileSync(join(CLO_DIR, `${prefix}_wrapper.clo`)),
  };
}

describe('CLO → JPEG encode path', () => {
  it('decodes a 512×512 CLO and encodes a valid JPEG', () => {
    const { pixel, wrapper } = readClo('checkerboard_512x512');

    const bitmap = convertCloToBitmap16(pixel, wrapper);
    expect(bitmap.width).toBe(512);
    expect(bitmap.height).toBe(512);
    expect(bitmap.pixels.length).toBe(512 * 512);

    const encoded = encodeCloAsJpeg(bitmap, 85);
    expect(encoded.width).toBe(512);
    expect(encoded.height).toBe(512);
    expect(encoded.bytes).toBeGreaterThan(1000);

    // Valid JPEG: SOI (FFD8) … EOI (FFD9).
    expect(encoded.buffer[0]).toBe(0xff);
    expect(encoded.buffer[1]).toBe(0xd8);
    expect(encoded.buffer[encoded.buffer.length - 2]).toBe(0xff);
    expect(encoded.buffer[encoded.buffer.length - 1]).toBe(0xd9);
  });

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

  it('encodes a skull X-ray fixture without the wrapper metadata (pixels only)', () => {
    const { pixel } = readClo('skull_ap');

    // wrapperData is optional — convertCloToBitmap16 must still decode pixels.
    const bitmap = convertCloToBitmap16(pixel);
    expect(bitmap.width).toBeGreaterThan(0);
    expect(bitmap.height).toBeGreaterThan(0);

    const encoded = encodeCloAsJpeg(bitmap, 85);
    expect(encoded.bytes).toBeGreaterThan(1000);
    expect(encoded.buffer[0]).toBe(0xff);
    expect(encoded.buffer[1]).toBe(0xd8);
  });
});
