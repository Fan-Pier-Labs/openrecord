import { build } from 'esbuild';
import path from 'path';

export interface SetupWidgetBundle {
  js: string;
  css: string;
}

/**
 * Bundle the setup widget (src/setup-widget, React) into one script and one
 * stylesheet. tsup inlines the result into server.cjs as the
 * `virtual:setup-widget` module; the unit test calls this directly.
 */
export async function bundleSetupWidget(): Promise<SetupWidgetBundle> {
  const result = await build({
    entryPoints: [path.join(__dirname, '..', 'src', 'setup-widget', 'main.tsx')],
    bundle: true,
    write: false,
    outdir: 'out',
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    jsx: 'automatic',
    minify: true,
    // React picks its production build from this, and the dev one is ~4x larger.
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  const output = (ext: string) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? '';
  return { js: output('.js'), css: output('.css') };
}
