// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The menu-bar item: `openrecord-calendar tray`, the mode the LaunchAgent
 * starts at login. AppKit, driven from TypeScript through `bun:ffi` (./objc).
 *
 * AppKit owns the main thread: `[NSApp run]` never returns to the JS event
 * loop, so everything after it happens in callbacks AppKit makes — a menu
 * click, a timer, a wake notification — each of which runs synchronously and
 * returns. Nothing polls while idle; the process sleeps in the run loop.
 *
 * A sync runs as a child process of this same binary (`sync`), started with
 * NSTask, because the JS event loop that would drive an in-process sync's
 * network requests never gets to run. The child writes its outcome to the
 * state file, which is what the menu reads.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { FFIType } from 'bun:ffi';

import { AGENT_LABEL, AGENT_PLIST, SYNC_LOG } from './applet';
import { cls, defineHandler, msg, msgTyped, nsstr, sel, type Id } from './objc';
import { readState, writeState, type LastSync } from './store';
import { failedRun } from './sync';
import { iconSymbol, isSyncDue, statusLines, stopNotice } from './tray-menu';

// Check often rather than arming one 4-hour timer: a timer's clock stops
// while the Mac sleeps, so a laptop opened in the morning would otherwise wait
// out the rest of the interval. Each check is one small file read.
const CHECK_INTERVAL_S = 15 * 60;
// The wake notification arrives before Wi-Fi has reconnected, and a sync started
// then would fail and spend one of its three tries on that.
const AFTER_WAKE_S = 30;
// Only while a sync is running, to put the icon back when it finishes.
const SYNCING_POLL_S = 3;
const SYNC_TIMEOUT_MS = 10 * 60_000;

const NS_STATUS_ITEM_SQUARE_LENGTH = -2;
const NS_ACTIVATION_POLICY_ACCESSORY = 1;
const NS_ALERT_FIRST_BUTTON_RETURN = 1000;

const boolArg = (v: boolean): [typeof FFIType.bool, boolean] => [FFIType.bool, v];

// osascript rather than UNUserNotificationCenter, which refuses a process that
// isn't an app bundle. Title and body go in as arguments, so nothing in them
// is ever parsed as AppleScript.
function notify(title: string, body: string): void {
  spawnSync('/usr/bin/osascript', [
    '-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run',
    title, body,
  ], { stdio: 'ignore', timeout: 10_000 });
}

