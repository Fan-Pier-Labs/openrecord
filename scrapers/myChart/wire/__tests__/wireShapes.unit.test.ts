/**
 * `../shapes.ts` is written by hand from the captures. That is the simplest
 * thing that works, and its one failure mode is going stale: a capture refresh
 * adds or drops a field and nothing says so, leaving a type that describes an
 * endpoint MyChart no longer has.
 *
 * So this walks the captures and checks the types still name every field, and
 * name nothing the captures do not have.
 */

import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import * as captures from '../../../../fake-mychart/src/data/realShapes';

const SHAPES = fs.readFileSync(path.join(__dirname, '..', 'shapes.ts'), 'utf8');

/** Every field name in a captured skeleton, at any depth. `*` is the harness's id-map marker. */
function fieldsOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) fieldsOf(v, into);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k !== '*') into.add(k);
      fieldsOf(v, into);
    }
  }
  return into;
}

/** The body of one `export type X = …;` block. */
function typeBody(alias: string): string {
  const start = SHAPES.indexOf(`export type ${alias} = `);
  if (start === -1) return '';
  const end = SHAPES.indexOf('\nexport type ', start + 1);
  return SHAPES.slice(start, end === -1 ? undefined : end);
}

const aliasOf = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

// Shapes the captures never saw populated. Their members come from the original
// hand-written response types, so they are in shapes.ts and not in the captures.
const OBSERVED_ONLY = new Set([
  'IsTelemedicine', 'TelemedicineUrl', 'TelemedicineMode', 'IsEVisit', 'Amount', 'IsPaid',
  'CaseId', 'Description', 'Csn', 'VisitTypeName', 'PrimaryDate', 'Start', 'End',
  'EstimateAmount', 'EstimateStatus',
]);

describe('wire shapes', () => {
  it('has a type for every captured endpoint', () => {
    const missing = Object.keys(captures).filter((n) => typeBody(aliasOf(n)) === '');
    expect(missing).toEqual([]);
  });

  it('names every field the captures carry', () => {
    const gaps: string[] = [];
    for (const [name, shape] of Object.entries(captures)) {
      const body = typeBody(aliasOf(name));
      for (const field of fieldsOf(shape)) {
        // A key that is not a plain identifier is quoted in the type, and a
        // name can contain regex metacharacters (`epic.Core.Data…`). The left
        // boundary keeps `Id` from matching `OrganizationId`.
        const escaped = field.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
        const named = new RegExp(`(^|[^\\w$])"?${escaped}"?\\??:`);
        if (!named.test(body)) gaps.push(`${aliasOf(name)}.${field}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('names nothing the captures do not have', () => {
    const extra: string[] = [];
    for (const [name, shape] of Object.entries(captures)) {
      const captured = fieldsOf(shape);
      const body = typeBody(aliasOf(name));
      for (const m of body.matchAll(/^\s*"?([A-Za-z_$][\w$.-]*)"?\??:/gm)) {
        const field = m[1]!;
        if (!captured.has(field) && !OBSERVED_ONLY.has(field)) extra.push(`${aliasOf(name)}.${field}`);
      }
    }
    expect(extra).toEqual([]);
  });

  it('marks a container the captures never saw populated', () => {
    // Without the note these read as ordinary captured shapes, which is exactly
    // the confusion that matters here — they are one developer's reading.
    expect(typeBody('VisitsLoadUpcoming')).toContain(
      '/** Never captured populated; shape from the original hand-written types. */',
    );
  });
});
