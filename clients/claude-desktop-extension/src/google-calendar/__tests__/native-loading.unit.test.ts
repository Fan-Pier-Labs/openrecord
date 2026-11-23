// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * One binary carries both trays, so importing them must load no native
 * library: AppKit doesn't exist on Windows and user32.dll doesn't exist on
 * macOS, and a dlopen at import would kill every command on the other OS.
 */

import { expect, it, mock } from 'bun:test';

const realFfi = await import('bun:ffi');
const opened: string[] = [];
void mock.module('bun:ffi', () => ({
  ...realFfi,
  dlopen: (lib: string) => {
    opened.push(lib);
    throw new Error(`dlopen(${lib}) at import time`);
  },
}));

it('imports both trays without opening a native library', async () => {
  const mac = await import('../tray');
  const windows = await import('../tray-windows');
  expect(typeof mac.runTray).toBe('function');
  expect(typeof windows.runTrayWindows).toBe('function');
  expect(opened).toEqual([]);
});
