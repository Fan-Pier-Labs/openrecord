/**
 * Unit test for writing a downloaded study to disk (save-study.ts).
 *
 * The failure modes here are silent ones: a study name that sanitizes to
 * nothing, and a second download of the same study quietly overwriting the
 * first. Both are asserted against a real temp directory — the `baseDir` seam
 * is what keeps this off the developer's own Downloads folder.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { saveStudyJpegs } from '../save-study';
import type { DownloadStudyJpegsResult, StudyJpeg } from '../download-study';

/** Not a real JPEG — save-study only moves bytes; encoding is encode.unit.test.ts. */
const PIXELS = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function image(index: number, seriesDescription: string): StudyJpeg {
  return {
    index,
    seriesDescription,
    width: 512,
    height: 512,
    bytes: PIXELS.length,
    jpegBase64: PIXELS.toString('base64'),
  };
}

function studyResult(studyName: string, images: StudyJpeg[]): DownloadStudyJpegsResult {
  return { studyName, totalImages: images.length, returned: images.length, images, errors: [] };
}

let baseDir: string;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-save-study-'));
});

afterEach(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

describe('saveStudyJpegs', () => {
  it('writes one numbered JPEG per image into a folder named for the study', () => {
    const saved = saveStudyJpegs(
      studyResult('XR CHEST 2 VIEW', [image(0, 'PA VIEW'), image(1, 'LATERAL')]),
      baseDir,
    );

    expect(path.basename(saved.directory)).toBe('XR_CHEST_2_VIEW');
    expect(path.dirname(saved.directory)).toBe(baseDir);
    expect(saved.files).toEqual(['001_PA_VIEW.jpg', '002_LATERAL.jpg']);

    for (const file of saved.files) {
      expect(fs.readFileSync(path.join(saved.directory, file))).toEqual(PIXELS);
    }
  });

  it('never overwrites an earlier download of the same study', () => {
    const study = () => studyResult('XR CHEST 2 VIEW', [image(0, 'PA VIEW')]);

    const first = saveStudyJpegs(study(), baseDir);
    const second = saveStudyJpegs(study(), baseDir);
    const third = saveStudyJpegs(study(), baseDir);

    expect(path.basename(first.directory)).toBe('XR_CHEST_2_VIEW');
    expect(path.basename(second.directory)).toBe('XR_CHEST_2_VIEW-2');
    expect(path.basename(third.directory)).toBe('XR_CHEST_2_VIEW-3');
    expect(fs.readdirSync(baseDir).sort()).toEqual([
      'XR_CHEST_2_VIEW',
      'XR_CHEST_2_VIEW-2',
      'XR_CHEST_2_VIEW-3',
    ]);
  });

  it('numbers files contiguously even when an image failed to encode', () => {
    // encodeStudyJpegs drops a failed image but keeps counting, so `index`
    // has a hole in it. The folder must not.
    const saved = saveStudyJpegs(
      studyResult('CT HEAD', [image(1, 'AXIAL'), image(3, 'AXIAL'), image(4, 'BONE')]),
      baseDir,
    );

    expect(saved.files).toEqual(['001_AXIAL.jpg', '002_AXIAL.jpg', '003_BONE.jpg']);
  });

  it('falls back to a placeholder when the names sanitize away to nothing', () => {
    const saved = saveStudyJpegs(studyResult('///', [image(0, '???')]), baseDir);

    expect(path.basename(saved.directory)).toBe('imaging-study');
    expect(saved.files).toEqual(['001_image.jpg']);
  });

  it('keeps a path separator in a study name from escaping the base directory', () => {
    const saved = saveStudyJpegs(studyResult('../../escaped', [image(0, '../evil')]), baseDir);

    expect(path.dirname(saved.directory)).toBe(baseDir);
    expect(path.basename(saved.directory)).toBe('escaped');
    expect(saved.files).toEqual(['001_evil.jpg']);
  });
});
