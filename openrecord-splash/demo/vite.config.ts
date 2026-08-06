import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-only: serve the splash page from the parent directory at `/index.html`.
 *
 * In production both sit at the bucket root, so the demo's "back to OpenRecord"
 * link and the splash's "Try the demo" CTAs resolve. Vite's root is `demo/`, so
 * without this those links 404 locally and you cannot click between the two.
 */
function splashPage(): Plugin {
  return {
    name: 'openrecord-splash-page',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/' && url !== '/index.html') return next();
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(readFileSync(`${__dirname}/../index.html`, 'utf8'));
      });
    },
  };
}

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
  plugins: [react(), splashPage()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: `${__dirname}/demo.html`,
    },
  },
});
