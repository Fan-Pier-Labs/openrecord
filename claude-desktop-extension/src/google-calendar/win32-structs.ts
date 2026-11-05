// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The Win32 structs and constants the Windows tray (./tray-windows) passes to
 * ./win32. The builders lay out 64-bit Windows structs byte for byte — the
 * offsets are the documented x64 layouts, which Arm64 shares — and are pinned
 * by win32-structs.unit.test.ts, because a wrong offset fails silently.
 */

import { ptr, type Pointer } from 'bun:ffi';

/** A NUL-terminated UTF-16 string. Keep the Buffer referenced for as long as Windows may read it. */
export const wstr = (s: string): Buffer => Buffer.from(`${s}\0`, 'utf16le');

const addr = (p: Pointer | null): bigint => BigInt(p ?? 0);

// ── Messages and constants ──────────────────────────────────────────────────

export const WM = {
  DESTROY: 0x0002,
  TIMER: 0x0113,
  POWERBROADCAST: 0x0218,
  LBUTTONUP: 0x0202,
  RBUTTONUP: 0x0205,
  NULL: 0x0000,
  APP: 0x8000,
} as const;
export const PBT_APMRESUMEAUTOMATIC = 0x12;
export const NIM = { ADD: 0, MODIFY: 1, DELETE: 2 } as const;
export const NIF = { MESSAGE: 0x1, ICON: 0x2, TIP: 0x4 } as const;
export const MF = { STRING: 0x0, GRAYED: 0x1, SEPARATOR: 0x800 } as const;
export const TPM = { RIGHTBUTTON: 0x2, NONOTIFY: 0x80, RETURNCMD: 0x100 } as const;
export const MB_OKCANCEL_QUESTION = 0x1 | 0x20;
export const IDOK = 1;
export const SW_SHOWNORMAL = 1;
export const CREATE_NO_WINDOW = 0x08000000;
export const WAIT_OBJECT_0 = 0;

// ── Structs (x64 / Arm64 layouts) ───────────────────────────────────────────

export const NOTIFYICONDATAW_SIZE = 976;
const TIP_CHARS = 128;

/** NOTIFYICONDATAW: cbSize@0, hWnd@8, uID@16, uFlags@20, uCallbackMessage@24, hIcon@32, szTip@40. */
export function notifyIconData(hwnd: Pointer | null, opts: { callbackMessage: number; icon: Pointer | null; tip: string }): Buffer {
  const buf = Buffer.alloc(NOTIFYICONDATAW_SIZE);
  buf.writeUInt32LE(NOTIFYICONDATAW_SIZE, 0);
  buf.writeBigUInt64LE(addr(hwnd), 8);
  buf.writeUInt32LE(1, 16);
  buf.writeUInt32LE(NIF.MESSAGE | NIF.ICON | NIF.TIP, 20);
  buf.writeUInt32LE(opts.callbackMessage, 24);
  buf.writeBigUInt64LE(addr(opts.icon), 32);
  // szTip is 128 WCHARs including the terminator.
  Buffer.from(opts.tip.slice(0, TIP_CHARS - 1), 'utf16le').copy(buf, 40);
  return buf;
}

export const WNDCLASSEXW_SIZE = 80;

/** WNDCLASSEXW: cbSize@0, lpfnWndProc@8, hInstance@24, lpszClassName@64. */
export function wndClassEx(wndProc: Pointer | null, hInstance: Pointer | null, className: Buffer): Buffer {
  const buf = Buffer.alloc(WNDCLASSEXW_SIZE);
  buf.writeUInt32LE(WNDCLASSEXW_SIZE, 0);
  buf.writeBigUInt64LE(addr(wndProc), 8);
  buf.writeBigUInt64LE(addr(hInstance), 24);
  buf.writeBigUInt64LE(addr(ptr(className)), 64);
  return buf;
}

export const MSG_SIZE = 48;
export const STARTUPINFOW_SIZE = 104;
export const PROCESS_INFORMATION_SIZE = 24;

/** STARTUPINFOW: only cb is needed; the rest zero means "defaults". */
export function startupInfo(): Buffer {
  const buf = Buffer.alloc(STARTUPINFOW_SIZE);
  buf.writeUInt32LE(STARTUPINFOW_SIZE, 0);
  return buf;
}

/** PROCESS_INFORMATION: hProcess@0, hThread@8. */
export function processHandles(info: Buffer): { process: Pointer; thread: Pointer } {
  return {
    process: Number(info.readBigUInt64LE(0)) as Pointer,
    thread: Number(info.readBigUInt64LE(8)) as Pointer,
  };
}

/** POINT: x@0, y@4. */
export function readPoint(buf: Buffer): { x: number; y: number } {
  return { x: buf.readInt32LE(0), y: buf.readInt32LE(4) };
}

/** A command line with the program quoted, as CreateProcessW parses it. */
export function commandLine(program: string, args: string[]): string {
  return [program, ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');
}
