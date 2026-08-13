/**
 * Root-level static assets that live next to `index.html` in production.
 *
 * The dev server middleware in `vite.config.ts` serves these from the splash
 * root so dev doesn't 404 on them (the browser always requests `/favicon.ico`,
 * which showed up as a console error on every page load). A separate module
 * so the test that checks each file exists doesn't import the vite config —
 * config middleware never runs under tests, and importing it would put its
 * uncoverable lines into the coverage gate's denominator.
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
