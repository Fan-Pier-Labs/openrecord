/**
 * Shared config helpers for reading/writing the OpenClaw plugin config.
 *
 * Passkey credentials are stored in a SEPARATE file (~/.openclaw/openrecord-passkey.json)
 * to avoid the OpenClaw runtime overwriting the signCount when it syncs its
 * in-memory config snapshot back to disk.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const PASSKEY_PATH = path.join(os.homedir(), '.openclaw', 'openrecord-passkey.json');

/** Read the current plugin config object (or empty object if none). */
export function readPluginConfig(): Record<string, string> {
  try {
    const fullConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return fullConfig?.plugins?.entries?.['openclaw-openrecord']?.config ?? {};
  } catch {
    return {};
  }
}

/** Overwrite the entire plugin config. */
export function savePluginConfig(config: Record<string, string>) {
  const fullConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  fullConfig.plugins ??= {};
  fullConfig.plugins.entries ??= {};
  fullConfig.plugins.entries['openclaw-openrecord'] ??= {};
  fullConfig.plugins.entries['openclaw-openrecord'].config = config;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(fullConfig, null, 2));
}

/** Update specific fields in the plugin config without overwriting others. */
export function updatePluginConfig(updates: Record<string, string | undefined>) {
  const current = readPluginConfig();
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      delete current[key];
    } else {
      current[key] = value;
    }
  }
  savePluginConfig(current);
}

// ── Passkey file (separate from OpenClaw config to avoid stale signCount) ───

/** Read the passkey credential JSON string from the dedicated file. */
export function readPasskey(): string | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(PASSKEY_PATH, 'utf-8'));
    return data?.passkey || undefined;
  } catch {
    // Fall back to OpenClaw config for migration
    const cfg = readPluginConfig();
    return cfg.passkey || undefined;
  }
}

/** Write the passkey credential JSON string to the dedicated file. */
export function savePasskey(serialized: string): void {
  fs.mkdirSync(path.dirname(PASSKEY_PATH), { recursive: true });
  fs.writeFileSync(PASSKEY_PATH, JSON.stringify({ passkey: serialized }, null, 2));
}

/** Delete the passkey credential file. */
export function clearPasskey(): void {
  try { fs.unlinkSync(PASSKEY_PATH); } catch { /* ignore */ }
}
