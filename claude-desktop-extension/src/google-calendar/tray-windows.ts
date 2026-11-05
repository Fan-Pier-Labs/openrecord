// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The Windows notification-area icon: `openrecord-calendar.exe tray`, what the
 * per-user Run key starts at login. Same model as the macOS one (./tray.ts),
 * in Win32 over `bun:ffi` (./win32):
 *
 * A hidden top-level window owns the icon, and the main thread blocks in
 * `GetMessageW`, so clicks, timers and the resume-from-sleep broadcast call
 * straight into JS and nothing polls while idle. (Top-level rather than
 * message-only: message-only windows never see WM_POWERBROADCAST.) A sync is a
 * child process of this same binary, checked every few seconds only while it
 * runs; its outcome lands in the state file the menu reads.
 */

import { spawnSync } from 'child_process';
import { FFIType, JSCallback, ptr, type Pointer } from 'bun:ffi';

import { RUN_KEY, RUN_VALUE, system32 } from './applet';
import { readState } from './store';
import { calendarIcon, ICON_SIZE } from './tray-icon';
import { isSyncDue, statusLines } from './tray-menu';
import { win32 } from './win32';
import {
  commandLine, CREATE_NO_WINDOW, IDOK, MB_OKCANCEL_QUESTION, MF, MSG_SIZE, NIM, notifyIconData,
  PBT_APMRESUMEAUTOMATIC, PROCESS_INFORMATION_SIZE, processHandles, readPoint, startupInfo, SW_SHOWNORMAL,
  TPM, WAIT_OBJECT_0, WM, wndClassEx, wstr,
} from './win32-structs';

const CHECK_TIMER = 1;
const POLL_TIMER = 2;
// Same cadence as macOS; see tray.ts for why it is a 15-minute check, not a 4-hour timer.
const CHECK_INTERVAL_MS = 15 * 60_000;
const SYNCING_POLL_MS = 3_000;
const SYNC_TIMEOUT_MS = 10 * 60_000;
const ICON_MESSAGE = WM.APP + 1;
const CMD = { SYNC: 1, OPEN: 2, TURN_OFF: 3, QUIT: 4 } as const;

