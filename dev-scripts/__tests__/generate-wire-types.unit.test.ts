import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import { generate } from '../generate-wire-types';
import { OBSERVED } from '../../scrapers/myChart/wire/observed';

const OUT = path.join(__dirname, '..', '..', 'scrapers', 'myChart', 'wire', 'shapes.generated.ts');

describe('wire type generation', () => {
  it('matches the checked-in file', () => {
    // The generated types are only trustworthy if they still describe the
    // current captures. Regenerate with `bun run wire-types`.
    expect(fs.readFileSync(OUT, 'utf8')).toBe(generate());
  });

  it('types an observed leaf by what was observed', () => {
    const out = generate();
    // `loadAllergies` is the smallest skeleton: two booleans, a string, a number.
    expect(out).toContain('dateOfBirth: string;');
    expect(out).toContain('allergiesStatus: number;');
    expect(out).toContain('hasUpdateSecurity: boolean;');
  });

  it('gives an always-null leaf `unknown`, not `null`', () => {
    // A field that was null on every captured instance tells us nothing about
    // its type, so the type has to say so — `null` would be a claim we cannot
    // support, and it would make `x.Foo` look safe to hand straight to a caller.
    expect(generate()).toContain('UnverifiedProxyJumpUrl: unknown;');
  });

  it('gives an always-empty array `unknown[]`, not `never[]`', () => {
    // We have never seen an element, so we have no element shape. `never[]`
    // would make reading one a compile error rather than an open question.
    expect(generate()).toContain('Ids: unknown[];');
  });

  it('collapses an id-keyed map to a Record', () => {
    // The capture harness writes a dynamic map as the single key "*".
    expect(generate()).toMatch(/Record<string, \{/);
  });

  it('carries the endpoint each shape came from', () => {
    expect(generate()).toContain('/** `/proxyswitch` */');
  });

  it('splices in a hand-observed fragment where the capture saw only null', () => {
    // The visit row's `Telemedicine` was null on all three captured instances,
    // so the capture alone types it `unknown`; `wire/observed.ts` supplies the
    // shape `visits.processor.ts` actually reads out of it.
    const out = generate();
    expect(out).not.toContain('Telemedicine: unknown;');
    expect(out).toContain('IsTelemedicine: boolean;');
  });

  it('replaces a fragment at every site the key appears', () => {
    // A visit row is repeated across the upcoming buckets and the past list, so
    // an entry that only patched the first one would leave the rest `unknown`.
    const out = generate();
    expect(out.match(/IsTelemedicine: boolean;/g)!.length).toBeGreaterThan(1);
  });

  it('refuses a fragment the captures no longer carry', () => {
    // A key that matches nothing is a stale belief, and staying silent about it
    // is how a shape quietly stops describing the endpoint.
    OBSERVED.VisitsLoadUpcoming = { ...OBSERVED.VisitsLoadUpcoming, NoSuchField: {} };
    try {
      expect(() => generate()).toThrow(/NoSuchField/);
    } finally {
      delete OBSERVED.VisitsLoadUpcoming.NoSuchField;
    }
  });
});
