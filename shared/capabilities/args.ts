/** Coercion of the untyped arguments a client hands a capability. */

import type { CapabilityArgs } from './types';

/**
 * Read a string argument.
 *
 * Args arrive untyped — a model emits JSON, the CLI parses `--arg name=value` —
 * but the expected type is NOT a mystery: every param is declared in the
 * registry with a `type`, and these accessors are used for the ones declared
 * `'string'`. So this enforces that declaration rather than guessing what the
 * caller meant.
 *
 * A number or boolean converts, because that conversion is lossless and
 * unambiguous, and a model answering `12345` for a `csn` is ordinary. Anything
 * structural (object, array) is a caller error and throws by name: these values
 * become message bodies, refill comments and search terms that go to a
 * patient's provider, and there is no honest rendering of an object as one.
 * `String()` used to send the literal "[object Object]"; JSON-stringifying it
 * instead would just be a tidier way to send the wrong thing.
 */
export function argString(v: unknown, name: string): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  throw new Error(
    `Argument "${name}" must be a string; received ${Array.isArray(v) ? 'an array' : `a ${typeof v}`}.`,
  );
}

export function str(args: CapabilityArgs, name: string, fallback = ''): string {
  const v = args[name];
  if (v === undefined || v === null) return fallback;
  return argString(v, name);
}

export function requireStr(args: CapabilityArgs, name: string): string {
  const v = str(args, name).trim();
  if (!v) throw new Error(`Missing required argument "${name}".`);
  return v;
}

export function optStr(args: CapabilityArgs, name: string): string | undefined {
  const v = args[name];
  if (v === undefined || v === null || v === '') return undefined;
  return argString(v, name);
}

export function num(args: CapabilityArgs, name: string, fallback: number): number {
  const v = args[name];
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
