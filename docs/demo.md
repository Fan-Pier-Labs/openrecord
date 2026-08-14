# The browser demo

`openrecord-splash/demo/` re-creates a full OpenRecord session in the browser against a fictional
patient. Build and deploy details are in [`openrecord-splash/README.md`](../openrecord-splash/README.md);
this file is about how faithful the demo has to be to the real product.

The demo shares **no code** with the scraper core. It imports nothing from `shared/`, runs no
scraper, and no parity test covers it — it ships as a static Vite bundle with a fictional record
behind it. That independence is deliberate, and the price of it is drift.

## The rule

A demo divergence is fine when it is a **simplification the visitor cannot read as a product
claim**. It is a bug when the demo shows a capability the product doesn't have, or hides one it
does — that turns the demo into a promise nobody has to keep.

So: the tool set, the write-confirmation set, and the account/patient model are held to
`shared/capabilities.ts`. Presentation, playbook copy, and loop economics are not.

## Accepted divergences

These have been reviewed and are staying. Don't re-file them.

### The imaging tool is a drawing, not a download

| | Real | Demo |
| --- | --- | --- |
| Tool | `download_imaging_study` (`rendersMedia: true`) | `get_xray_image` |
| Argument | `image_id` from `get_imaging_results` | 0-based index into the imaging list |
| Token the model emits | `[image:IMAGE_ID]` | a fixed `[image:xray]` |
| Where the pixels come from | the eUnity protocol (see [imaging.md](imaging.md)) | `components/Radiograph.tsx` draws it procedurally |

The demo record holds exactly one image, so id indirection and a `rendersMedia` flag would be
machinery with a single caller and no second case to justify it. The visitor sees an X-ray appear
inline, which is the part that matters.

### The skill playbooks are abridged

`demo/src/skills.ts` carries the same three skills as
[`expo-app/src/lib/skills/catalog.ts`](../expo-app/src/lib/skills/catalog.ts) — same ids, titles,
kickoff messages, and closing lines — with shorter playbooks. Each one drops its
sparse-data terminator (`analyze_history`'s "don't fabricate observations", `bill_itemization`'s
"zero bills … say so plainly and stop", `recommend_insurance`'s "too thin to estimate … don't
guess"), and `analyze_history` pulls a narrower set of tools in step 1.

The fictional record is dense by construction — multi-draw lab trends, a long billing ledger — so
the branches those lines guard are unreachable in the demo. The demo's system prompt also carries a
blanket "never state a value you have not read from a tool result" rule that the shipping client
does not, which covers the same failure mode more broadly.

### The agent loop is bounded by turns, not by a clock

Real: no turn cap and a ten-minute wall-clock deadline (`TOOL_LOOP_DEADLINE_MS` in
`expo-app/src/lib/ai/claude-client.ts`). Demo: `MAX_TURNS = 8` and no deadline.

The demo is anonymous, rate-limited by IP at [`openrecord-demo-lambda`](../openrecord-demo-lambda),
and pays for every turn. A turn cap is the cheaper backstop, and it fails inside a single
page-view rather than after ten minutes of a stranger's patience.

## Everything else is drift

If you find the demo offering a tool the registry doesn't have, missing one it does, gating a
different set of writes, or spelling a shared parameter differently — that's a bug, not a
simplification. `shared/capabilities.ts` is the source of truth; the demo is the one surface that
can't be told so automatically.
