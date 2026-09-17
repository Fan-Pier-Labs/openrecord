# `wire`

What MyChart **answers**, as TypeScript. The sibling of `../processors/`, which
is about what a caller **gets**.

`shapes.ts` is one plain type per endpoint, written from the captures in
`fake-mychart/src/data/realShapes.ts` — the harness's record of three real
instances. Ordinary TypeScript: no codegen, no build step, greppable.

## What a type here claims

*These fields, with these types, are what three instances sent.* Not that Epic
owes us any of it — three instances out of ~750, two Epic releases, and
per-organization configuration on top.

Two markers carry what the captures could not tell us:

| Type | What was observed |
| --- | --- |
| `unknown` | the field was `null` on every captured instance — we saw no value, so we know no type |
| `unknown[]` | the array was empty everywhere — we have never seen an element |

17% of leaves are one of those. `null` and `never[]` would both read as settled;
`unknown` makes reaching in a decision. A few containers were never captured
populated at all, and their shapes come from the scraper's original hand-written
response types (first commit, read off live responses in a browser) — those are
marked at the site and are weaker evidence than a capture.

## Reading a payload

```ts
const json = rec<ProxySwitch>(await resp.json());
```

`rec<T>()` from `../processors/read.ts` checks the field *names* — a typo, or a
field no instance ever sent, is a compile error — and returns `Wire<T>`, where
every leaf is optional, so the value still has to come out through `text()` /
`num()` / `list()`. `as ProxySwitch` would check the same names and then lie
about the values on an instance that omits one.

Scrapers are moving onto these a few at a time; `../proxy/proxyContext.ts` is
the worked example. Everything still on `Record<string, unknown>` reads exactly
as it did — this is additive.

## Keeping it honest

When the captures are refreshed, update `shapes.ts` to match.
`__tests__/wireShapes.unit.test.ts` walks the captures and fails the build if
the types miss a field or invent one, so it cannot go stale quietly.

Where a type and existing code disagree, **the disagreement is the finding**:
the code may be reading a field no capture recorded, or the capture may be
incomplete. Take it to
[#484](https://github.com/Fan-Pier-Labs/openrecord/issues/484) rather than
deleting the read to make the type win.
