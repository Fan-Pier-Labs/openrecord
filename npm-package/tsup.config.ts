import { defineConfig } from 'tsup';
import { chmod } from 'node:fs/promises';

// Two builds:
// 1. The library (`src/index.ts` → ESM + CJS + .d.ts).
// 2. The CLI (`cli/entry.ts` → CJS only, with #!/usr/bin/env node shebang)
//    published as the `mychart-cli` bin. entry.ts calls runCli() explicitly —
//    cli.ts's own `if (import.meta.main)` self-run evaluates to false in a
//    CJS bundle, so the binary must not rely on it.
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    target: 'node18',
    esbuildOptions(options) {
      // dev-main `if (import.meta.main)` blocks intentionally evaluate to
      // `false` when bundled into CJS — that's the whole point.
      options.logOverride = { ...(options.logOverride ?? {}), 'empty-import-meta': 'silent' };
    },
    noExternal: [/scrapers[\\/]myChart/],
  },
  {
    entry: { cli: 'cli/entry.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    dts: false,
    sourcemap: true,
    clean: false, // don't blow away the library build
    splitting: false,
    target: 'node18',
    esbuildOptions(options) {
      options.logOverride = { ...(options.logOverride ?? {}), 'empty-import-meta': 'silent' };
    },
    banner: { js: '#!/usr/bin/env node' },
    // Bundle the scraper sources + the CLI helper modules.
    noExternal: [/scrapers[\\/]myChart/, /cli[\\/]/, /shared[\\/]/, /read-local-passwords/],
    // chmod the output so it's executable as a bin.
    onSuccess: async () => {
      try {
        await chmod('dist/cli.cjs', 0o755);
      } catch {
        // ignore — file may not exist on a failed build
      }
    },
  },
]);
