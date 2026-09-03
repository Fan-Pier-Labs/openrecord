import type { NextRequest, NextResponse } from 'next/server';
import type { PatientDataset } from '@/lib/dataset';

/**
 * Everything a route handler is given.
 *
 * `path` keeps MyChart's own casing (it goes into `aspxerrorpath` and the
 * unhandled-POST log verbatim); `lower` is what routes are matched on, because
 * ASP.NET routing is case-insensitive and so is this fake.
 */
export type HandlerContext = {
  request: NextRequest;
  /** Path below the mount prefix, segments joined with `/`, original casing. */
  path: string;
  /** `path` lowercased — the key every route table is written against. */
  lower: string;
  /** Chart data for the record this session is currently pointed at. */
  ds: PatientDataset;
};

export type Handler = (ctx: HandlerContext) => NextResponse | Promise<NextResponse>;

/** Routes matched on the whole path, keyed by the lowercased path. */
export type ExactRoutes = Record<string, Handler>;

/**
 * A route matched on something other than the whole path — a path prefix, or
 * (once) a substring. Checked in declaration order, and only after every exact
 * route has missed, which is what keeps `billing/details` from being swallowed
 * by the `billing/details/getvisits` prefix beside it.
 */
export type PatternRoute = {
  /** What this route matches, for the route inventory. Not used for matching. */
  describe: string;
  matches: (lower: string) => boolean;
  handler: Handler;
};

/** A route that answers every path below `p`, including `p` itself. */
export function prefix(p: string, handler: Handler): PatternRoute {
  return { describe: `${p}*`, matches: lower => lower.startsWith(p), handler };
}

/**
 * A route matched by an arbitrary predicate, for the one path a prefix can't
 * describe. `describe` is the inventory's only view of it, so say what it matches.
 */
export function pattern(describe: string, matches: (lower: string) => boolean, handler: Handler): PatternRoute {
  return { describe, matches, handler };
}

/**
 * Combine the per-domain exact tables into one lookup, refusing to start if two
 * domains claim the same path.
 *
 * The flat if-chain this replaced could not detect that: a second `if (lower
 * === 'api/goals/loadpatientgoals')` was simply unreachable, and looked exactly
 * like a working route. Throwing at module load turns that into an immediate,
 * loud failure of the dev server and of every integration suite.
 */
export function mergeExact(...tables: ExactRoutes[]): ExactRoutes {
  const merged: ExactRoutes = {};
  for (const table of tables) {
    for (const [path, handler] of Object.entries(table)) {
      if (path !== path.toLowerCase()) {
        throw new Error(`fake-mychart route key must be lowercase, got "${path}"`);
      }
      if (merged[path]) {
        throw new Error(`fake-mychart has two handlers for "${path}"`);
      }
      merged[path] = handler;
    }
  }
  return merged;
}

/** The first handler claiming this path: exact match first, then patterns in order. */
export function resolve(
  lower: string,
  exact: ExactRoutes,
  patterns: readonly PatternRoute[],
): Handler | undefined {
  return exact[lower] ?? patterns.find(r => r.matches(lower))?.handler;
}
