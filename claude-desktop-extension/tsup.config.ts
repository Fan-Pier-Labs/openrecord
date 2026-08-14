import { defineConfig } from 'tsup';
import fs from 'fs';
import path from 'path';

/**
 * node-sqlite3-wasm loads its WebAssembly module from `__dirname` at require
 * time. After bundling, `__dirname` is `dist/`, so the .wasm has to sit beside
 * server.cjs — the JS gets inlined, the .wasm cannot be.
 */
function copySqliteWasm(): void {
  const file = 'node-sqlite3-wasm.wasm';
  // Resolved by path rather than require.resolve: tsup bundles this config to
  // ESM, where require.resolve does not exist. Bun may hoist the package to
  // the workspace root, so check there too.
  const candidates = [
    path.resolve(__dirname, 'node_modules', 'node-sqlite3-wasm', 'dist', file),
    path.resolve(__dirname, '..', 'node_modules', 'node-sqlite3-wasm', 'dist', file),
  ];
  const from = candidates.find(candidate => fs.existsSync(candidate));
  if (!from) {
    throw new Error(`tsup: ${file} not found — the MCPB cannot read browser password stores without it`);
  }
  fs.copyFileSync(from, path.resolve(__dirname, 'dist', file));
}

export default defineConfig({
  entry: { server: 'src/index.ts' },
  onSuccess: () => {
    copySqliteWasm();
    return Promise.resolve();
  },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node20',
  // Bundle everything — Claude Desktop ships its own Node and no native deps.
  noExternal: [/.*/],
  esbuildOptions(options) {
    options.logOverride = {
      ...(options.logOverride ?? {}),
      'empty-import-meta': 'silent',
    };
    options.nodePaths = [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '..', 'node_modules'),
    ];
  },
});
