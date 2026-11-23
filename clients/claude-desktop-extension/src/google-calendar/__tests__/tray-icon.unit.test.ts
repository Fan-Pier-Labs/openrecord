// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';

import { calendarIcon, ICON_SIZE } from '../tray-icon';

/** [b, g, r, a] at (x, y) — CreateIcon's BGRA order. */
const at = (px: Uint8Array, x: number, y: number) => [...px.slice((y * ICON_SIZE + x) * 4, (y * ICON_SIZE + x) * 4 + 4)];

describe('calendarIcon', () => {
  it('draws a blue-framed calendar on a transparent background, in BGRA', () => {
    const px = calendarIcon(false);
    expect(px.length).toBe(32 * 32 * 4);
    expect(at(px, 0, 0)).toEqual([0, 0, 0, 0]); // transparent corner
    expect(at(px, 3, 6)).toEqual([232, 115, 26, 255]); // blue frame, stored B,G,R,A
    expect(at(px, 6, 14)).toEqual([255, 255, 255, 255]); // white page
    expect(at(px, 25, 25)).toEqual(at(px, 6, 14)); // no badge
  });

  it('adds a red badge when the last sync failed', () => {
    const px = calendarIcon(true);
    expect(at(px, 21, 25)).toEqual([37, 48, 217, 255]);
    expect(at(px, 24, 22)).toEqual([255, 255, 255, 255]); // the "!"
  });
});
