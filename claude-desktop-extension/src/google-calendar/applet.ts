// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The MCPB's side of calendar sync: install the `openrecord-calendar` binary
 * (one per OS and architecture ships in applet/), drive it through Google
 * consent and a first sync, then register its tray mode to start at login —
 * a LaunchAgent on macOS, the per-user Run key on Windows.
 *
 * The MCPB never holds the Google token itself. The binary does the consent
 * flow and stores the token, so the token's keystore item belongs to the
 * program that reads it every four hours. That item is the only one it
 * creates; the MyChart passwords and passkeys it reads are the MCPB's. On
 * macOS the first background read of one raises the keychain's "Always Allow"
 * prompt; Windows Credential Manager has no per-app access, so it asks nothing.
 */

import { execFile, execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readState, type LastSync } from './store';

export const AGENT_LABEL = 'com.fanpierlabs.openrecord.calendar';
export const AGENT_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);
export const SYNC_LOG = path.join(os.homedir(), 'Library', 'Logs', 'OpenRecord Calendar.log');
export const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const RUN_VALUE = 'OpenRecord Calendar';

const windows = () => process.platform === 'win32';
/**
 * A Windows tool by absolute path, so a same-named program earlier on PATH
 * can never run in its place.
 */
export function system32(tool: string): string {
  return `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\${tool}.exe`;
}

const exe = () => (windows() ? '.exe' : '');

// `__dirname` is dist/ once bundled; the build puts the binaries in applet/ beside it.
const bundledBinary = () =>
  path.resolve(__dirname, '..', 'applet', `openrecord-calendar-${windows() ? 'windows' : 'darwin'}-${process.arch}${exe()}`);
// Beside the credentials it reads, and outside the extension, so an extension
// update can't pull it out from under a running tray icon.
const workerPath = () => path.join(os.homedir(), '.openrecord-mcpb', 'bin', `openrecord-calendar${exe()}`);

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
function unsupportedReason(): string | null {
  if (process.platform !== 'darwin' && !windows()) return 'Google Calendar sync needs macOS or Windows: it runs from a menu-bar or tray icon.';
  if (!fs.existsSync(bundledBinary())) return 'This build of OpenRecord does not include Google Calendar sync for this computer.';
  return null;
}

function run(file: string, args: string[], timeout: number): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 1024 * 1024, windowsHide: true }, (err, stdout) => {
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
  return parseWorkerOutput((await run(workerPath(), [command], timeout)).stdout);
}

const guiDomain = () => `gui/${process.getuid?.() ?? 501}`;

/** Stop a running copy and install a fresh one, so an updated extension updates the binary. */
async function installBinary(): Promise<void> {
  const worker = workerPath();
  // Windows won't replace a running .exe, so the old tray has to go first there too.
  if (windows()) await run(system32('taskkill'), ['/F', '/IM', path.basename(worker)], 10_000);
  else await run('/bin/launchctl', ['bootout', `${guiDomain()}/${AGENT_LABEL}`], 10_000);
  fs.mkdirSync(path.dirname(worker), { recursive: true });
  // Copy to a temp name and rename over: never a half-written binary at the real path.
  const temp = `${worker}.new`;
  fs.copyFileSync(bundledBinary(), temp);
  fs.chmodSync(temp, 0o755);
  fs.renameSync(temp, worker);
  // Copied out of an extension Claude unpacked from a download, the binary can
  // carry the download's mark — macOS quarantine, or Windows' Zone.Identifier
  // stream — which would get it blocked when it starts at login.
  if (windows()) {
    try { fs.unlinkSync(`${worker}:Zone.Identifier`); } catch { /* no mark: nothing to remove */ }
  }
  else await run('/usr/bin/xattr', ['-d', 'com.apple.quarantine', worker], 10_000);
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
    <string>tray</string>
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
  const worker = workerPath();
  if (windows()) {
    const { code } = await run(system32('reg'), ['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', `"${worker}" tray`, '/f'], 10_000);
    if (code !== 0) throw new Error('Could not set OpenRecord Calendar to start at sign-in (reg add failed).');
    spawn(worker, ['tray'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  fs.mkdirSync(path.dirname(AGENT_PLIST), { recursive: true });
  fs.writeFileSync(AGENT_PLIST, launchAgentPlist(worker));
  const { code } = await run('/bin/launchctl', ['bootstrap', guiDomain(), AGENT_PLIST], 10_000);
  if (code !== 0) throw new Error('Could not start the OpenRecord Calendar menu-bar item (launchctl bootstrap failed).');
}

/** Whether the tray is set to start at login. */
function startsAtLogin(): boolean {
  if (!windows()) return fs.existsSync(AGENT_PLIST);
  try {
    execFileSync(system32('reg'), ['query', RUN_KEY, '/v', RUN_VALUE], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export interface ConnectOutcome {
  sync: WorkerResult;
}

/** Install the binary, run Google consent in the browser, sync once, and start the tray icon at login. */
export async function connectGoogleCalendar(): Promise<ConnectOutcome> {
  const unsupported = unsupportedReason();
  if (unsupported) throw new Error(unsupported);
  await installBinary();
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
  return { enabled: !!state.connectedAt && startsAtLogin(), lastSync: state.lastSync ?? null };
}
