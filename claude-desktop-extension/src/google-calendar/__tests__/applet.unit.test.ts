// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The installer, with nothing real touched: `fs` is in-memory for the store
 * root, ~/Library and the bundled binary, and `child_process` stands in for
 * launchctl, xattr and the calendar binary. No launchd job is ever loaded.
 */

import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as realFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

process.env.OPENRECORD_SECRET_BACKEND = 'file';

const HOME = os.homedir();
const ROOT = path.join(HOME, '.openrecord-mcpb');
const LIBRARY = path.join(HOME, 'Library');
const WORKER = path.join(ROOT, 'bin', 'openrecord-calendar');
const PLIST = path.join(LIBRARY, 'LaunchAgents', 'com.fanpierlabs.openrecord.calendar.plist');
const BUNDLED = path.resolve(import.meta.dir, '..', '..', 'applet', `openrecord-calendar-darwin-${process.arch}`);
const BUNDLED_WIN = path.resolve(import.meta.dir, '..', '..', 'applet', `openrecord-calendar-windows-${process.arch}.exe`);
const WORKER_WIN = `${WORKER}.exe`;

const files = new Map<string, string>();
const ours = (p: unknown): p is string =>
  typeof p === 'string' && (p.startsWith(ROOT) || p.startsWith(LIBRARY) || p === BUNDLED || p === BUNDLED_WIN);
const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

const fsMock = {
  ...realFs,
  existsSync: (p: string) => (ours(p) ? files.has(p) : realFs.existsSync(p)),
  readFileSync: (p: string, ...rest: unknown[]) => {
    if (!ours(p)) return (realFs.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
    if (!files.has(p)) throw enoent();
    return files.get(p);
  },
  writeFileSync: (p: string, data: unknown, ...rest: unknown[]) => {
    if (!ours(p)) throw new Error(`test wrote outside the sandbox: ${p} ${rest.length}`);
    files.set(p, String(data));
  },
  mkdirSync: (p: string) => { if (!ours(p)) throw new Error(`mkdir outside the sandbox: ${p}`); },
  chmodSync: (p: string) => { if (!ours(p)) throw new Error(`chmod outside the sandbox: ${p}`); },
  copyFileSync: (from: string, to: string) => {
    if (!ours(from) || !ours(to) || !files.has(from)) throw enoent();
    files.set(to, files.get(from)!);
  },
  renameSync: (from: string, to: string) => {
    if (!ours(from) || !ours(to) || !files.has(from)) throw enoent();
    files.set(to, files.get(from)!);
    files.delete(from);
  },
  unlinkSync: (p: string) => { if (!ours(p) || !files.delete(p)) throw enoent(); },
  rmSync: (p: string) => { if (ours(p)) files.delete(p); },
};
void mock.module('fs', () => fsMock);
void mock.module('node:fs', () => fsMock);

// The file name of a macOS or a Windows path, whichever the code under test built.
const base = (file: string) => file.split(/[\\/]/).pop()!;

/** Every command run, and what the calendar binary answers per subcommand. */
let commands: string[][] = [];
let replies: Record<string, string> = {};
let bootstrapFails = false;
let runKeySet = false;
let launched: string[][] = [];
type Done = (err: Error | null, stdout: string, stderr: string) => void;
void mock.module('child_process', () => ({
  execFile: (file: string, args: string[], _opts: unknown, done: Done) => {
    commands.push([base(file), ...args]);
    if (file === WORKER || file === WORKER_WIN) {
      const out = replies[args[0]!];
      done(out === undefined ? Object.assign(new Error('crashed'), { code: 1 }) : null, out ?? '', '');
    } else if (args[0] === 'bootstrap' && bootstrapFails) {
      done(Object.assign(new Error('bootstrap'), { code: 5 }), '', '');
    } else {
      if (base(file) === 'reg.exe' && args[0] === 'add') runKeySet = true;
      done(null, '', '');
    }
  },
  execFileSync: (file: string, args: string[]) => {
    if (base(file) === 'reg.exe' && args[0] === 'query' && runKeySet) return '';
    throw new Error('not found');
  },
  spawn: (file: string, args: string[]) => {
    launched.push([base(file), ...args]);
    return { unref() {} };
  },
}));

const realPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'darwin' });
afterAll(() => Object.defineProperty(process, 'platform', { value: realPlatform }));

const applet = await import('../applet');
const { buildAuthUrl, SCOPE } = await import('../google-api');

beforeEach(() => {
  files.clear();
  files.set(BUNDLED, 'binary');
  commands = [];
  replies = { connect: '{"ok":true}', sync: '{"ok":true,"synced":2,"accounts":[]}' };
  bootstrapFails = false;
  runKeySet = false;
  launched = [];
});

