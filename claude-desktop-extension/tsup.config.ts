import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: { server: 'src/index.ts' },
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
