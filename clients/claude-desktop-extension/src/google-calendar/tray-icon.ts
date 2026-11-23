// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The Windows notification-area icon, drawn in code: a 32×32 calendar (blue
 * header, binder rings, a grid of days), with a red badge when the last sync
 * failed. macOS uses SF Symbols instead and never calls this.
 *
 * Returns top-down BGRA rows, the layout `CreateIcon` takes at 32 bits per
 * pixel. Colored rather than monochrome so it reads on both a light and a dark
 * taskbar.
 */

export const ICON_SIZE = 32;

type Rgba = readonly [number, number, number, number];
const BLUE: Rgba = [26, 115, 232, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const GRAY: Rgba = [95, 99, 104, 255];
const RED: Rgba = [217, 48, 37, 255];

export function calendarIcon(error: boolean): Uint8Array {
  const px = new Uint8Array(ICON_SIZE * ICON_SIZE * 4);
  const set = (x: number, y: number, [r, g, b, a]: Rgba) => {
    const i = (y * ICON_SIZE + x) * 4;
    px[i] = b;
    px[i + 1] = g;
    px[i + 2] = r;
    px[i + 3] = a;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: Rgba) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };

  rect(3, 6, 28, 28, BLUE); // outline
  rect(5, 13, 26, 26, WHITE); // page
  for (const x of [9, 21]) rect(x, 3, x + 1, 9, GRAY); // binder rings
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) rect(7 + col * 5, 15 + row * 4, 9 + col * 5, 16 + row * 4, BLUE); // days
  }
  if (error) {
    for (let y = 18; y < ICON_SIZE; y++) {
      for (let x = 18; x < ICON_SIZE; x++) {
        if ((x - 25) ** 2 + (y - 25) ** 2 <= 36) set(x, y, RED);
      }
    }
    rect(24, 21, 25, 26, WHITE); // "!"
    rect(24, 28, 25, 28, WHITE);
  }
  return px;
}
