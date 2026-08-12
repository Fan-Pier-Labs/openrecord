/**
 * End-to-end test for downloadStudyJpegs against the fake-mychart server.
 *
 * This is the function behind the download_imaging_study MCP tool. It exercises
 * the full path the bug lived in: fdiContext → downloadImagingStudyDirect (with
 * the correct argument shape) → pixelData/wrapperData → CLO→JPEG base64.
 *
 * The fake-mychart server must be running on localhost:4000 first:
 *   cd fake-mychart && bun run dev
 * Run with: bun test src/imaging/__tests__/download-study.test.ts
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { myChartUserPassLogin } from '../../../../scrapers/myChart/login';
import { getImagingResults } from '../../../../scrapers/myChart/labs_and_procedure_results/labResults';
import type { MyChartRequest } from '../../../../scrapers/myChart/myChartRequest';
import { downloadStudyJpegs } from '../download-study';

// Assumes a fake-mychart server is running at FAKE_MYCHART_HOST (CI starts one;
// locally run `cd fake-mychart && bun run dev`). Fails loudly if it isn't.
const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

let session: MyChartRequest;

beforeAll(async () => {
  const result = await myChartUserPassLogin({
    hostname: HOST,
    user: 'homer',
    pass: 'donuts123',
    protocol: 'http',
  });
  expect(result.state).toBe('logged_in');
  if (result.state !== 'logged_in') throw new Error('login failed');
  session = result.mychartRequest;
});

describe('downloadStudyJpegs (download_imaging_study tool)', () => {
  it('downloads the X-ray study and returns base64 JPEGs', async () => {
    const imaging = await getImagingResults(session);
    const xray = imaging.find((r) => r.fdiContext && r.orderName?.includes('XR'));
    expect(xray).toBeDefined();
    expect(xray!.fdiContext!.fdi).toBeTruthy();

    const result = await downloadStudyJpegs(session, xray!.fdiContext!, {
      studyName: xray!.orderName,
      maxImages: 3,
    });

    // The whole point of the bug: this must NOT be an empty array.
    expect(result.returned).toBeGreaterThan(0);
    expect(result.images.length).toBe(result.returned);
    expect(result.totalImages).toBeGreaterThan(0);

    const first = result.images[0];
    expect(first.width).toBeGreaterThan(0);
    expect(first.height).toBeGreaterThan(0);
    expect(first.bytes).toBeGreaterThan(1000);

    // Decoded base64 must be a real JPEG (SOI … EOI).
    const jpeg = Buffer.from(first.jpegBase64, 'base64');
    expect(jpeg.length).toBe(first.bytes);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    expect(jpeg[jpeg.length - 2]).toBe(0xff);
    expect(jpeg[jpeg.length - 1]).toBe(0xd9);
  }, 120_000);

  it('caps the number of returned images at maxImages', async () => {
    const imaging = await getImagingResults(session);
    // The CT study has many slices — a good target for the cap.
    const ct = imaging.find((r) => r.fdiContext && r.orderName?.includes('CT'));
    expect(ct).toBeDefined();

    const result = await downloadStudyJpegs(session, ct!.fdiContext!, {
      studyName: ct!.orderName,
      maxImages: 2,
    });

    expect(result.returned).toBeLessThanOrEqual(2);
    expect(result.images.length).toBe(result.returned);
  }, 120_000);
});
