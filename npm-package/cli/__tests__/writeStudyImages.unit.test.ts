import { describe, expect, it, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sharp from 'sharp';
import { writeStudyImages } from '../capabilityActions';
import {
  encodePixelFile,
  encodeWrapperFile,
  generateCheckerboard,
} from '../../../scrapers/myChart/clo-image-parser/generate_clo';
import type { StudyImagePayload } from '../../../shared/capabilities';

/**
 * The CLI's rendering of a rendersMedia payload: raw CLO buffers in, JPEG
 * files on disk out. Uses the repo's own CLO encoder as the fixture source so
 * the test exercises the same decode path production does.
 */

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'write-study-images-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// One shared 512×512 fixture — the encoder's wavelet pyramid needs full-size
// tiles (the codec's own tests use 510/512 too), and encoding is the slow part.
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

function cloImage(index: number, seriesDescription: string) {
  return {
    index,
    seriesUID: `1.2.3.4.${index}`,
    seriesDescription,
    pixelData: PIXEL_DATA,
    wrapperData: WRAPPER_DATA,
  };
}

describe('writeStudyImages', () => {
  it('decodes each CLO image and writes a JPEG the user can open', async () => {
    const payload: StudyImagePayload = {
      studyName: 'Demo Study',
      totalImages: 2,
      images: [cloImage(0, 'AXIAL'), cloImage(1, 'BONE RECON')],
      errors: [],
    };

    const outDir = path.join(tmpDir, 'two-images');
    const written = await writeStudyImages(payload, outDir);

    expect(written.length).toBe(2);
    expect(written.map((w) => path.basename(w.filePath))).toEqual([
      'Demo_Study_000_AXIAL.jpg',
      'Demo_Study_001_BONE_RECON.jpg',
    ]);
    for (const w of written) {
      expect(w.width).toBe(512);
      expect(w.height).toBe(512);
      const bytes = fs.readFileSync(w.filePath);
      expect(bytes.length).toBe(w.jpegBytes);
      // A real JPEG, with the dimensions the decoder reported.
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe('jpeg');
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(512);
    }
  });

  it('skips entries without pixel data instead of throwing', async () => {
    const payload: StudyImagePayload = {
      studyName: 'Sparse',
      totalImages: 2,
      images: [
        { index: 0, seriesUID: '1.2.3.4.0', seriesDescription: 'EMPTY' },
        cloImage(1, 'REAL'),
      ],
      errors: [],
    };

    const written = await writeStudyImages(payload, path.join(tmpDir, 'sparse'));
    expect(written.length).toBe(1);
    expect(written[0]!.seriesDescription).toBe('REAL');
  });
});
