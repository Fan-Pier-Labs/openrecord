// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Just enough Win32, over `bun:ffi`, for the notification-area icon: a hidden
 * window and its message loop, the tray icon, a popup menu, timers, a message
 * box, and launching the sync as a child process. Windows-only; loaded on
 * first use so the same binary still starts on macOS.
 *
 * The structs and constants it is called with are in ./win32-structs.
 */

import { dlopen, FFIType } from 'bun:ffi';

function load() {
  const { u8, u16, u32, i32, u64, i64, ptr: p, void: none } = FFIType;
  const user32 = dlopen('user32.dll', {
    RegisterClassExW: { args: [p], returns: u16 },
    CreateWindowExW: { args: [u32, p, p, u32, i32, i32, i32, i32, p, p, p, p], returns: p },
    DefWindowProcW: { args: [p, u32, u64, i64], returns: i64 },
    GetMessageW: { args: [p, p, u32, u32], returns: i32 },
    TranslateMessage: { args: [p], returns: i32 },
    DispatchMessageW: { args: [p], returns: i64 },
    PostQuitMessage: { args: [i32], returns: none },
    PostMessageW: { args: [p, u32, u64, i64], returns: i32 },
    SetTimer: { args: [p, u64, u32, p], returns: u64 },
    KillTimer: { args: [p, u64], returns: i32 },
    CreatePopupMenu: { args: [], returns: p },
    AppendMenuW: { args: [p, u32, u64, p], returns: i32 },
    TrackPopupMenu: { args: [p, u32, i32, i32, i32, p, p], returns: i32 },
    DestroyMenu: { args: [p], returns: i32 },
    GetCursorPos: { args: [p], returns: i32 },
    SetForegroundWindow: { args: [p], returns: i32 },
    MessageBoxW: { args: [p, p, p, u32], returns: i32 },
    RegisterWindowMessageW: { args: [p], returns: u32 },
    CreateIcon: { args: [p, i32, i32, u8, u8, p, p], returns: p },
  }).symbols;
  const shell32 = dlopen('shell32.dll', {
    Shell_NotifyIconW: { args: [u32, p], returns: i32 },
    ShellExecuteW: { args: [p, p, p, p, p, i32], returns: p },
  }).symbols;
  const kernel32 = dlopen('kernel32.dll', {
    GetModuleHandleW: { args: [p], returns: p },
    CreateProcessW: { args: [p, p, p, p, i32, u32, p, p, p, p], returns: i32 },
    WaitForSingleObject: { args: [p, u32], returns: u32 },
    TerminateProcess: { args: [p, u32], returns: i32 },
    CloseHandle: { args: [p], returns: i32 },
  }).symbols;
  return { ...user32, ...shell32, ...kernel32 };
}

let loaded: ReturnType<typeof load> | undefined;
export const win32 = () => (loaded ??= load());
