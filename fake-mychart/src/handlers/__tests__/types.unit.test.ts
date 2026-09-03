import { describe, expect, it } from 'bun:test';
import { mergeExact, pattern, prefix, resolve, type ExactRoutes, type Handler } from '../types';

/**
 * The dispatcher the MyChart catch-all route runs on. Every one of these
 * behaviours was implicit in the flat if-chain this replaced, where getting it
 * wrong produced a silently unreachable route rather than an error — so they
 * are asserted here rather than left to the integration suites to notice.
 */

// The tables only ever hold handlers, never call them here.
const stub = (name: string) => (() => name) as unknown as Handler;
const nameOf = (h: Handler | undefined) => (h as unknown as (() => string) | undefined)?.();

describe('mergeExact', () => {
  it('combines the per-domain tables', () => {
    const merged = mergeExact({ 'a/b': stub('one') }, { 'c/d': stub('two') });
    expect(Object.keys(merged).sort()).toEqual(['a/b', 'c/d']);
  });

  it('refuses two handlers for the same path', () => {
    // The failure mode this exists to catch: in an if-chain, the second branch
    // is simply never reached and looks exactly like a working route.
    expect(() => mergeExact({ 'api/x': stub('one') }, { 'api/x': stub('two') }))
      .toThrow('two handlers for "api/x"');
  });

  it('refuses a key that is not already lowercased', () => {
    // Paths are matched case-insensitively by lowercasing the request, so a
    // key with any uppercase in it can never match anything.
    expect(() => mergeExact({ 'api/LoadThing': stub('one') })).toThrow('must be lowercase');
  });
});

describe('resolve', () => {
  const exact: ExactRoutes = { 'billing/details': stub('page') };
  const patterns = [
    prefix('billing/details/getvisits', stub('visits')),
    prefix('billing/', stub('catchall')),
  ];

  it('prefers an exact route over a pattern that also matches it', () => {
    // `billing/details` is a page and `billing/details/*` are its data
    // endpoints; the page must not be swallowed by its children's prefix.
    expect(nameOf(resolve('billing/details', exact, patterns))).toBe('page');
  });

  it('falls through to the patterns when no exact route matches', () => {
    expect(nameOf(resolve('billing/details/getvisits', exact, patterns))).toBe('visits');
  });

  it('takes the first matching pattern, in declaration order', () => {
    expect(nameOf(resolve('billing/summary', exact, patterns))).toBe('catchall');
  });

  it('returns nothing for an unrouted path, so the caller can 404', () => {
    expect(resolve('nope', exact, patterns)).toBeUndefined();
  });
});

describe('route builders', () => {
  it('matches a prefix route on the prefix itself and everything below it', () => {
    const route = prefix('visits/visitslist/loadpast', stub('past'));
    expect(route.matches('visits/visitslist/loadpast')).toBe(true);
    expect(route.matches('visits/visitslist/loadpast/page2')).toBe(true);
    expect(route.matches('visits/visitslist/loadupcoming')).toBe(false);
  });

  it('describes itself for the route inventory', () => {
    expect(prefix('api/x', stub('x')).describe).toBe('api/x*');
    expect(pattern('*thing*', l => l.includes('thing'), stub('x')).describe).toBe('*thing*');
  });
});
