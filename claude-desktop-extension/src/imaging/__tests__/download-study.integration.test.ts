/**
 * End-to-end test for downloadStudyJpegs against the fake-mychart server.
 *
 * This is the function behind the download_imaging_study MCP tool. It exercises
 * the full path the bug lived in: fdiContext → downloadImagingStudyDirect (with
 * the correct argument shape) → pixelData/wrapperData → CLO→JPEG base64.
 *
 * The fake-mychart server must be running on localhost:4000 first:
 *   cd fake-mychart && PORT=4000 bun run dev
 * Run with: bun run test (from this package, with fake-mychart up)
 */
import { describe, it, expect, beforeAll } from 'bun:test';
import { myChartUserPassLogin } from '../../../../scrapers/myChart/auth/login';
import { getImagingResults } from '../../../../scrapers/myChart/chart/labs/labResults';
import { decodeImageId } from '../../../../shared/capabilities';
import type { MyChartRequest } from '../../../../scrapers/myChart/core/myChartRequest';
import { downloadStudyJpegs } from '../download-study';

// Assumes a fake-mychart server is running at FAKE_MYCHART_HOST (CI starts one;
// locally run `cd fake-mychart && PORT=4000 bun run dev`). Fails loudly if it isn't.
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
    const { orders } = await getImagingResults(session);
    const xray = orders.find((r) => r.image_id && r.orderName?.includes('XR'));
    expect(xray).toBeDefined();
    const fdiContext = decodeImageId(xray!.image_id!);
    expect(fdiContext.fdi).toBeTruthy();

    const result = await downloadStudyJpegs(session, fdiContext, {
      ...(xray!.orderName ? { studyName: xray!.orderName } : {}),
    });

    // The whole point of the bug: this must NOT be an empty array.
    expect(result.returned).toBeGreaterThan(0);
    expect(result.images.length).toBe(result.returned);
    expect(result.totalImages).toBeGreaterThan(0);

    const first = result.images[0]!; // result.returned asserted > 0 above; noUncheckedIndexedAccess
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

  it('downloads every real slice of the CT study, skipping SeriesSelector junk', async () => {
    const { orders } = await getImagingResults(session);
    const ct = orders.find((r) => r.image_id && r.orderName?.includes('CT'));
    expect(ct).toBeDefined();

    const result = await downloadStudyJpegs(session, decodeImageId(ct!.image_id!), {
      ...(ct!.orderName ? { studyName: ct!.orderName } : {}),
    });

    // The CT study is multi-slice; everything with pixel data comes back.
    expect(result.returned).toBeGreaterThan(2);
    expect(result.images.length).toBe(result.returned);
    for (const img of result.images) {
      expect(img.seriesDescription).not.toBe('SeriesSelector');
    }
  }, 120_000);
});
