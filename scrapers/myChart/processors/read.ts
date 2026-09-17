/**
 * Readers for untyped payloads.
 *
 * Processors run against whatever an Epic release actually sent, not against
 * what a type says it sent, so a field an instance omits has to come out as an
 * empty value rather than a crash mid-scrape. These never throw.
 */

/**
 * A captured shape (`../wire/shapes.generated.ts`) as it has to be *read*.
 *
 * Every leaf becomes optional, because the generated types record what three
 * instances answered and the next instance is free to omit any of it. That is
 * the whole difference between this and `as SomeShape`: the field *names* are
 * checked, so a typo or a field no instance ever sent is a compile error, while
 * the *values* stay as untrusted as they were — you still have to go through
 * `text()` / `num()` / `list()` to get one out.
 */
export type Wire<T> =
  T extends readonly (infer E)[] ? Wire<E>[]
  : T extends object ? { [K in keyof T]?: Wire<T[K]> | undefined }
  : T | undefined;

/** A payload with no captured shape: a bare record, exactly as before. */
export function rec(value: unknown): Record<string, unknown>;
/** A payload we have a captured shape for: `rec<LoadAllergies>(body)`. */
export function rec<T>(value: unknown): Wire<T>;
export function rec(value: unknown): unknown {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A string, or null when MyChart sent nothing. Distinguishes "" from absent. */
export function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function bool(value: unknown): boolean {
  return value === true;
}

/** A boolean, or null when MyChart sent nothing. */
export function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** A finite number, or null. */
export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A list of strings, dropping anything that is not one. */
export function strings(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === 'string');
}

/** Epic's `/Date(1761851400000)/` as epoch millis, or null. */
export function epicInstantMs(value: unknown): number | null {
  const match = /\/Date\((-?\d+)\)\//.exec(text(value));
  return match ? Number(match[1]) : null;
}

/** Epoch millis as ISO-8601 UTC, or null. */
export function isoFromMs(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}
