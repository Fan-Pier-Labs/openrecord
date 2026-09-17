# `wire`

What MyChart **answered**, as TypeScript. The sibling of `../processors/`, which
is about what a caller **gets**.

`shapes.generated.ts` is generated — `bun run wire-types` — from two sources:

1. `fake-mychart/src/data/realShapes.ts`, the capture harness's record of three
   real instances. This is the evidence.
2. `observed.ts`, hand-written fragments for containers the captures only ever
   saw as `null` or `[]`. Weaker evidence, flagged as such, and the generator
   refuses an entry whose key the captures no longer carry.

Do not edit `shapes.generated.ts` by hand;
`dev-scripts/__tests__/generate-wire-types.unit.test.ts` fails the build if it
drifts from either source.

## What a type here does and does not claim

It claims: *these fields, with these types, are what three instances sent.*
It does not claim Epic owes us any of it. Three instances out of ~750, two Epic
releases, and per-organization configuration on top.

So a payload is still read through `../processors/read.ts`, never asserted with
`as`. `rec<LoadAllergies>(body)` gives the shape's field names — a typo or a
field no instance ever sent is a compile error — while `Wire<T>` makes every
leaf optional, so the value still has to come out through `text()` / `num()` /
`list()` and a missing field is still an empty value rather than a crash. An
`as` would check the same names and then lie about the values.

Two markers carry the limits of the capture into the type:

| Type | What was observed |
| --- | --- |
| `unknown` | the field was `null` on every captured instance — we have seen no value, so we know no type |
| `unknown[]` | the array was empty on every captured instance — we have never seen an element |

17% of leaves are one of those two. Reading one is a decision, not an accident,
which is the point of not writing `null` or `never[]` there.

## Converting a scraper

Scrapers are being moved onto these a few at a time; `../proxy/proxyContext.ts`
is the worked example. Everything still on `Record<string, unknown>` reads
exactly as it always did — this is additive.

Where a generated type and existing code disagree, **the disagreement is the
finding**: the code may be reading a field the captures never recorded, or the
capture may be incomplete. If the field is genuinely observed, it belongs in
`observed.ts` with its provenance; otherwise take it to
[#484](https://github.com/Fan-Pier-Labs/openrecord/issues/484). Never edit the
generated file, and never delete the read to make the type win.