describe('on Windows', () => {
  const asWindows = async (fn: () => Promise<void>) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      await fn();
    } finally {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    }
  };

  it('stops the old tray, installs the .exe, connects, syncs, and starts the tray now and at every sign-in', async () => {
    files.set(BUNDLED_WIN, 'exe');
    files.set(`${WORKER_WIN}:Zone.Identifier`, '[ZoneTransfer]');
    await asWindows(async () => {
      expect(applet.calendarSyncStatus().enabled).toBe(false);
      const { sync } = await applet.connectGoogleCalendar();
      expect(sync.synced).toBe(2);
      files.set(path.join(ROOT, 'google-calendar.json'), JSON.stringify({ connectedAt: 'x' }));
      expect(applet.calendarSyncStatus().enabled).toBe(true);
    });
    expect(commands.map((c) => c.slice(0, 2).join(' '))).toEqual([
      'taskkill.exe /F', 'openrecord-calendar.exe connect', 'openrecord-calendar.exe sync', 'reg.exe add',
    ]);
    const regAdd = commands.at(-1)!;
    expect(regAdd.slice(1, 5)).toEqual(['add', applet.RUN_KEY, '/v', applet.RUN_VALUE]);
    expect(regAdd.at(-2)).toBe(`"${WORKER_WIN}" tray`);
    expect(launched).toEqual([['openrecord-calendar.exe', 'tray']]);
    expect(files.get(WORKER_WIN)).toBe('exe');
    expect(files.has(`${WORKER_WIN}:Zone.Identifier`)).toBe(false); // download mark removed
  });

  it('refuses on a build without the Windows binary, and on Linux', async () => {
    await asWindows(async () => {
      await expect(applet.connectGoogleCalendar()).rejects.toThrow('does not include Google Calendar sync for this computer');
    });
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      await expect(applet.connectGoogleCalendar()).rejects.toThrow('needs macOS or Windows');
    } finally {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    }
  });
});

describe('connectGoogleCalendar', () => {
  it('installs the binary, connects, syncs once, and starts the menu-bar item at login — in that order', async () => {
    const { sync } = await applet.connectGoogleCalendar();
    expect(sync).toEqual({ ok: true, synced: 2, accounts: [] });
    expect(commands.map((c) => c.slice(0, 2).join(' '))).toEqual([
      'launchctl bootout', 'xattr -d', 'openrecord-calendar connect', 'openrecord-calendar sync', 'launchctl bootstrap',
    ]);
    expect(files.get(WORKER)).toBe('binary');
    expect(files.has(`${WORKER}.new`)).toBe(false);
    expect(files.get(PLIST)).toContain(`<string>${WORKER}</string>\n    <string>tray</string>`);
  });

  it('stops before starting anything when Google consent fails', async () => {
    replies.connect = '{"ok":false,"error":"Google Calendar access was not granted."}';
    await expect(applet.connectGoogleCalendar()).rejects.toThrow('Google Calendar access was not granted.');
    expect(commands.some((c) => c[1] === 'bootstrap')).toBe(false);
    expect(files.has(PLIST)).toBe(false);
  });

  it('turns a worker that dies without a result into an error', async () => {
    delete replies.connect;
    await expect(applet.connectGoogleCalendar()).rejects.toThrow('stopped without reporting a result');
  });

  it('says so when launchd will not start it', async () => {
    bootstrapFails = true;
    await expect(applet.connectGoogleCalendar()).rejects.toThrow('launchctl bootstrap failed');
  });

  it('refuses where it cannot run', async () => {
    files.delete(BUNDLED);
    await expect(applet.connectGoogleCalendar()).rejects.toThrow('does not include Google Calendar sync for this computer');
    expect(commands).toEqual([]);
  });
});

describe('calendarSyncStatus', () => {
  it('is enabled only once connected and set to start at login', async () => {
    expect(applet.calendarSyncStatus()).toEqual({ enabled: false, lastSync: null });
    const lastSync = { at: '2026-11-05T12:00:00Z', ok: true, synced: 2, accounts: [] };
    files.set(path.join(ROOT, 'google-calendar.json'), JSON.stringify({ connectedAt: 'x', lastSync }));
    expect(applet.calendarSyncStatus()).toEqual({ enabled: false, lastSync });
    await applet.connectGoogleCalendar();
    expect(applet.calendarSyncStatus().enabled).toBe(true);
  });
});

describe('parseWorkerOutput', () => {
  it("reads the worker's last stdout line", () => {
    expect(applet.parseWorkerOutput('noise\n{"ok":true,"synced":3}\n')).toEqual({ ok: true, synced: 3 });
  });

  it('turns a crash with no JSON into a failure rather than a success', () => {
    expect(applet.parseWorkerOutput('').ok).toBe(false);
    expect(applet.parseWorkerOutput('Segmentation fault').ok).toBe(false);
    expect(applet.parseWorkerOutput('{"synced":3}').ok).toBe(false);
  });
});

describe('launchAgentPlist', () => {
  it('starts the menu-bar mode at login, escaping the path', () => {
    const plist = applet.launchAgentPlist('/Users/a&b/.openrecord-mcpb/bin/openrecord-calendar');
    expect(plist).toContain(`<string>${applet.AGENT_LABEL}</string>`);
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toContain('<string>/Users/a&amp;b/.openrecord-mcpb/bin/openrecord-calendar</string>\n    <string>tray</string>');
  });
});

describe('buildAuthUrl', () => {
  it('asks only for calendar.app.created, offline, with PKCE', () => {
    const url = new URL(buildAuthUrl('http://127.0.0.1:5555', 'challenge', 'state'));
    expect(url.searchParams.get('scope')).toBe(SCOPE);
    expect(SCOPE).toBe('https://www.googleapis.com/auth/calendar.app.created');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:5555');
  });
});

describe('system32', () => {
  it('names Windows tools by absolute path', () => {
    const saved = process.env.SystemRoot;
    process.env.SystemRoot = 'D:\\Win';
    try {
      expect(applet.system32('reg')).toBe('D:\\Win\\System32\\reg.exe');
      delete process.env.SystemRoot;
      expect(applet.system32('reg')).toBe('C:\\Windows\\System32\\reg.exe');
    } finally {
      if (saved !== undefined) process.env.SystemRoot = saved;
    }
  });
});
