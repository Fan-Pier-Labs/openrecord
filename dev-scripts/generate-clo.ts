/**
 * Generate synthetic CLO (ClientOutlook) image files for eyeballing the
 * encoder. Writes CLOCLHAAR pixel + CLOHEADERZ01 wrapper files, reversing the
 * decode pipeline in clo_to_bitmap.ts.
 *
 *   bun dev-scripts/generate-clo.ts [--output-dir <dir>]
 *
 * Defaults to clo-image-parser/synthetic_test_data. The encode→decode
 * assertions themselves live in generate_clo.unit.test.ts; this is just the
 * "write me some files to look at" entry point.
 */
import { join } from 'path';
import { generateTestFiles, generateFakeMychartFixtures } from '../scrapers/myChart/clo-image-parser/generate_clo';
import { logger } from '../shared/logger';

const args = process.argv.slice(2);

// --fake-mychart regenerates the committed multi-slice fixtures fake-mychart
// serves (fake-mychart/src/data/clo-images/sag_recon_slice*). Deterministic —
// rerunning must produce byte-identical files.
if (args.includes('--fake-mychart')) {
  const dir = join(import.meta.dir, '..', 'fake-mychart', 'src', 'data', 'clo-images');
  generateFakeMychartFixtures(dir);
  logger.debug(`\nDone. fake-mychart fixtures written to ${dir}`);
} else {
  const outputDirIdx = args.indexOf('--output-dir');
  const outputDir =
    outputDirIdx >= 0 && args[outputDirIdx + 1]
      ? args[outputDirIdx + 1]
      : join(import.meta.dir, '..', 'scrapers', 'myChart', 'clo-image-parser', 'synthetic_test_data');

  generateTestFiles(outputDir);
  logger.debug(`\nDone. Test files written to ${outputDir}`);
}
