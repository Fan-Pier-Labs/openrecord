import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The demo is a React app; the splash page next to it is hand-written HTML with
 * no build step. So the build emits into `../dist` and the deploy script uploads
 * `index.html` from source alongside the built demo.
 *
 * The entry HTML is named `demo.html` on purpose: CloudFront's default root
 * object only applies to `/`, so there's no directory-index behaviour for
 * subpaths and `/demo` would fall through to the 403/404 → `/index.html`
 * handler and quietly serve the splash page instead.
 */
export default defineConfig({
  root: __dirname,
  base: '/',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: `${__dirname}/demo.html`,
    },
  },
});
