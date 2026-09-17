# `shared`

Response shapes MyChart repeats across **more than one** scraper — `types.ts`,
and nothing else.

A scraper's own raw response types live beside the scraper, in its
`types.ts`: `chart/visits/types.ts` sits next to `visits.ts` and
`visits.processor.ts`, the same way the scraper's README does. Only a shape two
folders both need ends up here.

## What a type claims

*These fields, with these types, are what three instances sent.* Not that Epic
owes us any of it — three instances out of ~750, two Epic releases, and
per-organization configuration on top.

| Type | What was observed |
| --- | --- |
| `unknown` | the field was `null` on every captured instance — we saw no value, so we know no type |
| `unknown[]` | the array was empty everywhere — we have never seen an element |
| `string \| null` | seen as a string at one site and `null` at another |

`null` and `never[]` would both read as settled; `unknown` makes reaching in a
decision. A few containers were never captured populated at all, and their
shapes come from the scraper's original hand-written response types (first
commit, read off live responses in a browser) — marked at the site, and weaker
evidence than a capture.

**`string | null` is the one thing a single capture cannot give you.** Where the
same shape appears at several sites, they are merged, so a field one site saw as
a string and another saw as `null` comes out as both instead of `unknown` at one
and `string` at the other. That is also why repeated shapes are named rather
than inlined: `Organization` is one type, not twelve copies that quietly
disagree.

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

When the captures in `fake-mychart/src/data/realShapes.ts` are refreshed, update
the `types.ts` files to match. Nothing enforces that automatically — the types
say what we observed, and a stale one describes an older observation rather than
becoming dangerous. A field a refresh adds shows up the first time someone tries
to read it, as a compile error naming the field, which is the point at which
adding it is cheap.

Where a type and existing code disagree, **the disagreement is the finding**:
the code may be reading a field no capture recorded, or the capture may be
incomplete. Take it to
[#484](https://github.com/Fan-Pier-Labs/openrecord/issues/484) rather than
deleting the read to make the type win.
