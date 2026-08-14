# The browser demo

`openrecord-splash/demo/` re-creates a full OpenRecord session in the browser against a fictional
patient. Build and deploy details are in [`openrecord-splash/README.md`](../openrecord-splash/README.md);
this file is about how faithful the demo has to be to the real product.

The demo shares **no code** with the scraper core. It imports nothing from `shared/`, runs no
scraper, and ships as a static Vite bundle with a fictional record behind it. That independence is
deliberate, and the price of it is drift.

The *tool list* is no longer left to drift, though:
[`openrecord-splash/__tests__/demo-registry-parity.unit.test.ts`](../openrecord-splash/__tests__/demo-registry-parity.unit.test.ts)
compares the demo's `TOOL_SPECS` against `shared/capabilities.ts` and fails the build on a tool the
registry doesn't have, a capability the demo is missing, or a read/write classification that
disagrees. Only a test reaches across — no product code does — and the accepted divergences below
are its two allowlists, checked for staleness in both directions.

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

### Appointment scheduling exists in the demo and nowhere else

| | Real | Demo |
| --- | --- | --- |
| Find open slots | — | `get_available_appointments` |
| Book one | — | `book_appointment` (a write, with a confirmation dialog) |

There is no scheduling capability in `shared/capabilities.ts` at all. This is the one divergence
that shows a capability the product doesn't have, which the rule below would normally call a bug —
it is kept as a deliberate exception, not an oversight.

It stays because the booking dialog is the clearest demonstration of the write-confirmation model
the product is actually built on: the payload the model emits is an opaque `slot_id`, and
`resolveWriteDetails` turns it into the provider, time and location the patient is really agreeing
to, plus a warning when the model invented a slot id that cannot succeed. No real write in the
registry has that gap between payload and meaning, so nothing else demonstrates it as well.

If scheduling is ever scraped for real, delete the exception rather than reconciling the two: the
demo's slot ids and offer shape are invented and should not become a spec.

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
simplification. `shared/capabilities.ts` is the source of truth.

The parity test catches the tool-list half of that automatically now. It does **not** check that a
shared tool *behaves* the same, and it can't: the demo answers from a fictional record. Pagination
sizes, error wording and argument names are still on you.

### The demo has two patients

The account reaches its own chart and a child's, because `list_proxy_targets` and
`switch_proxy_target` are registry capabilities and the account/patient model is held to the
registry. `Session.activePatient` picks which `PatientRecord` every read resolves against, exactly
as MyChart scopes every endpoint to its server-side active patient.

Two things about this are load-bearing, not decoration:

- **`PatientRecord` is a closed type with no optional fields.** A second patient cannot quietly
  answer fewer questions than the first, so every tool has a defined answer for every record — an
  empty list where there is nothing on file.
- **The child's chart is a different *shape* of record**, not the same one with the names swapped:
  an immunization schedule, one fracture, an asthma plan, no chronic disease, two billing lines.
  A switch that returned recognisably the same answers would be demonstrating something that isn't
  happening, which is the failure the whole pair exists to avoid.
