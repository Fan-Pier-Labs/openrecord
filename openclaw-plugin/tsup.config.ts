import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  sourcemap: true,
  clean: true,
  external: ['sqlite3'],
  noExternal: [/.*/],
  esbuildOptions(options) {
    // Resolve packages from both root and plugin node_modules
    // so scraper imports outside this directory can find their deps
    options.nodePaths = [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '..', 'node_modules'),
    ];
  },
});
