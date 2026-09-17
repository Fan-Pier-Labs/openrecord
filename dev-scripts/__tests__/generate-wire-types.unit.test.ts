import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import { generate } from '../generate-wire-types';

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
});