export function runTrayWindows(executable: string): never {
  const w = win32();
  // Windows keeps pointers into these for as long as the window lives.
  const keepAlive: unknown[] = [];
  const hInstance = w.GetModuleHandleW(null);

  let hwnd: Pointer | null = null;
  let child: { process: Pointer; started: number } | null = null;

  function syncing(): boolean {
    if (!child) return false;
    if (w.WaitForSingleObject(child.process, 0) !== WAIT_OBJECT_0) return true;
    w.CloseHandle(child.process);
    child = null;
    return false;
  }

  function makeIcon(error: boolean): Pointer | null {
    const color = Buffer.from(calendarIcon(error));
    const mask = Buffer.alloc((ICON_SIZE * ICON_SIZE) / 8); // all opaque; the alpha channel shapes it
    keepAlive.push(color, mask);
    return w.CreateIcon(hInstance, ICON_SIZE, ICON_SIZE, 1, 32, ptr(mask), ptr(color));
  }
  const icons = { ok: makeIcon(false), error: makeIcon(true) };

  function notify(op: number): void {
    const state = readState();
    const busy = syncing();
    const icon = state.lastSync?.ok === false && !busy ? icons.error : icons.ok;
    const tip = `OpenRecord Calendar · ${statusLines(state, busy)[0]}`;
    w.Shell_NotifyIconW(op, ptr(notifyIconData(hwnd, { callbackMessage: ICON_MESSAGE, icon, tip })));
  }

  function startSync(): void {
    if (syncing()) return;
    const command = wstr(commandLine(executable, ['sync']));
    const info = Buffer.alloc(PROCESS_INFORMATION_SIZE);
    const started = w.CreateProcessW(null, ptr(command), null, null, 0, CREATE_NO_WINDOW, null, null, ptr(startupInfo()), ptr(info));
    if (!started) return;
    const handles = processHandles(info);
    w.CloseHandle(handles.thread);
    child = { process: handles.process, started: Date.now() };
    w.SetTimer(hwnd, POLL_TIMER, SYNCING_POLL_MS, null);
    notify(NIM.MODIFY);
  }

  function poll(): void {
    if (syncing()) {
      if (child && Date.now() - child.started > SYNC_TIMEOUT_MS) w.TerminateProcess(child.process, 1);
      return;
    }
    w.KillTimer(hwnd, POLL_TIMER);
    notify(NIM.MODIFY);
  }

  function tick(): void {
    if (isSyncDue(readState(), new Date())) startSync();
  }

  function quit(): void {
    w.Shell_NotifyIconW(NIM.DELETE, ptr(notifyIconData(hwnd, { callbackMessage: ICON_MESSAGE, icon: null, tip: '' })));
    w.PostQuitMessage(0);
  }

  /** Revoke Google access, stop starting at login, and quit. The calendar stays in Google Calendar. */
  function turnOff(): void {
    const text = wstr(
      'OpenRecord stops updating your "MyChart Appointments" calendar and removes its access to your Google account. ' +
        'Events already on the calendar stay there.',
    );
    const title = wstr('Turn off calendar sync?');
    if (w.MessageBoxW(hwnd, ptr(text), ptr(title), MB_OKCANCEL_QUESTION) !== IDOK) return;
    spawnSync(executable, ['disconnect'], { stdio: 'ignore', windowsHide: true, timeout: 3 * 60_000 });
    spawnSync(system32('reg'), ['delete', RUN_KEY, '/v', RUN_VALUE, '/f'], { stdio: 'ignore', windowsHide: true });
    quit();
  }

  function showMenu(): void {
    const state = readState();
    const busy = syncing();
    const menu = w.CreatePopupMenu();
    const labels: Buffer[] = [];
    const add = (flags: number, id: number, text: string) => {
      const label = wstr(text);
      labels.push(label);
      w.AppendMenuW(menu, flags, id, ptr(label));
    };
    const separator = () => w.AppendMenuW(menu, MF.SEPARATOR, 0, null);

    add(MF.GRAYED, 0, 'MyChart → Google Calendar');
    for (const line of statusLines(state, busy)) add(MF.GRAYED, 0, line);
    separator();
    add(busy || !state.connectedAt ? MF.GRAYED : MF.STRING, CMD.SYNC, 'Sync Now');
    add(MF.STRING, CMD.OPEN, 'Open Google Calendar');
    separator();
    add(MF.STRING, CMD.TURN_OFF, 'Turn Off Calendar Sync…');
    add(MF.STRING, CMD.QUIT, 'Quit');

    const cursor = Buffer.alloc(8);
    w.GetCursorPos(ptr(cursor));
    const { x, y } = readPoint(cursor);
    // Without this the menu won't close when the user clicks elsewhere (a documented tray quirk).
    w.SetForegroundWindow(hwnd);
    const chosen = w.TrackPopupMenu(menu, TPM.RETURNCMD | TPM.RIGHTBUTTON | TPM.NONOTIFY, x, y, 0, hwnd, null);
    w.PostMessageW(hwnd, WM.NULL, 0, 0);
    w.DestroyMenu(menu);

    if (chosen === CMD.SYNC) startSync();
    else if (chosen === CMD.OPEN) {
      const verb = wstr('open');
      const url = wstr('https://calendar.google.com');
      w.ShellExecuteW(null, ptr(verb), ptr(url), null, null, SW_SHOWNORMAL);
    } else if (chosen === CMD.TURN_OFF) turnOff();
    else if (chosen === CMD.QUIT) quit();
  }

  // Explorer restarting (or starting after us) drops every tray icon; it broadcasts this so apps can re-add theirs.
  const taskbarCreatedName = wstr('TaskbarCreated');
  const taskbarCreated = w.RegisterWindowMessageW(ptr(taskbarCreatedName));

  const wndProc = new JSCallback(
    (window: Pointer | null, message: number, wParam: number | bigint, lParam: number | bigint) => {
      if (message === ICON_MESSAGE) {
        const event = Number(lParam) & 0xffff;
        if (event === WM.LBUTTONUP || event === WM.RBUTTONUP) showMenu();
        return 0;
      }
      if (message === WM.TIMER) {
        if (Number(wParam) === CHECK_TIMER) tick();
        else if (Number(wParam) === POLL_TIMER) poll();
        return 0;
      }
      if (message === WM.POWERBROADCAST && Number(wParam) === PBT_APMRESUMEAUTOMATIC) tick();
      if (message === taskbarCreated && taskbarCreated !== 0) {
        notify(NIM.ADD);
        return 0;
      }
      return w.DefWindowProcW(window, message, wParam, lParam);
    },
    { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.i64], returns: FFIType.i64 },
  );

  const className = wstr('OpenRecordCalendarTray');
  const windowClass = wndClassEx(wndProc.ptr, hInstance, className);
  const title = wstr('OpenRecord Calendar');
  keepAlive.push(wndProc, className, windowClass, title, taskbarCreatedName);
  w.RegisterClassExW(ptr(windowClass));
  hwnd = w.CreateWindowExW(0, ptr(className), ptr(title), 0, 0, 0, 0, 0, null, null, hInstance, null);
  if (!hwnd) throw new Error('Could not create the OpenRecord Calendar tray window.');

  notify(NIM.ADD);
  w.SetTimer(hwnd, CHECK_TIMER, CHECK_INTERVAL_MS, null);
  tick();

  const message = Buffer.alloc(MSG_SIZE);
  while (w.GetMessageW(ptr(message), null, 0, 0) > 0) {
    w.TranslateMessage(ptr(message));
    w.DispatchMessageW(ptr(message));
  }
  process.exit(0);
}
