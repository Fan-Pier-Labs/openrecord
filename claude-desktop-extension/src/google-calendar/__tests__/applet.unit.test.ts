// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The installer, with nothing real touched: `fs` is in-memory for the store
 * root, ~/Library and the bundled binary, and `child_process` stands in for
 * launchctl, xattr and the calendar binary. No launchd job is ever loaded.
 */

import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as crypto from 'node:crypto';
import * as realFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

process.env.OPENRECORD_SECRET_BACKEND = 'file';

const HOME = os.homedir();
const ROOT = path.join(HOME, '.openrecord-mcpb');
const LIBRARY = path.join(HOME, 'Library');
const WORKER = path.join(ROOT, 'bin', 'openrecord-calendar');
const PLIST = path.join(LIBRARY, 'LaunchAgents', 'com.fanpierlabs.openrecord.calendar.plist');
// applet.ts resolves applet/ from its own directory's parent: src/ here, the extension root once bundled into dist/.
const APPLET = path.resolve(import.meta.dir, '..', '..', 'applet');
const LOCAL_BUILD = path.join(APPLET, `openrecord-calendar-darwin-${process.arch}`);
const HASHES = path.join(APPLET, 'calendar-binaries.json');
const LOG = path.join(LIBRARY, 'Logs', 'OpenRecord Calendar.log');
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const files = new Map<string, string>();
const ours = (p: unknown): p is string =>
  typeof p === 'string' && (p.startsWith(ROOT) || p.startsWith(LIBRARY) || p === LOCAL_BUILD || p === HASHES);
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

/** Every command run, and what the calendar binary answers per subcommand. */
let commands: string[][] = [];
let replies: Record<string, string> = {};
let bootstrapFails = false;
type Done = (err: Error | null, stdout: string, stderr: string) => void;
void mock.module('child_process', () => ({
  execFile: (file: string, args: string[], _opts: unknown, done: Done) => {
    commands.push([path.basename(file), ...args]);
    if (file === WORKER) {
      const out = replies[args[0]!];
      done(out === undefined ? Object.assign(new Error('crashed'), { code: 1 }) : null, out ?? '', '');
    } else if (args[0] === 'bootstrap' && bootstrapFails) {
      done(Object.assign(new Error('bootstrap'), { code: 5 }), '', '');
    } else {
      done(null, '', '');
    }
  },
}));

const realPlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'darwin' });
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

const applet = await import('../applet');
const { buildAuthUrl, SCOPE } = await import('../google-api');
const { setTestTransport } = await import('../../../../scrapers/http');

/** What the download URL serves, and every URL requested. */
let served: string | null = null;
let requested: string[] = [];

beforeEach(() => {
  files.clear();
  files.set(LOCAL_BUILD, 'binary');
  files.set(HASHES, JSON.stringify({ [process.arch]: sha256('binary') }));
  served = null;
  requested = [];
  setTestTransport(async (url) => {
    requested.push(url);
    return served === null ? new Response('', { status: 404 }) : new Response(served);
  });
  commands = [];
  replies = { connect: '{"ok":true}', sync: '{"ok":true,"synced":2,"accounts":[]}', disconnect: '{"ok":true}' };
  bootstrapFails = false;
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

  it('downloads the released binary when this is not a checkout with its own build', async () => {
    files.delete(LOCAL_BUILD);
    served = 'binary';
    await applet.connectGoogleCalendar();
    expect(requested).toEqual([`${applet.DOWNLOAD_BASE}openrecord-calendar-darwin-${process.arch}-${sha256('binary')}`]);
    expect(files.get(WORKER)).toBe('binary');
  });

  it('refuses a download that is not the released binary, before stopping anything', async () => {
    files.delete(LOCAL_BUILD);
    served = 'tampered';
    await expect(applet.connectGoogleCalendar()).rejects.toThrow('did not match this version');
    expect(files.has(WORKER)).toBe(false);
    expect(commands).toEqual([]);
  });

  it('says so when the download fails', async () => {
    files.delete(LOCAL_BUILD);
    await expect(applet.connectGoogleCalendar()).rejects.toThrow('HTTP 404');
  });

  it('downloads nothing when the released binary is already installed', async () => {
    files.delete(LOCAL_BUILD);
    files.set(WORKER, 'binary');
    await applet.connectGoogleCalendar();
    expect(requested).toEqual([]);
    expect(commands.some((c) => c[0] === 'xattr')).toBe(false);
  });

  it('refuses where it cannot run', async () => {
    files.delete(HASHES);
    await expect(applet.connectGoogleCalendar()).rejects.toThrow('does not include Google Calendar sync for this Mac');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      await expect(applet.connectGoogleCalendar()).rejects.toThrow('needs macOS');
    } finally {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    }
    expect(commands).toEqual([]);
  });
});

describe('uninstallGoogleCalendar', () => {
  it('disconnects through the binary, stops it, and deletes it, its login item and its log', async () => {
    await applet.connectGoogleCalendar();
    files.set(LOG, 'log');
    commands = [];
    await applet.uninstallGoogleCalendar();
    expect(commands.map((c) => c.slice(0, 2).join(' '))).toEqual(['openrecord-calendar disconnect', 'launchctl bootout']);
    for (const f of [WORKER, PLIST, LOG]) expect(files.has(f)).toBe(false);
    expect(applet.calendarSyncStatus().enabled).toBe(false);
  });

  it('revokes and forgets Google itself when the binary is already gone, keeping the calendar id', async () => {
    const state = path.join(ROOT, 'google-calendar.json');
    files.set(state, JSON.stringify({ calendarId: 'cal', connectedAt: 'x' }));
    files.set(path.join(ROOT, 'google-calendar-token.json'), JSON.stringify({ refreshToken: 'tok' }));
    served = '';
    await applet.uninstallGoogleCalendar();
    expect(requested.some((u) => u.includes('revoke') && u.includes('token=tok'))).toBe(true);
    expect(files.has(path.join(ROOT, 'google-calendar-token.json'))).toBe(false);
    expect(JSON.parse(files.get(state)!)).toEqual({ calendarId: 'cal' });
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
