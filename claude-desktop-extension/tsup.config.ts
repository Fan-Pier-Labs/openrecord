import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { bundleSetupWidget } from './scripts/bundle-setup-widget';

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

/**
 * `virtual:setup-widget` is the setup widget's React app, bundled for the
 * browser and inlined here as `{ js, css }` strings, so server.cjs serves the
 * whole page itself. tsup --watch rebuilds on any change, widget files included.
 */
const setupWidgetPlugin: Plugin = {
  name: 'setup-widget',
  setup(build) {
    build.onResolve({ filter: /^virtual:setup-widget$/ }, (args) => ({ path: args.path, namespace: 'setup-widget' }));
    build.onLoad({ filter: /.*/, namespace: 'setup-widget' }, async () => ({
      contents: `export default ${JSON.stringify(await bundleSetupWidget())};`,
      loader: 'js',
    }));
  },
};

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
  // Bundle everything except the one native dependency. A `.node` binary cannot
  // be inlined into a CJS file, so `@napi-rs/keyring` (and the per-platform
  // binary packages it loads) stay external and ship as real node_modules
  // alongside dist/ — see .mcpbignore.
  external: [/^@napi-rs\/keyring/],
  noExternal: [/^(?!@napi-rs\/keyring)/],
  esbuildPlugins: [setupWidgetPlugin],
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
