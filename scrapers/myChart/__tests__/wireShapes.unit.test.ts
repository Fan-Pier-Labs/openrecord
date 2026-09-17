/**
 * The `*.wire.ts` files are written by hand from the captures. That is the
 * simplest thing that works, and its one failure mode is going stale: a capture
 * refresh adds or drops a field and nothing says so, leaving a type that
 * describes an endpoint MyChart no longer has.
 *
 * So this walks every capture and checks the types still name each field, and
 * name nothing the captures do not have. Cross-cutting rather than per-scraper,
 * because the answer depends on all the wire files at once — a shape can move
 * to `wire/shared.ts` without that being drift.
 *
 * It compares field *names*, not paths. A field that appears at two sites and
 * is dropped from one still looks present, so this catches a capture gaining or
 * losing a field — the thing a refresh actually does — and not a field moving
 * between shapes. Path-level checking would mean re-deriving the nesting, which
 * is the codegen this deliberately does not have.
 */

import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

import * as captures from '../../../fake-mychart/src/data/realShapes';

const SCRAPERS = path.join(__dirname, '..', '..');

function wireFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__') wireFiles(full, found);
    } else if (entry.name.endsWith('.wire.ts') || full.endsWith(path.join('wire', 'shared.ts'))) {
      found.push(full);
    }
  }
  return found;
}

const SOURCES = wireFiles(SCRAPERS).map((f) => fs.readFileSync(f, 'utf8'));
const ALL = SOURCES.join('\n');

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

/** The text of one `export type X = …;` declaration, wherever it lives. */
function typeBody(alias: string): string {
  for (const src of SOURCES) {
    const start = src.indexOf(`export type ${alias} = `);
    if (start === -1) continue;
    const end = src.indexOf('\nexport type ', start + 1);
    return src.slice(start, end === -1 ? undefined : end);
  }
  return '';
}

const aliasOf = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** Every type name declared across the wire files. */
const DECLARED = new Set([...ALL.matchAll(/^export type (\w+) = /gm)].map((m) => m[1]!));

/**
 * The named shapes a type refers to rather than inlining. Matched by name
 * rather than by position: a reference can sit behind `Record<string, X>` or
 * `X[]` as easily as after a colon.
 */
const referenced = (body: string): string[] =>
  [...new Set([...body.matchAll(/\b([A-Z][\w]*)\b/g)].map((m) => m[1]!))].filter((n) => DECLARED.has(n));

/**
 * Fields that only exist on shapes the captures never saw populated. Their
 * members come from the original hand-written response types, so they are in
 * the wire files and not in the captures.
 */
const OBSERVED_ONLY = new Set([
  'IsTelemedicine', 'TelemedicineUrl', 'TelemedicineMode', 'IsEVisit', 'Amount', 'IsPaid',
  'CaseId', 'Description', 'Csn', 'VisitTypeName', 'PrimaryDate', 'Start', 'End',
  'EstimateAmount', 'EstimateStatus',
]);

/** A type's own fields plus those of every named shape it reaches. */
function reachableFields(alias: string, seen = new Set<string>()): string {
  if (seen.has(alias)) return '';
  seen.add(alias);
  const body = typeBody(alias);
  return body + referenced(body).map((r) => reachableFields(r, seen)).join('');
}

describe('wire shapes', () => {
  it('has a type for every captured endpoint', () => {
    const missing = Object.keys(captures).filter((n) => typeBody(aliasOf(n)) === '');
    expect(missing).toEqual([]);
  });

  it('names every field the captures carry', () => {
    const gaps: string[] = [];
    for (const [name, shape] of Object.entries(captures)) {
      const body = reachableFields(aliasOf(name));
      for (const field of fieldsOf(shape)) {
        // A key that is not a plain identifier is quoted in the type, and a name
        // can contain regex metacharacters (`epic.Core.Data…`). The left
        // boundary keeps `Id` from matching `OrganizationId`.
        const escaped = field.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
        if (!new RegExp(`(^|[^\\w$])"?${escaped}"?\\??:`).test(body)) gaps.push(`${aliasOf(name)}.${field}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it('names nothing the captures do not have', () => {
    const captured = new Set<string>();
    for (const shape of Object.values(captures)) fieldsOf(shape, captured);
    const extra = [...ALL.matchAll(/^\s*"?([A-Za-z_$][\w$.-]*)"?\??:/gm)]
      .map((m) => m[1]!)
      .filter((f) => !captured.has(f) && !OBSERVED_ONLY.has(f));
    expect([...new Set(extra)]).toEqual([]);
  });

  it('keeps each scraper\'s shapes in its own folder', () => {
    // The point of splitting these up: a scraper's raw shapes sit beside the
    // scraper and its processor, not in one pile.
    expect(fs.existsSync(path.join(SCRAPERS, 'myChart/chart/visits/visits.wire.ts'))).toBe(true);
    expect(fs.existsSync(path.join(SCRAPERS, 'myChart/chart/labs/labs.wire.ts'))).toBe(true);
    expect(fs.existsSync(path.join(SCRAPERS, 'myChart/wire/shapes.ts'))).toBe(false);
  });

  it('marks a container the captures never saw populated', () => {
    expect(typeBody('VisitsLoadUpcoming')).toContain(
      '/** Never captured populated; shape from the original hand-written types. */',
    );
  });
});
