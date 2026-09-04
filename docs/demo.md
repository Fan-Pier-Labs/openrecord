# The browser demo

`openrecord-splash/demo/` re-creates a full OpenRecord session in the browser against a fictional
patient. Build and deploy details are in [`openrecord-splash/README.md`](../openrecord-splash/README.md);
this file is about how faithful the demo has to be to the real product.

The demo shares **no code** with the scraper core. It imports nothing from `shared/`, runs no
scraper, and ships as a static Vite bundle with a fictional record behind it. That independence is
deliberate, and the price of it is drift.

One part of that price is now paid automatically: `shared/__tests__/capability-parity.unit.test.ts`
checks the demo's catalogue against the registry the way it checks the other four clients — every
read and write capability has a tool, writes are gated as writes, required parameters are named,
and the demo-only extras are an explicit list. Everything below the tool surface — behaviour,
copy, presentation — is still a judgement call.

## Not on the homepage yet

**The splash does not link to the demo, and must not until the demo is golden.** `/demo.html`
deploys with every push but is unadvertised, so today it is reached only by someone sharing the
URL. That is a deliberate hold, not a missing call-to-action — don't "fix" it.

The reason is that the homepage is a one-shot audience. A visitor who asks a reasonable question
and gets a wrong or empty answer doesn't file a bug; they leave, and they conclude the *product*
is bad rather than the demo unfinished. Shared by URL, the demo goes to people who already have
context and will say so when something breaks.

Golden means, at least:

- **Every suggested prompt lands, every time.** They are the path most visitors take. Run all of
  them, more than once — replies are real model calls, so a prompt that works four times in five
  is not done.
- **Off-script questions degrade honestly.** Ask about something the fictional record doesn't
  cover and the answer says so rather than inventing it.
- **Write tools do what they claim**, and the result is visible from the other surface — the
  cross-client handoff is the thing most worth showing.
- **"Model unreachable" is rare.** It is the correct failure, but a first-time visitor shouldn't
  meet it.
- **It holds up on a phone**, since a shared link is opened on one more often than not.

Adding the link is a one-line change to `index.html`. Everything above it is the work.

## The rule

A demo divergence is fine when it is a **simplification the visitor cannot read as a product
claim**. It is a bug when the demo shows a capability the product doesn't have, or hides one it
does — that turns the demo into a promise nobody has to keep.

So: the tool set, the write-confirmation set, and the account/patient model are held to
`shared/capabilities/`. Presentation, playbook copy, and loop economics are not.

## Accepted divergences

These have been reviewed and are staying. Don't re-file them.

### The X-ray is drawn, not downloaded

| | Real | Demo |
| --- | --- | --- |
| Tool | `download_imaging_study` (`rendersMedia: true`) | `download_imaging_study` |
| Argument | `image_id` from `get_imaging_results`, or `imaging_index` | same |
| Token the model emits | `[image:IMAGE_ID]` | a fixed `[image:xray]` |
| Where the pixels come from | the eUnity protocol (see [imaging.md](imaging.md)) | `components/Radiograph.tsx` draws it procedurally |

The tool, its identifiers, and its refusals now match: a study with pictures carries an `image_id`,
a report-only study carries none and refuses the download. What stays divergent is the picture
itself. There is no eUnity instance to talk to and no patient's radiograph anyone should ship in a
static bundle, so the demo draws one and the model always emits the same token for it. The visitor
sees an X-ray appear inline, which is the part that matters.

### Eight tools have no registry id, on purpose

Six of them are account setup — `list_accounts`, `setup_account`, `connect_instance`,
`check_session`, `complete_2fa`, `disconnect_account`. They mirror the Claude Desktop extension's
meta tools, which manage credentials on one machine and are deliberately outside
`shared/capabilities/`. The demo implements them (a visitor can watch a login, a 2FA prompt, and a
disconnect play out) but never lists them in the model's prompt, because the session starts
connected. `search_mycharts` used to be the seventh; it is a `public` capability now, so the demo's
copy is held to the registry like any other tool.

The other two are `get_available_appointments` and `book_appointment`. Scheduling is not a
capability the product has yet, and this is the one place the demo shows something the product
can't do — accepted because booking is the clearest illustration of a confirmed write, and
retired the moment real scheduling lands. The parity test pins the list, so a tenth cannot appear
without someone deciding to add it.

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
simplification. `shared/capabilities/` is the source of truth, and the parity test now says so
for the catalogue. It cannot check what a tool *does*, so a tool that exists but answers nothing
like the real one is still drift a person has to catch.
