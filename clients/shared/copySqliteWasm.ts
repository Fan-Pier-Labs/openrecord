// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import fs from 'fs';
import path from 'path';

/**
 * For the tsup configs of clients that bundle read-local-passwords.
 * node-sqlite3-wasm loads its WebAssembly module from `__dirname` at require
 * time. After bundling, `__dirname` is `dist/`, so the .wasm has to sit beside
 * the bundle — the JS gets inlined, the .wasm cannot be.
 */
export function copySqliteWasm(packageDir: string): void {
  const file = 'node-sqlite3-wasm.wasm';
  // Resolved by path rather than require.resolve: tsup bundles its config to
  // ESM, where require.resolve does not exist. Bun may hoist the package to the
  // repo root, so check there too.
  const candidates = [
    path.resolve(packageDir, 'node_modules', 'node-sqlite3-wasm', 'dist', file),
    path.resolve(packageDir, '..', '..', 'node_modules', 'node-sqlite3-wasm', 'dist', file),
  ];
  const from = candidates.find(candidate => fs.existsSync(candidate));
  if (!from) {
    throw new Error(`tsup: ${file} not found — the bundle cannot read browser password stores without it`);
  }
  fs.copyFileSync(from, path.resolve(packageDir, 'dist', file));
}
