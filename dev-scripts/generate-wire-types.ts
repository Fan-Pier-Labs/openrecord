/**
 * Generate `scrapers/myChart/wire/shapes.generated.ts` from the captured
 * response skeletons in `fake-mychart/src/data/realShapes.ts`.
 *
 * The skeletons are the only grounded record of what MyChart actually answers:
 * structure observed on real instances, every leaf normalised to a neutral
 * default. That normalisation is what makes them a type source — a leaf
 * recorded as `''` was a string on the instances we captured.
 *
 * What it cannot tell us is equally load-bearing, so it is preserved rather
 * than papered over:
 *
 * - a leaf that was `null` on every captured instance becomes `unknown`, not
 *   `null`. We saw no value, so we know no type.
 * - an array that was empty everywhere becomes `unknown[]`, not `never[]`.
 *
 * Neither is a guess dressed as a fact, and neither compiles if you reach into
 * it without deciding what you believe. The unobserved field list is tracked in
 * https://github.com/Fan-Pier-Labs/openrecord/issues/484.
 *
 * These types describe three instances out of ~750, so they are what we have
 * observed, never a contract Epic owes us — which is why reading a payload
 * still goes through the never-throwing readers in `processors/read.ts` and
 * never through `as`.
 *
 * Usage:
 *   bun run wire-types            # writes the file
 *   bun run wire-types --check    # fails if the file is stale (CI)
 */

import * as fs from 'fs';
import * as path from 'path';

import * as shapes from '../fake-mychart/src/data/realShapes';
import { OBSERVED } from '../scrapers/myChart/wire/observed';

const OUT = path.join(__dirname, '..', 'scrapers', 'myChart', 'wire', 'shapes.generated.ts');

/** `loadAllergies` → `LoadAllergies`. */
function interfaceName(exportName: string): string {
  return exportName.charAt(0).toUpperCase() + exportName.slice(1);
}

/** A key that is not a plain identifier has to be quoted in a type literal. */
function keyLiteral(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function render(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    // A template array holds at most one element: the element shape.
    if (value.length === 0) return 'unknown[]';
    const element = render(value[0], indent);
    return element.includes('\n') ? `Array<${element}>` : `${element}[]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    // `{ "*": T }` is the capture harness's marker for a map keyed by opaque ids.
    if (entries.length === 1 && entries[0]![0] === '*') {
      return `Record<string, ${render(entries[0]![1], indent)}>`;
    }
    if (entries.length === 0) return 'Record<string, unknown>';
    const inner = indent + '  ';
    const lines = entries.map(([k, v]) => `${inner}${keyLiteral(k)}: ${render(v, inner)};`);
    return `{\n${lines.join('\n')}\n${indent}}`;
  }

  // Observed null: the field exists and we have never seen it carry a value.
  if (value === null) return 'unknown';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'unknown';
}

/** Endpoint paths are recorded as a `// /path` comment above each skeleton. */
function endpointComments(): Map<string, string> {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'fake-mychart', 'src', 'data', 'realShapes.ts'),
    'utf8',
  );
  const found = new Map<string, string>();
  const re = /\/\/ (\S[^\n]*)\nexport const (\w+) =/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) found.set(m[2]!, m[1]!.trim());
  return found;
}

/**
 * Splice the hand-observed fragments in `../scrapers/myChart/wire/observed.ts`
 * into a capture, replacing every occurrence of each key.
 *
 * Returns the number of sites replaced so a stale entry — one whose key the
 * captures no longer carry — fails loudly instead of quietly describing
 * nothing.
 */
function applyObserved(value: unknown, fragments: Record<string, unknown>, hits: Map<string, number>): unknown {
  if (Array.isArray(value)) return value.map((v) => applyObserved(v, fragments, hits));
  if (value === null || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k in fragments) {
      hits.set(k, (hits.get(k) ?? 0) + 1);
      out[k] = fragments[k];
    } else {
      out[k] = applyObserved(v, fragments, hits);
    }
  }
  return out;
}

export function generate(): string {
  const endpoints = endpointComments();
  const names = Object.keys(shapes).sort((a, b) => a.localeCompare(b));

  const body = names
    .map((name) => {
      const endpoint = endpoints.get(name);
      const header = endpoint ? `/** \`${endpoint}\` */\n` : '';
      const captured = shapes[name as keyof typeof shapes];
      const fragments = OBSERVED[interfaceName(name)];
      let shape: unknown = captured;
      if (fragments) {
        const hits = new Map<string, number>();
        shape = applyObserved(captured, fragments, hits);
        const missed = Object.keys(fragments).filter((k) => !hits.has(k));
        if (missed.length > 0) {
          throw new Error(
            `observed.ts: ${interfaceName(name)} has no field ${missed.join(', ')} — ` +
              'the captures changed, so the entry is stale. Reconcile it rather than deleting it blind.',
          );
        }
      }
      return `${header}export type ${interfaceName(name)} = ${render(shape, '')};\n`;
    })
    .join('\n');

  return `// GENERATED from fake-mychart/src/data/realShapes.ts, merged with the
// hand-observed fragments in ./observed.ts — do not edit by hand.
// Regenerate with \`bun run wire-types\`; \`bun run wire-types --check\` fails on drift.
//
// What MyChart answered on the instances we captured, as TypeScript. A leaf
// typed \`unknown\` is one the captures never saw carry a value (it was null, or
// its array was always empty) — not a licence to assume anything about it.
//
// These describe observed behaviour on three instances, not a contract. Read a
// payload through the readers in ../processors/read.ts, which never throw; do
// not assert a payload into one of these with \`as\`.

${body}`;
}

if (import.meta.main) {
  const generated = generate();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== generated) {
      console.error(`${path.relative(process.cwd(), OUT)} is stale — run \`bun run wire-types\`.`);
      process.exit(1);
    }
    console.log('wire types are up to date');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, generated);
    console.log(`wrote ${path.relative(process.cwd(), OUT)} (${Object.keys(shapes).length} shapes)`);
  }
}
