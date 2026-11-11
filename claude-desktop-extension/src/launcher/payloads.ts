// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The server builds the launcher can run, and where downloaded ones live.
 *
 * A payload is a folder holding `server.cjs` and whatever must sit beside it
 * (the sqlite .wasm). The one inside the installed .mcpb is the floor; anything
 * newer that was downloaded, verified and not marked bad goes in front of it.
 * Downloaded folders are never overwritten — Windows locks a running file — so
 * each version gets its own folder and the newest good one wins at startup.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { compareVersions, validate } from 'compare-versions';

export const VERSIONS_DIR = path.join(os.homedir(), '.openrecord-mcpb', 'versions');

/**
 * What a payload may assume of the launcher running it: that NODE_PATH reaches
 * this install's node_modules, where the @napi-rs/keyring binary is. A payload
 * cannot bring native code with it, so a release that changes the keyring
 * version or adds a native dependency bumps this, and every older launcher
 * refuses that payload and tells the user to reinstall.
 */
export const LAUNCHER_ABI = 1;

export const PAYLOAD_MANIFEST = 'payload.json';
export const DOWNLOAD_PREFIX = '.download-';
const BAD_MARKER = 'BAD';

export interface PayloadManifest {
  version: string;
  launcherAbi: number;
  /** File name → sha256 hex. */
  files: Record<string, string>;
}

export interface Payload {
  version: string;
  dir: string;
  bundled: boolean;
}

/** A plain name with no leading dot: never `..`, never a path, never the manifest itself. */
export function isSafeFileName(name: string): boolean {
  return /^[\w-][\w.-]*$/.test(name) && name !== PAYLOAD_MANIFEST;
}

export function parsePayloadManifest(text: string): PayloadManifest | null {
  try {
    const doc = JSON.parse(text) as Partial<PayloadManifest>;
    if (typeof doc.version !== 'string' || !validate(doc.version)) return null;
    if (typeof doc.launcherAbi !== 'number') return null;
    if (typeof doc.files !== 'object' || doc.files === null) return null;
    const files = Object.entries(doc.files);
    if (!files.some(([name]) => name === 'server.cjs')) return null;
    if (!files.every(([name, sha]) => isSafeFileName(name) && typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha))) {
      return null;
    }
    return { version: doc.version, launcherAbi: doc.launcherAbi, files: doc.files };
  } catch {
    return null;
  }
}

function readManifest(dir: string): PayloadManifest | null {
  try {
    return parsePayloadManifest(fs.readFileSync(path.join(dir, PAYLOAD_MANIFEST), 'utf8'));
  } catch {
    return null;
  }
}

/** Payloads to try, best first: downloaded ones newer than the bundled one, then the bundled one. */
export function payloadOrder(bundled: Payload, versionsDir: string = VERSIONS_DIR): Payload[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(versionsDir);
  } catch {
    // Nothing downloaded yet.
  }
  const downloaded = names
    .filter((name) => validate(name) && compareVersions(name, bundled.version) > 0)
    .map((name) => ({ version: name, dir: path.join(versionsDir, name), bundled: false }))
    .filter((p) => installState(p.version, versionsDir) === 'ready')
    .sort((a, b) => compareVersions(b.version, a.version));
  return [...downloaded, bundled];
}

/** `ready` to run, `bad` (failed to start once, never retried), or `missing`. */
export function installState(version: string, versionsDir: string = VERSIONS_DIR): 'ready' | 'bad' | 'missing' {
  const dir = path.join(versionsDir, version);
  if (fs.existsSync(path.join(dir, BAD_MARKER))) return 'bad';
  const manifest = readManifest(dir);
  return manifest?.version === version && manifest.launcherAbi <= LAUNCHER_ABI ? 'ready' : 'missing';
}

export function markBad(payload: Payload): void {
  if (payload.bundled) return;
  try {
    fs.writeFileSync(path.join(payload.dir, BAD_MARKER), '');
  } catch {
    // The folder is gone; nothing left to run from it anyway.
  }
}

/**
 * Remove downloaded versions other than `keep`, and downloads abandoned over a
 * day ago. Bad versions stay: the marker is what stops them being fetched again.
 */
export function pruneVersions(keep: string[], versionsDir: string = VERSIONS_DIR): void {
  let names: string[] = [];
  try {
    names = fs.readdirSync(versionsDir);
  } catch {
    return;
  }
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of names) {
    const dir = path.join(versionsDir, name);
    try {
      const abandoned = name.startsWith(DOWNLOAD_PREFIX) && fs.statSync(dir).mtimeMs < dayAgo;
      const superseded = validate(name) && !keep.includes(name) && installState(name, versionsDir) !== 'bad';
      if (abandoned || superseded) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // In use (Windows) or already gone; try again after the next update.
    }
  }
}
