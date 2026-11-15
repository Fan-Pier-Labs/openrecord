// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';
import path from 'path';
import { bundleSetupWidget } from './scripts/bundle-setup-widget';
import { copySqliteWasm } from '../shared/copySqliteWasm';

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
    copySqliteWasm(__dirname);
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
      path.resolve(__dirname, '..', '..', 'node_modules'),
    ];
  },
});