export function runTray(executable: string): never {
  const app = msg(cls('NSApplication'), 'sharedApplication');
  msgTyped(app, 'setActivationPolicy:', FFIType.bool, [[FFIType.i64, NS_ACTIVATION_POLICY_ACCESSORY]]);

  const statusItem = msgTyped<Id>(msg(cls('NSStatusBar'), 'systemStatusBar'), 'statusItemWithLength:', FFIType.ptr, [
    [FFIType.f64, NS_STATUS_ITEM_SQUARE_LENGTH],
  ]);
  // The status bar does not keep its items alive; we do.
  msg(statusItem, 'retain');
  const menu = msg(cls('NSMenu'), 'new');
  msgTyped(menu, 'setAutoenablesItems:', FFIType.void, [boolArg(false)]);

  let task: Id = null;
  let taskStarted = 0;
  let pollTimer: Id = null;
  let syncBefore: LastSync | undefined;
  let syncScheduled = false;
  // The stop last announced, so one that persists isn't announced after every later sync.
  let notifiedStop: string | null = null;

  const syncing = () => task !== null && msgTyped<boolean>(task, 'isRunning', FFIType.bool, []);

  function setIcon(): void {
    const image = msg(cls('NSImage'), 'imageWithSystemSymbolName:accessibilityDescription:',
      nsstr(iconSymbol(readState(), syncing())), nsstr('OpenRecord Calendar'));
    msgTyped(image, 'setTemplate:', FFIType.void, [boolArg(true)]);
    msg(msg(statusItem, 'button'), 'setImage:', image);
  }

  function timer(seconds: number, selector: string, repeats: boolean): Id {
    return msgTyped<Id>(cls('NSTimer'), 'scheduledTimerWithTimeInterval:target:selector:userInfo:repeats:', FFIType.ptr, [
      [FFIType.f64, seconds], [FFIType.ptr, handler], [FFIType.ptr, sel(selector)], [FFIType.ptr, null], boolArg(repeats),
    ]);
  }

  // A scheduled sync counts failures toward the stop and skips what has stopped; Sync Now retries everything from zero.
  function startSync(scheduled: boolean): void {
    if (syncing()) return;
    if (task) msg(task, 'release');
    fs.mkdirSync(path.dirname(SYNC_LOG), { recursive: true });
    fs.writeFileSync(SYNC_LOG, ''); // one run's log at a time, local only
    task = msg(cls('NSTask'), 'new');
    msg(task, 'setExecutableURL:', msg(cls('NSURL'), 'fileURLWithPath:', nsstr(executable)));
    const args = msg(cls('NSMutableArray'), 'arrayWithObject:', nsstr('sync'));
    if (scheduled) msg(args, 'addObject:', nsstr('--scheduled'));
    msg(task, 'setArguments:', args);
    msg(task, 'setStandardOutput:', msg(cls('NSFileHandle'), 'fileHandleWithNullDevice'));
    msg(task, 'setStandardError:', msg(cls('NSFileHandle'), 'fileHandleForWritingAtPath:', nsstr(SYNC_LOG)));
    if (!msgTyped<boolean>(task, 'launchAndReturnError:', FFIType.bool, [[FFIType.ptr, null]])) {
      msg(task, 'release');
      task = null;
      return;
    }
    taskStarted = Date.now();
    syncBefore = readState().lastSync;
    syncScheduled = scheduled;
    pollTimer = timer(SYNCING_POLL_S, 'poll:', true);
    setIcon();
  }

  function confirmTurnOff(): boolean {
    msgTyped(app, 'activateIgnoringOtherApps:', FFIType.void, [boolArg(true)]);
    const alert = msg(cls('NSAlert'), 'new');
    msg(alert, 'setMessageText:', nsstr('Turn off calendar sync?'));
    msg(alert, 'setInformativeText:', nsstr(
      'OpenRecord stops updating your “MyChart Appointments” calendar and removes its access to your Google account. ' +
        'Events already on the calendar stay there.',
    ));
    msg(alert, 'addButtonWithTitle:', nsstr('Turn Off'));
    msg(alert, 'addButtonWithTitle:', nsstr('Cancel'));
    const choice = Number(msgTyped<number | bigint>(alert, 'runModal', FFIType.i64, []));
    msg(alert, 'release');
    return choice === NS_ALERT_FIRST_BUTTON_RETURN;
  }

  function addItem(title: string, action: string | null, opts: { enabled?: boolean; key?: string; target?: Id } = {}): void {
    const item = msg(msg(cls('NSMenuItem'), 'alloc'), 'initWithTitle:action:keyEquivalent:',
      nsstr(title), action ? sel(action) : null, nsstr(opts.key ?? ''));
    if (action) msg(item, 'setTarget:', opts.target ?? handler);
    msgTyped(item, 'setEnabled:', FFIType.void, [boolArg(action !== null && opts.enabled !== false)]);
    msg(menu, 'addItem:', item);
    msg(item, 'release');
  }

  const separator = () => msg(menu, 'addItem:', msg(cls('NSMenuItem'), 'separatorItem'));

  const handler = defineHandler('ORCalendarTrayHandler', {
    'tick:': () => {
      if (isSyncDue(readState(), new Date())) startSync(true);
    },
    'woke:': () => {
      timer(AFTER_WAKE_S, 'tick:', false);
    },
    'poll:': () => {
      if (syncing()) {
        if (Date.now() - taskStarted > SYNC_TIMEOUT_MS) msg(task, 'terminate');
        return;
      }
      msg(pollTimer, 'invalidate');
      pollTimer = null;
      const state = readState();
      // A run that recorded nothing crashed or hit the timeout: a failure like any other.
      if (state.lastSync?.at === syncBefore?.at) {
        writeState({ ...state, lastSync: failedRun(syncBefore, 'The sync stopped before it finished.', syncScheduled, new Date()) });
      }
      setIcon();
      const stop = stopNotice(readState().lastSync);
      if (stop && stop.key !== notifiedStop) notify(stop.title, stop.body);
      notifiedStop = stop?.key ?? null;
    },
    'menuNeedsUpdate:': () => {
      const state = readState();
      const busy = syncing();
      msg(menu, 'removeAllItems');
      addItem('MyChart → Google Calendar', null);
      for (const line of statusLines(state, busy)) addItem(line, null);
      separator();
      addItem('Sync Now', 'syncNow:', { key: 'r', enabled: !busy && !!state.connectedAt });
      addItem('Open Google Calendar', 'openCalendar:');
      separator();
      addItem('Turn Off Calendar Sync…', 'turnOff:');
      addItem('Quit', 'terminate:', { key: 'q', target: app });
    },
    'syncNow:': () => startSync(false),
    'openCalendar:': () => {
      msg(msg(cls('NSWorkspace'), 'sharedWorkspace'), 'openURL:', msg(cls('NSURL'), 'URLWithString:', nsstr('https://calendar.google.com')));
    },
    // Revoke Google access, stop starting at login, and quit. The calendar and
    // its events stay in Google Calendar for the user to keep or delete.
    'turnOff:': () => {
      if (!confirmTurnOff()) return;
      spawnSync(executable, ['disconnect'], { stdio: 'ignore', timeout: 3 * 60_000 });
      fs.rmSync(AGENT_PLIST, { force: true });
      // Unloading our own launchd job also ends this process.
      spawnSync('/bin/launchctl', ['bootout', `gui/${process.getuid?.() ?? 501}/${AGENT_LABEL}`], { stdio: 'ignore' });
      msg(app, 'terminate:', null);
    },
  });

  msg(menu, 'setDelegate:', handler);
  msg(statusItem, 'setMenu:', menu);
  msg(msg(msg(cls('NSWorkspace'), 'sharedWorkspace'), 'notificationCenter'), 'addObserver:selector:name:object:',
    handler, sel('woke:'), nsstr('NSWorkspaceDidWakeNotification'), null);
  timer(CHECK_INTERVAL_S, 'tick:', true);

  setIcon();
  if (isSyncDue(readState(), new Date())) startSync(true);
  msg(app, 'run');
  process.exit(0);
}
