# `processors` — the shared half of the processor layer

Every read scraper hands back a `RawResponse` and lets its sibling `.processor.ts` decide
what a caller sees. This folder holds the machinery all of them share: the contract, the
four output modes, the markdown renderer, the never-throwing readers, and HTML→text.

| | |
| --- | --- |
| **Source** | [`processor.ts`](processor.ts) · [`markdown.ts`](markdown.ts) · [`read.ts`](read.ts) · [`htmlText.ts`](htmlText.ts) |
| **Spec** | [`docs/processor-layer-proposal.md`](../../../docs/processor-layer-proposal.md) — the numbered rules |
| **Examples** | [`docs/processor-layer-examples.md`](../../../docs/processor-layer-examples.md) — every capability in all four modes |
| **Open work** | [`docs/processor-layer-todo.md`](../../../docs/processor-layer-todo.md) |

The **per-capability contract tables** — which fields each mode carries, and why — live in
each scraper's own README, next to the code. Start from
[`../../README.md`](../../README.md).

## The four modes

| Mode | What it is |
| --- | --- |
| `raw` | the HTTP body, untouched — the single body when there was one request, the whole envelope otherwise |
| `json` | the **standard object**: everything with any chance of being useful, under MyChart's own field names, markup stripped into `<field>Text` fields, always-empty and UI-only fields removed |
| `standard` | that same object rendered as markdown |
| `concise` | a projection of that same object, rendered as markdown |

`standard` and `json` are **one object rendered two ways**, and `concise` is a projection of
it, so a field can never be in one and not the other. `json` is the default for a
programmatic caller; the model-facing clients (MCPB, the mobile agent) ask for `concise`
themselves.

## The rules that bite

The numbered list is in the proposal doc. In practice these are the ones that decide a
review:

- **A MyChart field is never edited in place or shadowed.** A computed value gets a new
  name: `body` stays MyChart's, `bodyText` is the derived one.
- **Membership in a mode is decided by the field's NAME, never its value.** A field on the
  list is emitted even when it is empty — that is how "no allergies on file" survives as an
  answer rather than becoming an absent key. The one sanctioned exception is the goals
  scraper's empty-slot drop; see [`../chart/goals/`](../chart/goals/) for why it earned it.
- **Markup stays in `raw`.** Nothing but `raw` ever carries HTML.
- **Never invent a shape.** An element nobody has captured passes through whole rather than
  being narrowed to guessed field names.
- **Errors pass through.** A literal `null` from an unknown id, a scrape error, a WAF page —
  returned as-is in every mode, not rendered into nothing. A standard object that comes back
  `null` is passed through rather than rendered.

## `markdown.ts` — one renderer, deliberately generic

There is no per-capability template, because a template is a second place for a field to go
missing. Whatever is in the object is on the page, in the object's key order, so `standard`
markdown and `json` are **provably the same data**.

Scalars become `- **key**: value`; an array of flat objects becomes a table and anything
with nested or long values becomes one sub-section per element; a multi-line string becomes
a paragraph with hard line breaks, so a clinical note reads as a note rather than one
run-on line; `null` renders as `(none)`.

## `read.ts` — readers that never throw

Processors run against **whatever an Epic release actually sent**, not against what a type
says it sent. A field an instance omits has to come out as an empty value rather than
crashing mid-scrape, so `rec` / `list` / `text` / `bool` / `num` coerce and never throw.
`textOrNull` and `boolOrNull` exist where `""` and "absent" are different claims.

`epicInstantMs` parses Epic's `/Date(1761851400000)/`; `isoFromMs` is its ISO-8601 partner.

## `htmlText.ts` — markup to text

Uses `html-to-text` rather than cheerio's `.text()`, which **drops every block boundary** —
a note's paragraphs, list items and table cells run together into one line. Block elements
become line breaks, headings keep their case (MyChart's notes are prose, not shouting),
links keep their text and lose their href, images are skipped.

It parses to a tree and **never re-emits markup**, so nothing it returns can be rendered as
HTML downstream.
