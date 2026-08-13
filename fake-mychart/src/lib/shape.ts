/**
 * Conform a fixture to a real-MyChart response shape.
 *
 * `realShapes.ts` records the exact field set observed on real instances with
 * every leaf a neutral default. This helper fills in any field a fixture
 * omits, so the fake's responses always carry the full real field set — for
 * Homer's dataset, the kids' sparse override datasets, and the emptied
 * categories alike — while the fixture keeps authority over every field it
 * does set.
 *
 * Rules:
 * - Objects: template keys the fixture lacks are supplied with the template's
 *   neutral value; fixture-only keys are kept (curated detail the sanitized
 *   template couldn't know about, e.g. list elements real accounts had no
 *   data for).
 * - A template object with the single key "*" is a map keyed by opaque ids:
 *   the "*" shape is applied to every value the fixture provides.
 * - Arrays: every fixture element is conformed to the template's element
 *   shape (templates hold at most one element — the shape). A template with
 *   an empty array can't upgrade elements, so fixture elements pass through.
 * - Scalars: the fixture value wins whenever the fixture defines the key.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function conformToShape(template: unknown, fixture: unknown): Json {
  if (Array.isArray(template)) {
    const arr = Array.isArray(fixture) ? fixture : [];
    if (template.length === 0) return arr as Json;
    return arr.map((el) => conformToShape(template[0], el)) as Json;
  }
  if (isPlainObject(template)) {
    const keys = Object.keys(template);
    if (keys.length === 1 && keys[0] === '*') {
      const out: Record<string, Json> = {};
      if (isPlainObject(fixture)) {
        for (const [k, v] of Object.entries(fixture)) out[k] = conformToShape(template['*'], v);
      }
      return out;
    }
    const src = isPlainObject(fixture) ? fixture : {};
    const out: Record<string, Json> = {};
    for (const [k, tv] of Object.entries(template)) {
      out[k] = k in src ? conformToShape(tv, src[k]) : (neutralCopy(tv) as Json);
    }
    for (const [k, v] of Object.entries(src)) {
      if (!(k in template)) out[k] = v as Json;
    }
    return out;
  }
  // Scalar (or null) template: fixture wins when it set the value at all.
  return (fixture === undefined ? template : fixture) as Json;
}

/** Deep copy of a template subtree, "*" maps collapsing to empty objects. */
function neutralCopy(v: unknown): unknown {
  if (Array.isArray(v)) return [];
  if (isPlainObject(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '*') return {};
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = neutralCopy(x);
    return out;
  }
  return v;
}
