# `wire`

What MyChart **answered**, as TypeScript. The sibling of `../processors/`, which
is about what a caller **gets**.

`shapes.generated.ts` is generated — `bun run wire-types`, from
`fake-mychart/src/data/realShapes.ts`, the capture harness's record of three
real instances. Do not edit it by hand;
`dev-scripts/__tests__/generate-wire-types.unit.test.ts` fails the build if it
drifts from the captures.

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
capture may be incomplete. Take it to
[#484](https://github.com/Fan-Pier-Labs/openrecord/issues/484) rather than
editing the generated file or deleting the read.
