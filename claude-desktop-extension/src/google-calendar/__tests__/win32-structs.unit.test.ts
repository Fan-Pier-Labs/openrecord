// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/** The x64/Arm64 byte layouts, from the Windows SDK headers — a wrong offset fails silently on Windows. */

import { describe, expect, it } from 'bun:test';
import type { Pointer } from 'bun:ffi';

import {
  commandLine, NIF, NOTIFYICONDATAW_SIZE, notifyIconData, processHandles, readPoint, startupInfo, STARTUPINFOW_SIZE,
  WNDCLASSEXW_SIZE, wndClassEx, wstr,
} from '../win32-structs';

const p = (n: number) => n as Pointer;

describe('NOTIFYICONDATAW', () => {
  it('puts each field at its documented offset', () => {
    const buf = notifyIconData(p(0x1234), { callbackMessage: 0x8001, icon: p(0x5678), tip: 'OpenRecord' });
    expect(buf.length).toBe(976);
    expect(NOTIFYICONDATAW_SIZE).toBe(976);
    expect(buf.readUInt32LE(0)).toBe(976); // cbSize
    expect(buf.readBigUInt64LE(8)).toBe(0x1234n); // hWnd
    expect(buf.readUInt32LE(16)).toBe(1); // uID
    expect(buf.readUInt32LE(20)).toBe(NIF.MESSAGE | NIF.ICON | NIF.TIP); // uFlags
    expect(buf.readUInt32LE(24)).toBe(0x8001); // uCallbackMessage
    expect(buf.readBigUInt64LE(32)).toBe(0x5678n); // hIcon
    expect(buf.toString('utf16le', 40, 40 + 20)).toBe('OpenRecord'); // szTip
  });

  it('cuts the tooltip to 127 characters so its terminator survives', () => {
    const buf = notifyIconData(null, { callbackMessage: 0, icon: null, tip: 'x'.repeat(500) });
    expect(buf.toString('utf16le', 40, 40 + 254)).toBe('x'.repeat(127));
    expect(buf.readUInt16LE(40 + 254)).toBe(0);
    expect(buf.readBigUInt64LE(8)).toBe(0n);
  });
});

describe('WNDCLASSEXW, STARTUPINFOW, PROCESS_INFORMATION, POINT', () => {
  it('lay out the fields the tray sets', () => {
    const name = wstr('Cls');
    const cls = wndClassEx(p(0xabc), p(0xdef), name);
    expect(cls.length).toBe(80);
    expect(WNDCLASSEXW_SIZE).toBe(80);
    expect(cls.readUInt32LE(0)).toBe(80);
    expect(cls.readBigUInt64LE(8)).toBe(0xabcn); // lpfnWndProc
    expect(cls.readBigUInt64LE(24)).toBe(0xdefn); // hInstance
    expect(cls.readBigUInt64LE(64)).not.toBe(0n); // lpszClassName

    expect(startupInfo().length).toBe(STARTUPINFOW_SIZE);
    expect(startupInfo().readUInt32LE(0)).toBe(104);

    const info = Buffer.alloc(24);
    info.writeBigUInt64LE(0x11n, 0);
    info.writeBigUInt64LE(0x22n, 8);
    expect(processHandles(info)).toEqual({ process: p(0x11), thread: p(0x22) });

    const pt = Buffer.alloc(8);
    pt.writeInt32LE(-5, 0);
    pt.writeInt32LE(900, 4);
    expect(readPoint(pt)).toEqual({ x: -5, y: 900 });
  });
});

describe('strings and command lines', () => {
  it('terminates UTF-16 strings', () => {
    expect(wstr('ab')).toEqual(Buffer.from([0x61, 0, 0x62, 0, 0, 0]));
  });

  it('quotes a program path with spaces, as CreateProcessW splits on them', () => {
    expect(commandLine('C:\\Users\\Jo Smith\\.openrecord-mcpb\\bin\\openrecord-calendar.exe', ['sync']))
      .toBe('"C:\\Users\\Jo Smith\\.openrecord-mcpb\\bin\\openrecord-calendar.exe" sync');
    expect(commandLine('C:\\bin\\a.exe', ['sync'])).toBe('C:\\bin\\a.exe sync');
  });
});
