import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev-only: serve the splash page from the parent directory at `/index.html`.
 *
 * In production both sit at the bucket root, so the demo's "back to OpenRecord"
 * link resolves. Vite's root is `demo/`, so without this that link 404s locally.
 * The splash does not link back — the demo is deployed but unadvertised.
 */
/**
 * Root-level static assets that live next to `index.html` in production.
 * Served here too so dev doesn't 404 on them (the browser always requests
 * `/favicon.ico`, which showed up as a console error on every page load).
 */
export const SPLASH_ASSETS: Record<string, string> = {
  '/favicon.ico': 'image/x-icon',
  '/icon.svg': 'image/svg+xml',
  '/apple-touch-icon.png': 'image/png',
  '/icon-192.png': 'image/png',
  '/icon-512.png': 'image/png',
  '/og-image.png': 'image/png',
  '/manifest.json': 'application/manifest+json',
};

function splashPage(): Plugin {
  return {
    name: 'openrecord-splash-page',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (SPLASH_ASSETS[url]) {
          res.setHeader('content-type', SPLASH_ASSETS[url]);
          res.end(readFileSync(`${__dirname}/..${url}`));
          return;
        }
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
