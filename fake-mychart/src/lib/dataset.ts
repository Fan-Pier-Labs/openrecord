// Per-patient data scoping.
//
// Real MyChart scopes every endpoint to the record the session is currently in.
// The fake models that by resolving a *dataset* per request rather than reading
// Homer's module directly: the account holder gets Homer's data, and each proxy
// record gets its own.
//
// The important property is what happens to a category a child's record does
// NOT model. It must come back structurally empty — same envelope, empty
// lists — and must never fall through to the account holder's data. A parent's
// medication list rendered inside a child's chart is the worst bug this
// codebase could ship, so the fallback direction is "empty", never "inherit".

import * as homer from '@/data/homer';

/** Every data export the route handlers read. */
export type PatientDataset = typeof homer;

/** The subset a proxy record overrides; everything else is emptied. */
export type PatientDatasetOverrides = Partial<PatientDataset>;

/**
 * Structural empty: same keys, same nesting, no content. Arrays become empty,
 * strings become empty, numbers zero, booleans false. Scrapers then parse a
 * valid-but-empty response instead of crashing on a missing envelope — which is
 * exactly what a real record with no data in that category returns.
 */
function emptyLike<T>(value: T): T {
  if (Array.isArray(value)) return [] as unknown as T;
  if (value === null) return null as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = emptyLike(v);
    }
    return out as T;
  }
  if (typeof value === 'string') return '' as unknown as T;
  if (typeof value === 'number') return 0 as unknown as T;
  if (typeof value === 'boolean') return false as unknown as T;
  return value;
}

/**
 * Lookup maps keyed by an identifier (CSN, letter id, …). Emptying these
 * key-by-key would leave a child's chart advertising the account holder's visit
 * identifiers with blank contents, so they collapse to `{}` instead.
 */
const LOOKUP_MAP_KEYS = ['visitNotesByCsn', 'noteContent', 'avsByCsn', 'letterDetails'] as const;

let emptyBaseCache: PatientDataset | null = null;

function emptyBase(): PatientDataset {
  if (emptyBaseCache) return emptyBaseCache;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(homer)) {
    out[key] = (LOOKUP_MAP_KEYS as readonly string[]).includes(key) ? {} : emptyLike(value);
  }
  emptyBaseCache = out as PatientDataset;
  return emptyBaseCache;
}

/** Build a proxy record's dataset: explicit data where modelled, empty elsewhere. */
export function buildDataset(overrides: PatientDatasetOverrides): PatientDataset {
  return { ...emptyBase(), ...overrides };
}

/** The account holder's dataset — Homer's module, unmodified. */
export function selfDataset(): PatientDataset {
  return homer;
}

/** Reset memoized state. Only needed so /reset is a true clean slate. */
export function resetDatasetCache(): void {
  emptyBaseCache = null;
}
