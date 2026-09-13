/**
 * Demo: show where `changeDirToPackageRoot` lands from wherever it is run.
 *
 *   bun dev-scripts/package-root.ts
 */
import { changeDirToPackageRoot } from '../shared/util';
import { logger } from '../shared/logger';

logger.debug('Current directory before change:', process.cwd());
changeDirToPackageRoot();
logger.debug('Changed directory to:', process.cwd());
