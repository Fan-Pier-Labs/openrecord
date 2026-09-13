/*
 * Utility function to change the current working directory upward until a package.json file is found.
 * If no package.json file is found in any parent directories, an error is thrown.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

/**
 * Change directory to the nearest ancestor directory containing a package.json file.
 * @throws {Error} if no package.json is found in any parent directory.
 */
export function changeDirToPackageRoot(): void {
  let currentDir = process.cwd();

  while (!fs.existsSync(path.join(currentDir, 'package.json'))) {
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      logger.debug('package.json not found in any parent directory.');
      return;
    }
    currentDir = parentDir;
  }
  process.chdir(currentDir);
}

// Merged in from what used to be `dev-scripts/package-root.ts`: run this file
// directly to see where the walk lands from wherever it is invoked.
//
//   bun shared/util.ts
//
// Guarded, and it has to stay guarded. Unguarded, merely importing this module
// would chdir the whole process and log to stdout at load time — before the
// MCPB's `setLogSink` can redirect it, which corrupts the stdio JSON-RPC
// framing (see `shared/logger.ts`). No client wants either side effect.
if (import.meta.main) {
  logger.debug('Current directory before change:', process.cwd());
  changeDirToPackageRoot();
  logger.debug('Changed directory to:', process.cwd());
}
