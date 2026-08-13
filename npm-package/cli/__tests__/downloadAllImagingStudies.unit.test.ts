/**
 * `--action get-imaging` — the one dashed action that is a composite rather
 * than an alias: get_imaging_results, then one download_imaging_study per
 * study, both through executeCapability.
 *
 * executeCapability is mocked at the module boundary (safe: the unit suite
 * runs with --isolate) so these tests pin down the composite's own contract —
 * which capabilities it dispatches, with which arguments, and what lands on
 * disk — without standing up a fake portal.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { StudyImagePayload } from '../../../shared/capabilities';
import { MyChartRequest } from '../../../scrapers/myChart/myChartRequest';
import {
  encodePixelFile,
  encodeWrapperFile,
  generateCheckerboard,
} from '../../../scrapers/myChart/clo-image-parser/generate_clo';
import { resetLogSink, silenceLogger } from '../../../shared/logger';

const actual = await import('../../../shared/capabilities');

let executeCalls: Array<{ id: string; args: Record<string, unknown> }> = [];
let executeImpl: (id: string, args: Record<string, unknown>) => Promise<unknown>;

mock.module('../../../shared/capabilities', () => ({
  ...actual,
  executeCapability: async (
    _request: unknown,
    id: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> => {
    executeCalls.push({ id, args });
    return executeImpl(id, args);
  },
}));

const { downloadAllImagingStudies } = await import('../capabilityActions');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-all-imaging-'));
const session = { hostname: 'mychart.example.org', request: new MyChartRequest('mychart.example.org') };

// The same encoder the codec's own tests use, so the composite exercises the
// real CLO→JPEG path.
const SIZE = 512;
const PIXEL_DATA = new Uint8Array(encodePixelFile(generateCheckerboard(SIZE, SIZE), SIZE, SIZE));
const WRAPPER_DATA = new Uint8Array(
  encodeWrapperFile({
    photometricInterpretation: 'MONOCHROME2',
    bitsStored: 16,
    windowCenter: 32768,
    windowWidth: 65536,
  }),
);

function studyPayload(studyName: string): StudyImagePayload {
  return {
    studyName,
    totalImages: 1,
    images: [
      {
        index: 0,
        seriesUID: '1.2.3.4',
        seriesDescription: 'AXIAL',
        pixelData: PIXEL_DATA,
        wrapperData: WRAPPER_DATA,
      },
    ],
    errors: [],
  };
}

const realLog = console.log;
beforeAll(() => {
  silenceLogger();
  console.log = () => {};
});
afterAll(() => {
  console.log = realLog;
  resetLogSink();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
beforeEach(() => {
  executeCalls = [];
});

describe('downloadAllImagingStudies', () => {
  it('dispatches one download per study with pictures, and writes JPEGs plus the metadata dump', async () => {
    executeImpl = async (id) => {
      if (id === 'get_imaging_results') {
        return [
          { orderName: 'XR Skull 2 Views', image_id: 'token-xr' },
          { orderName: 'Report-only study' }, // no image_id → nothing to download
        ];
      }
      return studyPayload('XR Skull 2 Views');
    };

    const outDir = path.join(tmpDir, 'happy');
    const ok = await downloadAllImagingStudies(session, undefined, {
      outputDir: outDir,
      patient: 'Bart',
      saveClo: true,
    });

    expect(ok).toBe(true);
    // One listing call, then exactly one download — the report-only study is skipped.
    expect(executeCalls.map((c) => c.id)).toEqual(['get_imaging_results', 'download_imaging_study']);
    expect(executeCalls[0].args).toEqual({ patient: 'Bart' });
    expect(executeCalls[1].args).toEqual({
      patient: 'Bart',
      image_id: 'token-xr',
      study_name: 'XR Skull 2 Views',
    });

    const hostDir = path.join(outDir, session.hostname);
    const metadata = JSON.parse(await fs.promises.readFile(path.join(hostDir, 'all-imaging.json'), 'utf-8'));
    expect(metadata.map((m: { orderName: string }) => m.orderName)).toEqual([
      'XR Skull 2 Views',
      'Report-only study',
    ]);

    const jpeg = await fs.promises.readFile(path.join(hostDir, 'XR_Skull_2_Views_000_AXIAL.jpg'));
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    // --save-clo keeps the raw bytes alongside the JPEG.
    expect(fs.existsSync(path.join(hostDir, 'XR_Skull_2_Views_000_AXIAL_pixel.clo'))).toBe(true);
    expect(fs.existsSync(path.join(hostDir, 'XR_Skull_2_Views_000_AXIAL_wrapper.clo'))).toBe(true);
  });

  it('keeps going when one study fails, and reports the run as failed', async () => {
    executeImpl = async (id, args) => {
      if (id === 'get_imaging_results') {
        return [
          { orderName: 'Broken study', image_id: 'token-broken' },
          { orderName: 'Good study', image_id: 'token-good' },
        ];
      }
      if (args.image_id === 'token-broken') throw new Error('viewer is down');
      return studyPayload('Good study');
    };

    const outDir = path.join(tmpDir, 'partial');
    const ok = await downloadAllImagingStudies(session, undefined, { outputDir: outDir });

    expect(ok).toBe(false);
    // The failure did not stop the second study.
    expect(executeCalls.map((c) => c.id)).toEqual([
      'get_imaging_results',
      'download_imaging_study',
      'download_imaging_study',
    ]);
    expect(fs.existsSync(path.join(outDir, session.hostname, 'Good_study_000_AXIAL.jpg'))).toBe(true);
  });

  it('returns false when the listing itself is refused', async () => {
    // e.g. the active-patient assertion inside executeCapability throwing.
    executeImpl = async () => {
      throw new Error("Refusing to read: MyChart is currently on 'Bart Simpson'");
    };

    const ok = await downloadAllImagingStudies(session, undefined, {
      outputDir: path.join(tmpDir, 'refused'),
    });
    expect(ok).toBe(false);
    expect(executeCalls.map((c) => c.id)).toEqual(['get_imaging_results']);
  });
});
