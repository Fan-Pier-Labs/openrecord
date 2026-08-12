/**
 * Pins for UI bugs found by clicking through the deployed demo.
 *
 * These scan source the way expo-app's testids test does — the bugs they pin
 * were invisible to logic tests (a CSS rule, a marketing claim) but broke the
 * page for real users.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { SPLASH_ASSETS } from '../vite.config';

const read = (rel: string) => readFileSync(`${import.meta.dir}/../${rel}`, 'utf8');

describe('ios surface scroll columns', () => {
  test('flex children of .ios-scroll must not shrink', () => {
    // The cards inside use `overflow: hidden` for their rounded corners, which
    // zeroes a flex item's automatic min-height. Without flex-shrink: 0, any
    // overflow crushed the Insights rows to 2px lines and clipped Settings
    // rows mid-text instead of letting the column scroll.
    const css = read('src/styles.css');
    expect(css).toMatch(/\.ios-scroll\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0/);
  });
});

describe('sidebar copy', () => {
  test('does not claim a pre-written fallback exists', () => {
    // The keyword-table fallback was removed on purpose (it produced confident
    // non sequiturs); the header badge says "no canned-response path". The
    // sidebar once contradicted both.
    const app = read('src/App.tsx');
    expect(app).not.toContain('pre-written otherwise');
  });
});

describe('dev-served splash assets', () => {
  test('every asset the dev middleware serves exists on disk', () => {
    // The middleware reads these from the splash root at request time; a
    // missing file would turn the favicon fix into a dev-server crash.
    for (const url of Object.keys(SPLASH_ASSETS)) {
      expect(existsSync(`${import.meta.dir}/../..${url}`)).toBe(true);
    }
  });
});
