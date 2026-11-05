// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The MCPB's side of calendar sync: install the "OpenRecord Calendar"
 * menu-bar app, drive its worker binary through Google consent and a first
 * sync, then register it to start at login.
 *
 * The MCPB never holds the Google token itself. The worker binary does the
 * consent flow and stores the token, so the token's keychain item belongs to
 * the program that reads it every four hours. That item is the only one it
 * creates; the MyChart passwords and passkeys it reads are the MCPB's (the
 * first background read of one raises macOS's "Always Allow" prompt).
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readState, type LastSync } from './store';

const APP_NAME = 'OpenRecord Calendar.app';
const WORKER_NAME = 'openrecord-calendar-sync';
const APP_EXECUTABLE = 'OpenRecordCalendar';
export const AGENT_LABEL = 'com.fanpierlabs.openrecord.calendar';

// `__dirname` is dist/ once bundled; the build puts the app in applet/ beside it.
const BUNDLED_APP = path.resolve(__dirname, '..', 'applet', APP_NAME);
const INSTALLED_APP = path.join(os.homedir(), 'Applications', APP_NAME);
const WORKER = path.join(INSTALLED_APP, 'Contents', 'MacOS', WORKER_NAME);
const AGENT_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);

// Consent waits up to 5 minutes inside the worker; a sync is a few portal reads per account.
const CONNECT_TIMEOUT_MS = 6 * 60_000;
const SYNC_TIMEOUT_MS = 10 * 60_000;

export interface WorkerResult {
  ok: boolean;
  error?: string;
  synced?: number;
  accounts?: Array<{ account: string; synced: number; removed: number; error?: string }>;
}

/** Why calendar sync can't run on this machine, or null when it can. */
export function unsupportedReason(): string | null {
  if (process.platform !== 'darwin') return 'Google Calendar sync needs macOS: it runs from a menu-bar app.';
  if (process.arch !== 'arm64') return 'Google Calendar sync needs a Mac with Apple silicon.';
  if (!fs.existsSync(BUNDLED_APP)) return 'This build of OpenRecord does not include the calendar menu-bar app.';
  return null;
}

function run(file: string, args: string[], timeout: number): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout) });
    });
  });
}

/** The worker's one line of JSON, or a failure saying why there wasn't one. */
export function parseWorkerOutput(stdout: string): WorkerResult {
  const line = stdout.trim().split('\n').pop() ?? '';
  try {
    const parsed = JSON.parse(line) as WorkerResult;
    if (typeof parsed.ok === 'boolean') return parsed;
  } catch { /* fall through */ }
  return { ok: false, error: 'The calendar sync worker stopped without reporting a result.' };
}

async function runWorker(command: string, timeout: number): Promise<WorkerResult> {
  return parseWorkerOutput((await run(WORKER, [command], timeout)).stdout);
}

const guiDomain = () => `gui/${process.getuid?.() ?? 501}`;

/** Stop a running copy and put a fresh one in ~/Applications, so an updated extension updates the app. */
async function installApp(): Promise<void> {
  await run('/bin/launchctl', ['bootout', `${guiDomain()}/${AGENT_LABEL}`], 10_000);
  fs.rmSync(INSTALLED_APP, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(INSTALLED_APP), { recursive: true });
  fs.cpSync(BUNDLED_APP, INSTALLED_APP, { recursive: true });
  // Copied out of an extension Claude unpacked from a download, the bundle can
  // carry the download's quarantine flag, which would stop launchd starting it.
  await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', INSTALLED_APP], 10_000);
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function launchAgentPlist(executable: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(executable)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`;
}

/** Start at every login, and now. */
async function startAtLogin(): Promise<void> {
  fs.mkdirSync(path.dirname(AGENT_PLIST), { recursive: true });
  fs.writeFileSync(AGENT_PLIST, launchAgentPlist(path.join(INSTALLED_APP, 'Contents', 'MacOS', APP_EXECUTABLE)));
  const { code } = await run('/bin/launchctl', ['bootstrap', guiDomain(), AGENT_PLIST], 10_000);
  if (code !== 0) throw new Error('Could not start the OpenRecord Calendar menu-bar app (launchctl bootstrap failed).');
}

export interface ConnectOutcome {
  sync: WorkerResult;
}

/** Install the app, run Google consent in the browser, sync once, and start the app at login. */
export async function connectGoogleCalendar(): Promise<ConnectOutcome> {
  const unsupported = unsupportedReason();
  if (unsupported) throw new Error(unsupported);
  await installApp();
  const connected = await runWorker('connect', CONNECT_TIMEOUT_MS);
  if (!connected.ok) throw new Error(connected.error ?? 'Google Calendar was not connected.');
  const sync = await runWorker('sync', SYNC_TIMEOUT_MS);
  await startAtLogin();
  return { sync };
}

export interface CalendarSyncStatus {
  enabled: boolean;
  lastSync: LastSync | null;
}

export function calendarSyncStatus(): CalendarSyncStatus {
  const state = readState();
  return { enabled: !!state.connectedAt && fs.existsSync(AGENT_PLIST), lastSync: state.lastSync ?? null };
}
