/**
 * `--action <capability-id>` — the CLI's generic capability dispatch.
 *
 * `cli.ts` runs `main()` the moment it is imported, so this lives in its own
 * module: the parity test drives these functions directly, and a test that had
 * to import a file which immediately tries to log into MyChart would not be
 * much of a test.
 *
 * The pretty-printed `scrapeAll` output in `cli.ts` stays the default because
 * it is what a human reading a terminal wants. This is the surface that
 * guarantees the CLI can do everything the Claude Desktop extension and the
 * mobile app can: every entry in `shared/capabilities.ts` is a command here,
 * with no per-flag plumbing to remember.
 */

import type { MyChartRequest } from '../../scrapers/myChart/myChartRequest';
import {
  capabilitiesByGroup,
  type Capability,
  type CapabilityContext,
} from '../../shared/capabilities';
import { loadTotpSecret, saveTotpSecret } from './totpStore';
import { savePasskeyCredential } from './passkeyStore';
import type { PasskeyCredential } from '../../scrapers/myChart/softwareAuthenticator';

/** Every capability, grouped, with its parameters — `--list-capabilities`. */
export function renderCapabilityList(): string {
  const lines: string[] = [
    '',
    '='.repeat(60),
    '  Capabilities',
    '='.repeat(60),
    '',
    '  Run one with:  mychart-cli --host <hostname> --action <id> [--arg name=value ...]',
  ];
  for (const { group, capabilities } of capabilitiesByGroup()) {
    lines.push('', `  -- ${group} --`);
    for (const capability of capabilities) {
      // Anything that isn't a plain read gets a marker, so a glance down the
      // list separates "shows me something" from "changes something".
      const marker = capability.kind === 'read' ? ' ' : '!';
      lines.push(`   ${marker} ${capability.id}`);
      lines.push(`       ${capability.description}`);
      for (const param of capability.params) {
        lines.push(
          `       --arg ${param.name}=<${param.type}>${param.required ? ' (required)' : ''}  ${param.description}`,
        );
      }
    }
  }
  lines.push(
    '',
    "  ! marks a command that changes something — a write to the chart, or the account's own sign-in settings.",
    '',
  );
  return lines.join('\n');
}

/**
 * Per-account context for the capabilities that touch credentials. The
 * password comes from whatever resolved this session; the TOTP secret and the
 * passkey come from the CLI's own on-disk stores.
 */
export async function capabilityContext(
  hostname: string,
  password: string | undefined,
): Promise<CapabilityContext> {
  return {
    password,
    totpSecret: (await loadTotpSecret(hostname)) ?? undefined,
    saveTotpSecret: (secret: string) => saveTotpSecret(hostname, secret),
    savePasskey: async (serialized: string) => {
      await savePasskeyCredential(hostname, JSON.parse(serialized) as PasskeyCredential);
    },
  };
}

/**
 * `--arg` values arrive as strings; numeric and boolean parameters are coerced
 * so a capability sees the type it declared.
 *
 * An unknown `--arg` is an error rather than a silent no-op — a typo'd
 * parameter name would otherwise look like the capability ignoring the
 * request, which is the worst way to find out you fetched the wrong note.
 */
export function coerceCapabilityArgs(
  capability: Capability,
  args: Record<string, string>,
): Record<string, unknown> {
  const known = new Map(capability.params.map((p) => [p.name, p]));
  const out: Record<string, unknown> = {};

  for (const [name, raw] of Object.entries(args)) {
    const param = known.get(name);
    if (!param) {
      const accepted = capability.params.map((p) => p.name).join(', ') || '(none)';
      throw new Error(`${capability.id} has no argument "${name}". It accepts: ${accepted}`);
    }
    if (param.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`--arg ${name} expects a number, got "${raw}".`);
      if (param.min !== undefined && n < param.min) throw new Error(`--arg ${name} must be at least ${param.min}.`);
      if (param.max !== undefined && n > param.max) throw new Error(`--arg ${name} must be at most ${param.max}.`);
      out[name] = n;
    } else if (param.type === 'boolean') {
      out[name] = raw !== 'false' && raw !== '0';
    } else {
      out[name] = raw;
    }
  }

  for (const param of capability.params) {
    if (param.required && out[param.name] === undefined) {
      throw new Error(`${capability.id} requires --arg ${param.name}=<${param.type}> (${param.description})`);
    }
  }
  return out;
}

/**
 * Raw image bytes would swamp a terminal; summarize them instead.
 *
 * JSON.stringify calls `toJSON()` *before* the replacer sees a value, so a
 * Node `Buffer` arrives here as `{type: 'Buffer', data: [...]}`, not as a
 * `Uint8Array` — both shapes must be caught or a single downloaded image
 * prints as tens of thousands of lines of byte values.
 */
export function jsonSafeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) return `<${value.length} bytes>`;
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'Buffer' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return `<${(value as { data: unknown[] }).data.length} bytes>`;
  }
  return value;
}

/** Run one capability against one session and print its JSON result. */
export async function runCapabilityAction(
  capability: Capability,
  session: { hostname: string; request: MyChartRequest },
  password: string | undefined,
  args: Record<string, string>,
): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}\n  ${capability.title}: ${session.hostname}\n${'='.repeat(60)}`);
  try {
    const ctx = await capabilityContext(session.hostname, password);
    const result = await capability.run(session.request, coerceCapabilityArgs(capability, args), ctx);
    console.log(JSON.stringify(result, jsonSafeReplacer, 2));
    return true;
  } catch (err) {
    console.log(`  ${(err as Error).message}`);
    return false;
  }
}
