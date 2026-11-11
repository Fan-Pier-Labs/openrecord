// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Name → exactly one item, or refuse.
 *
 * The rule that matters is exact-before-partial. A substring-only matcher
 * rejects a perfectly correct name whenever another entry contains it —
 * "Dr. Smith" is ambiguous with "Dr. Smithson" — which tells the caller to be
 * more specific about a name that could not have been. That was a real bug in
 * the two bespoke resolvers this module replaced.
 */

import { describe, it, expect } from 'bun:test';

import { resolveUnique, type ResolveUniqueOptions } from '../resolveUnique';
import type { DetailedError } from '../detailedError';

type Named = { displayName: string; commonName?: string };
const named = (...names: string[]): Named[] => names.map((displayName) => ({ displayName }));
const opts = { getName: (n: Named) => n.displayName, label: 'recipient' as const };

describe('exact match wins over partial', () => {
  it('resolves a name that is a prefix of another name — the regression', () => {
    const items = named('Dr. Smith', 'Dr. Smithson');
    expect(resolveUnique(items, 'Dr. Smith', opts).displayName).toBe('Dr. Smith');
    // And the longer one is still reachable.
    expect(resolveUnique(items, 'Dr. Smithson', opts).displayName).toBe('Dr. Smithson');
  });

  it('resolves an exact name that is a substring of several others', () => {
    const items = named('Cardiology', 'Cardiology — Referrals', 'Cardiology — Billing');
    expect(resolveUnique(items, 'Cardiology', opts).displayName).toBe('Cardiology');
  });

  it('ignores case and surrounding whitespace when matching exactly', () => {
    const items = named('Dr. Smith', 'Dr. Smithson');
    expect(resolveUnique(items, '  dr.   smith  ', opts).displayName).toBe('Dr. Smith');
  });

  it('still refuses when two items genuinely share one name', () => {
    const items = named('Dr. Smith', 'Dr. Smith');
    expect(() => resolveUnique(items, 'Dr. Smith', opts)).toThrow(/2 recipients have that name/);
  });
});

describe('partial match', () => {
  it('matches on a surname alone', () => {
    expect(resolveUnique(named('Dr. Julius Hibbert', 'Billing'), 'hibbert', opts).displayName).toBe(
      'Dr. Julius Hibbert',
    );
  });

  it('matches tokens in any order', () => {
    expect(resolveUnique(named('Julius Hibbert, MD'), 'hibbert julius', opts).displayName).toBe(
      'Julius Hibbert, MD',
    );
  });

  it('ignores honorifics', () => {
    const items = named('Dr. Julius Hibbert', 'Nick Riviera, MD');
    expect(resolveUnique(items, 'Dr. Hibbert', opts).displayName).toBe('Dr. Julius Hibbert');
  });

  it('treats a bare honorific as a filter, not as an empty query', () => {
    const items = named('Dr. Hibbert', 'Dr. Riviera', 'Billing');
    expect(() => resolveUnique(items, 'Dr.', opts)).toThrow(/2 recipients match that name/);
  });
});

// A refusal's message goes to error reporting, so it names neither the query nor
// any item — those are the patient's providers and medications. Its detailed
// message, which Claude sees, names the alternatives.
function refusal(items: Named[], query: string, options: ResolveUniqueOptions<Named> = opts): DetailedError {
  try {
    resolveUnique(items, query, options);
  } catch (err) {
    return err as DetailedError;
  }
  throw new Error('expected a refusal');
}

describe('refusals name the alternatives in the detailed message only', () => {
  it('lists what is available when nothing matches', () => {
    const err = refusal(named('Billing', 'Pharmacy'), 'zzz');
    expect(err.message).toBe('No recipient matches that name.');
    expect(err.detailedMessage).toBe('No recipient matching "zzz". Available: Billing, Pharmacy');
  });

  it('lists only the ambiguous candidates when several match', () => {
    const err = refusal(named('Dr. Ann Lee', 'Dr. Bob Lee', 'Billing'), 'lee');
    expect(err.message).toBe('2 recipients match that name. Be more specific.');
    expect(err.detailedMessage).toContain('Dr. Ann Lee');
    expect(err.detailedMessage).toContain('Dr. Bob Lee');
    expect(err.detailedMessage).not.toContain('Billing');
  });

  it('says no name was given only when there really is none', () => {
    expect(() => resolveUnique(named('Billing'), '   ', opts)).toThrow(/No recipient name given/);
  });

  it('uses the caller’s noun in every message', () => {
    const medOpts = { getName: (n: Named) => n.displayName, label: 'medication' };
    expect(() => resolveUnique(named('Aspirin'), 'zzz', medOpts)).toThrow(/No medication matches that name/);
  });
});

describe('alternate names', () => {
  const meds: Named[] = [
    { displayName: 'Atorvastatin 20mg', commonName: 'Lipitor' },
    { displayName: 'Lisinopril 10mg', commonName: 'Zestril' },
  ];
  const medOpts = {
    getName: (m: Named) => m.displayName,
    getAlternateNames: (m: Named) => (m.commonName ? [m.commonName] : []),
    label: 'medication',
    stripTitles: false,
  };

  it('matches a brand name the display name never mentions', () => {
    expect(resolveUnique(meds, 'Lipitor', medOpts).displayName).toBe('Atorvastatin 20mg');
  });

  it('matches the generic name too', () => {
    expect(resolveUnique(meds, 'atorvastatin', medOpts).displayName).toBe('Atorvastatin 20mg');
  });

  it('does not list alternate names in errors — one item must read as one item', () => {
    const err = refusal(meds, 'zzz', medOpts);
    expect(err.message).not.toContain('Atorvastatin');
    expect(err.detailedMessage).toContain('Atorvastatin 20mg');
    expect(err.detailedMessage).not.toContain('Lipitor');
  });
});

describe('stripTitles: false', () => {
  it('keeps words that would be honorifics in a person’s name', () => {
    // "DO" is an honorific for a person and a real word for a medication.
    const items: Named[] = [{ displayName: 'DO NOT SUBSTITUTE — Warfarin' }, { displayName: 'Aspirin' }];
    const o = { getName: (n: Named) => n.displayName, label: 'medication', stripTitles: false };
    expect(resolveUnique(items, 'do not substitute', o).displayName).toBe('DO NOT SUBSTITUTE — Warfarin');
  });
});
