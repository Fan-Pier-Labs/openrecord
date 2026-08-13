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
import { generateTestFiles } from '../scrapers/myChart/clo-image-parser/generate_clo';
import { logger } from '../shared/logger';

const args = process.argv.slice(2);
const outputDirIdx = args.indexOf('--output-dir');
const explicitOutputDir = outputDirIdx >= 0 ? args[outputDirIdx + 1] : undefined;
const outputDir =
  explicitOutputDir ||
  join(import.meta.dir, '..', 'scrapers', 'myChart', 'clo-image-parser', 'synthetic_test_data');

generateTestFiles(outputDir);
logger.debug(`\nDone. Test files written to ${outputDir}`);
