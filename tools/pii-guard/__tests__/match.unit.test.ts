/**
 * The matcher on its own terms.
 *
 * The interesting assertions are the masked ones. Every value in this file is
 * fictional — 555-01xx numbers, example.com addresses, invented names — but
 * they are shaped exactly like the real thing, which is why this directory is
 * on the guard's own skip list (see `config.ts`). Without that, the guard would
 * block the commit that adds its own tests.
 */

import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_THRESHOLDS,
  expandDate,
  findFragment,
  grams,
  hasMask,
  maskedMatch,
  normalize,
  redact,
  splitMask,
} from '../match';

describe('hasMask', () => {
  it('recognises the conventional redaction characters', () => {
    for (const text of ['r***@x.com', 'r•••@x.com', '###-1234', '617-???-0134', 'xxxx-0134', '█████']) {
      expect(hasMask(text)).toBe(true);
    }
  });

  it('does not treat a single x as a mask', () => {
    // Otherwise every hex literal and every `max`/`box` identifier is a
    // candidate, and the whole tier turns to noise.
    expect(hasMask('0x1f')).toBe(false);
    expect(hasMask('max@example.com')).toBe(false);
    expect(hasMask('xx-redacted')).toBe(true);
  });

  it('is not confused by a previous call leaving regex state behind', () => {
    // The mask pattern is a module-level /g regex; a stale lastIndex would make
    // every other call answer wrongly.
    expect(hasMask('***')).toBe(true);
    expect(hasMask('***')).toBe(true);
  });
});

describe('splitMask', () => {
  it('separates surviving characters from the gaps between them', () => {
    expect(splitMask('r***@ex*.com')).toEqual({ segments: ['r', '@ex', '.com'], gaps: [3, 1] });
  });

  it('reports an empty leading segment when the value starts masked', () => {
    expect(splitMask('***-0134').segments[0]).toBe('');
  });
});

describe('maskedMatch', () => {
  const email = 'ryanexample@example.com';

  it('matches a masked local part against the real address', () => {
    expect(maskedMatch('r**********@example.com', email, 4)).toBeGreaterThan(0);
  });

  it('matches when the mask does not preserve length', () => {
    // Three stars standing in for eleven characters is the common case in a
    // hand-written redaction.
    expect(maskedMatch('r***@example.com', email, 4)).toBeGreaterThan(0);
  });

  it('matches a masked domain', () => {
    expect(maskedMatch('ryanexample@***.com', email, 4)).toBeGreaterThan(0);
  });

  it('matches a masked fragment of a phone number', () => {
    expect(maskedMatch('617***0134', '6175550134', 3)).toBe(7);
    // Separators are normalised away before matching, which is what lets one
    // needle cover `(617) ***-0134` and `617.***.0134` alike.
    expect(maskedMatch(normalize('***-**-0134', 'phone'), '6175550134', 3)).toBe(4);
  });

  it('declines a masked value that is not this one', () => {
    expect(maskedMatch('a***@other.com', email, 4)).toBeNull();
    expect(maskedMatch('212***9999', '6175550134', 3)).toBeNull();
  });

  it('declines when too little survived to identify anyone', () => {
    expect(maskedMatch('r***@***.***', email, 4)).toBeNull();
  });

  it('declines an unmasked candidate, which is the fragment matcher\'s job', () => {
    expect(maskedMatch(email, email, 4)).toBeNull();
  });

  it('does not let a mask run swallow an unbounded amount', () => {
    // `a*z` must not match a needle where a and z are hundreds of characters
    // apart; the bound scales with the run, not with the haystack.
    const needle = `a${'q'.repeat(400)}z`;
    expect(maskedMatch('a*z', needle, 2)).toBeNull();
  });
});

describe('normalize', () => {
  it('collapses every rendering of one phone number to the same digits', () => {
    const forms = ['(617) 555-0134', '617.555.0134', '617-555-0134', '+1 617 555 0134'];
    const normalized = forms.map((form) => normalize(form, 'phone'));
    expect(new Set(normalized.map((digits) => digits.slice(-10)))).toEqual(new Set(['6175550134']));
  });

  it('keeps masks, which are the whole point of the second matcher', () => {
    expect(normalize('(617) ***-0134', 'phone')).toBe('617***0134');
  });

  it('strips punctuation and case from prose kinds', () => {
    expect(normalize('12 Example Street, Boston', 'address')).toBe('12examplestreetboston');
    expect(normalize('Firstname  Lastname', 'name')).toBe('firstnamelastname');
  });

  it('preserves case for secrets, where it is load-bearing', () => {
    expect(normalize('AbC-123_xyz', 'secret')).toBe('AbC-123_xyz');
  });
});

describe('grams and findFragment', () => {
  it('finds a run of the value that survived verbatim', () => {
    const needleGrams = grams('6175550134', DEFAULT_THRESHOLDS.phone.minRun);
    expect(findFragment('call 5550134 back', needleGrams)).not.toBeNull();
  });

  it('ignores a run shorter than the threshold', () => {
    expect(findFragment('ends in 134', grams('6175550134', 4))).toBeNull();
  });

  it('treats a value shorter than the window as needing to appear whole', () => {
    expect(grams('abc', 8)).toEqual(['abc']);
    expect(grams('', 4)).toEqual([]);
  });
});

describe('expandDate', () => {
  it('produces every rendering a date of birth gets written in', () => {
    const renderings = expandDate('1980-01-02');
    expect(renderings).toContain('1980-01-02');
    expect(renderings).toContain('01/02/1980');
    expect(renderings).toContain('1/2/1980');
    expect(renderings).toContain('19800102');
    expect(renderings).toContain('january 2, 1980');
  });

  it('passes a non-ISO value through untouched', () => {
    expect(expandDate('sometime in 1980')).toEqual(['sometime in 1980']);
  });
});

describe('redact', () => {
  it('keeps a shape and discards the value', () => {
    expect(redact('ryanexample@example.com')).toBe('r… (23 chars)');
    expect(redact('')).toBe('0 chars');
  });
});
