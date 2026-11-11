// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The MCPB's side of calendar sync: install the `openrecord-calendar` binary,
 * drive it through Google consent and a first sync, then register its
 * menu-bar mode to start at login — and take all of that back out again.
 *
 * The binary (~100 MB per architecture) is not in the .mcpb: it is downloaded
 * from beside it (deploy.sh uploads it) the first time sync is turned on, and
 * installed only if it hashes to what applet/calendar-binaries.json, which
 * does ship, says this build was released with.
 *
 * The MCPB never holds the Google token itself. The binary does the
 * consent flow and stores the token, so the token's keychain item belongs to
 * the program that reads it every four hours. That item is the only one it
 * creates; the MyChart passwords and passkeys it reads are the MCPB's (the
 * first background read of one raises macOS's "Always Allow" prompt).
 */

import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { scraperFetch } from '../../../scrapers/http';
import { readState, type LastSync } from './store';
import { disconnectGoogle } from './sync';

export const AGENT_LABEL = 'com.fanpierlabs.openrecord.calendar';
export const AGENT_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);
export const SYNC_LOG = path.join(os.homedir(), 'Library', 'Logs', 'OpenRecord Calendar.log');

// `__dirname` is dist/ once bundled; the build writes applet/ beside it.
const HASHES = () => path.resolve(__dirname, '..', 'applet', 'calendar-binaries.json');
// Present only in a checkout that ran build:applet; the .mcpb leaves it out.
const localBuild = () => path.resolve(__dirname, '..', 'applet', `openrecord-calendar-darwin-${process.arch}`);
export const DOWNLOAD_BASE = 'https://openrecord.fanpierlabs.com/calendar/';
// Beside the credentials it reads, and outside the extension, so an extension
// update can't pull it out from under a running menu-bar item.
const WORKER = path.join(os.homedir(), '.openrecord-mcpb', 'bin', 'openrecord-calendar');

// Consent waits up to 5 minutes inside the worker; a sync is a few portal reads per account.
const CONNECT_TIMEOUT_MS = 6 * 60_000;
const SYNC_TIMEOUT_MS = 10 * 60_000;

export interface WorkerResult {
  ok: boolean;
  error?: string;
  synced?: number;
  accounts?: Array<{ account: string; synced: number; removed: number; error?: string }>;
}

const sha256 = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');

/** The SHA-256 of the binary this build was released with, for this Mac's architecture. */
function expectedHash(): string | null {
  try {
    const hash = (JSON.parse(fs.readFileSync(HASHES(), 'utf-8')) as Record<string, unknown>)[process.arch];
    return typeof hash === 'string' ? hash : null;
  } catch {
    return null;
  }
}

/** Why calendar sync can't run on this machine, or null when it can. */
function unsupportedReason(): string | null {
  if (process.platform !== 'darwin') return 'Google Calendar sync needs macOS: it runs from a menu-bar app.';
  if (!expectedHash()) return 'This build of OpenRecord does not include Google Calendar sync for this Mac.';
  return null;
}

/** The binary's bytes — a checkout's own build, else downloaded — refused unless they are the released ones. */
async function fetchBinary(hash: string): Promise<Buffer | string> {
  let bytes: Buffer | string;
  if (fs.existsSync(localBuild())) {
    bytes = fs.readFileSync(localBuild());
  } else {
    const res = await scraperFetch(`${DOWNLOAD_BASE}openrecord-calendar-darwin-${process.arch}-${hash}`);
    if (!res.ok) throw new Error(`Could not download the Google Calendar sync app (HTTP ${res.status}).`);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  if (sha256(bytes) !== hash) {
    throw new Error('The Google Calendar sync app did not match this version of OpenRecord, so it was not installed.');
  }
  return bytes;
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

/**
 * Make WORKER the binary this build was released with, downloading it only
 * when it isn't already, then stop any running copy so the new one starts.
 */
async function installBinary(hash: string): Promise<void> {
  const installed = fs.existsSync(WORKER) && sha256(fs.readFileSync(WORKER)) === hash;
  // Fetched before stopping anything, so a slow or failed download leaves a running menu-bar item alone.
  const bytes = installed ? null : await fetchBinary(hash);
  await run('/bin/launchctl', ['bootout', `${guiDomain()}/${AGENT_LABEL}`], 10_000);
  if (!bytes) return;
  fs.mkdirSync(path.dirname(WORKER), { recursive: true });
  // Write to a temp name and rename over: never a half-written binary at WORKER.
  const temp = `${WORKER}.new`;
  fs.writeFileSync(temp, bytes);
  fs.chmodSync(temp, 0o755);
  fs.renameSync(temp, WORKER);
  // A copy of a local build can carry a quarantine flag, which would stop launchd starting it.
  await run('/usr/bin/xattr', ['-d', 'com.apple.quarantine', WORKER], 10_000);
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
  fs.mkdirSync(path.dirname(AGENT_PLIST), { recursive: true });
  fs.writeFileSync(AGENT_PLIST, launchAgentPlist(WORKER));
  const { code } = await run('/bin/launchctl', ['bootstrap', guiDomain(), AGENT_PLIST], 10_000);
  if (code !== 0) throw new Error('Could not start the OpenRecord Calendar menu-bar item (launchctl bootstrap failed).');
}

export interface ConnectOutcome {
  sync: WorkerResult;
}

/** Install the binary, run Google consent in the browser, sync once, and start the menu-bar item at login. */
export async function connectGoogleCalendar(): Promise<ConnectOutcome> {
  const unsupported = unsupportedReason();
  if (unsupported) throw new Error(unsupported);
  await installBinary(expectedHash()!);
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

/**
 * Turn sync off and remove the menu-bar app: revoke Google access, stop it
 * starting at login, and delete the binary and its log. The calendar ID stays
 * (see `disconnect` in worker.ts), so turning sync on again reuses the calendar.
 */
export async function uninstallGoogleCalendar(): Promise<void> {
  // The binary created the token's keychain item, so it reads it without a
  // prompt; in-process is the fallback when the binary is already gone.
  const viaWorker = fs.existsSync(WORKER) && (await runWorker('disconnect', 3 * 60_000)).ok;
  if (!viaWorker) await disconnectGoogle();
  await run('/bin/launchctl', ['bootout', `${guiDomain()}/${AGENT_LABEL}`], 10_000);
  for (const file of [AGENT_PLIST, WORKER, `${WORKER}.new`, SYNC_LOG]) fs.rmSync(file, { force: true });
}
