// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Anonymous usage telemetry, modelled after Next.js / Vercel CLI:
 *
 * - One stable random UUID per project install, stored in the consumer's
 *   `node_modules/.cache/mychart-cli/anonymous-id` (the same
 *   convention Babel / ESLint / Webpack use for tooling cache). Never
 *   derived from identifying information.
 * - Event payload is event name + properties + OS platform/arch +
 *   runtime version. No OS hostname, no git config.
 * - An event sent with a `user` (the MCPB's per-tool-call event) is NOT
 *   anonymous: it carries the user's email and MyChart username, and asks
 *   Amplitude to record the request's IP address.
 * - Opt out by setting `MYCHART_CLI_TELEMETRY_DISABLED` to any
 *   truthy value.
 *
 * Every event fans out to two independent sinks:
 *   1. Amplitude (product analytics UI)
 *   2. our own analytics Lambda, which writes to CloudWatch Logs
 *      (repo: Fan-Pier-Labs/openrecord-analytics)
 * Both are best-effort; a failure in one never affects the other.
 *
 * Fire-and-forget. Never throws, never blocks the caller.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const AMPLITUDE_API_KEY = 'a7d8557f623f24012e62edc61bbc0fd6';
const AMPLITUDE_HTTP_API = 'https://api2.amplitude.com/2/httpapi';

/**
 * Self-hosted analytics sink (API Gateway → Lambda → CloudWatch Logs).
 * Redirect it with `OPENRECORD_ANALYTICS_ENDPOINT`, or turn this sink
 * off on its own with `OPENRECORD_ANALYTICS_DISABLED`.
 * `MYCHART_CLI_TELEMETRY_DISABLED` still disables everything at once.
 *
 * Read at call time rather than module load so tests (and consumers
 * that set env vars during startup) see the current value.
 */
const DEFAULT_ANALYTICS_ENDPOINT = 'https://pumlxw0t7e.execute-api.us-east-2.amazonaws.com';

function analyticsEndpoint(): string {
  if (process.env.OPENRECORD_ANALYTICS_DISABLED) return '';
  return process.env.OPENRECORD_ANALYTICS_ENDPOINT || DEFAULT_ANALYTICS_ENDPOINT;
}

/** How long we'll wait on a telemetry request before giving up. */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * The opt-out for telemetry events. The version check ignores it — it sends
 * nothing but the request itself. Exported so the MCPB can skip the MyChart
 * email lookup behind its tool-call event, not just the send.
 */
export function isTelemetryDisabled(): boolean {
  return Boolean(process.env.MYCHART_CLI_TELEMETRY_DISABLED);
}

/**
 * Locate the nearest `node_modules` directory by walking up from
 * `process.cwd()`. Returns the cache subdirectory we'd use, or `null`
 * if no `node_modules` is reachable (in which case we won't persist
 * the anonymous ID at all).
 */
function findNodeModulesCacheDir(): string | null {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const nm = path.join(dir, 'node_modules');
    if (fs.existsSync(nm)) {
      return path.join(nm, '.cache', 'mychart-cli');
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Read or create a stable random UUID stored on disk. The ID is not
 * derived from any identifying information; it exists purely to dedupe
 * events from the same project install.
 */
function getAnonymousId(): string {
  const cacheDir = findNodeModulesCacheDir();
  if (!cacheDir) {
    // No node_modules nearby (running from outside any project).
    // Fall back to a per-process UUID — telemetry still works, just
    // won't dedupe across runs.
    return randomUUID();
  }
  const idFile = path.join(cacheDir, 'anonymous-id');
  try {
    if (fs.existsSync(idFile)) {
      const cached = fs.readFileSync(idFile, 'utf8').trim();
      if (cached) return cached;
    }
    fs.mkdirSync(cacheDir, { recursive: true });
    const fresh = randomUUID();
    fs.writeFileSync(idFile, fresh, { encoding: 'utf8', mode: 0o600 });
    return fresh;
  } catch {
    // Read-only FS / permission denied — fall back to per-process UUID.
    return randomUUID();
  }
}

export interface EnvInfo {
  platform: string;
  arch: string;
  runtime_version: string;
  os_version: string;
}

/** Gather non-identifying environment info. */
export function gatherEnvInfo(): EnvInfo {
  return {
    platform: os.platform(),
    arch: os.arch(),
    // Read off globalThis so this file typechecks under tsconfigs without bun
    // types (the expo app imports it directly).
    runtime_version: (() => {
      const bun = (globalThis as { Bun?: { version: string } }).Bun;
      return bun ? `bun ${bun.version}` : `node ${process.version}`;
    })(),
    os_version: os.release(),
  };
}

/** POST a JSON body, aborting after REQUEST_TIMEOUT_MS. Never throws. */
async function postJson(url: string, body: unknown): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Silently ignore — telemetry must never break the app.
  }
}

export interface ErrorReport {
  name: string;
  message: string;
  /** The full stack, then each `cause`'s stack in turn. */
  stack: string;
}

/** Anything thrown, as name + message + stack. A non-Error throw has no stack to give. */
export function describeError(error: unknown): ErrorReport {
  if (!(error instanceof Error)) {
    const text = typeof error === 'string' ? error : JSON.stringify(error) ?? String(error);
    return { name: 'NonError', message: text, stack: text };
  }
  const stacks: string[] = [];
  // Bounded, since a cause chain can loop.
  for (let e: unknown = error; e !== undefined && stacks.length < 10; e = (e as Error).cause) {
    stacks.push(e instanceof Error ? (e.stack ?? `${e.name}: ${e.message}`) : describeError(e).stack);
  }
  // The home folder is usually named after the macOS user.
  const stack = stacks.join('\nCaused by: ').replaceAll(os.homedir(), '~');
  return { name: error.name, message: error.message, stack };
}

/**
 * Send a telemetry event to both sinks (Amplitude and our analytics
 * Lambda). Fire-and-forget. Never throws. Returns immediately when
 * telemetry is disabled via `MYCHART_CLI_TELEMETRY_DISABLED`.
 *
 * `source` identifies the client emitting the event ('cli', 'scraper',
 * 'openclaw', …) and is only used by the self-hosted sink; Amplitude
 * distinguishes clients by event name. `error` rides along as name, message
 * and full stack: as event properties on Amplitude, which truncates long
 * values, and whole as a top-level `error` for the Lambda.
 */
export function sendTelemetryEvent(
  eventType: string,
  eventProperties: Record<string, unknown> = {},
  source = 'node',
  user?: { email?: string | undefined; username?: string | undefined },
  error?: unknown,
): void {
  if (isTelemetryDisabled()) return;

  void (async () => {
    try {
      const envInfo = gatherEnvInfo();
      const deviceId = getAnonymousId();
      const properties = {
        ...eventProperties,
        arch: envInfo.arch,
        runtime_version: envInfo.runtime_version,
      };
      const failure = error === undefined ? undefined : describeError(error);

      const email = user?.email;
      const username = user?.username;
      const amplitude = postJson(AMPLITUDE_HTTP_API, {
        api_key: AMPLITUDE_API_KEY,
        events: [
          {
            device_id: deviceId,
            event_type: eventType,
            time: Date.now(),
            platform: envInfo.platform,
            os_name: envInfo.platform,
            os_version: envInfo.os_version,
            event_properties: failure
              ? { ...properties, error_name: failure.name, error_message: failure.message, error_stack: failure.stack }
              : properties,
            // '$remote' tells Amplitude to record the IP the upload came from.
            ...(user ? { ip: '$remote' } : {}),
            ...(email ? { user_id: email } : {}),
            ...(email || username
              ? { user_properties: { ...(email ? { email } : {}), ...(username ? { username } : {}) } }
              : {}),
          },
        ],
      });

      const endpoint = analyticsEndpoint();
      const selfHosted = endpoint
        ? postJson(endpoint, {
            source,
            deviceId,
            // The key's presence tells the Lambda to log this event's email and
            // the request's IP, which it reads off the request itself.
            ...(user ? { email: email ?? null, username: username ?? null } : {}),
            ...(failure ? { error: failure } : {}),
            event: eventType,
            ts: Date.now(),
            properties: {
              ...properties,
              platform: envInfo.platform,
              os_version: envInfo.os_version,
            },
          })
        : Promise.resolve();

      // Independent sinks: one failing must not cancel the other.
      await Promise.allSettled([amplitude, selfHosted]);
    } catch {
      // Silently ignore — telemetry must never break the app.
    }
  })();
}
