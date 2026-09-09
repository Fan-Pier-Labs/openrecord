# `preventiveCare`

Health maintenance — the screenings and vaccines that are due, overdue or done: Epic's
"Health Advisories".

| | |
| --- | --- |
| **Capabilities** | `get_preventive_care` (read) |
| **Source** | [`preventiveCare.ts`](preventiveCare.ts) · [`preventiveCare.processor.ts`](preventiveCare.processor.ts) |
| **Activity** | Legacy `/HealthAdvisories` |

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /HealthAdvisories` | — | the activity page, fetched for its antiforgery token |
| `POST /HealthAdvisories/GetTopics` | `registryID=` (form-encoded) | the advisories |

## Notes and research

- **The activity page carries no advisories.** On the captured instance it is an empty
  client-rendered shell — `<div id="hm-list-activity">` with a comment inside it, and not
  one `<table>`, `<tr>` or `<td>` in 111KB of markup — plus the controller that fills it:

  ```js
  var healthAdvisoriesController = new Epic.PatientAccess.HealthAdvisories
    .HealthAdvisoriesController($afe.select("#hm-list-activity"), "", true);
  ```

  This scraper used to be that page and a cheerio table parser, which meant a chart with
  thirteen advisories came back as `items: []` — indistinguishable from "no screenings
  due". That is the silent-wrong-answer failure the processor layer exists to prevent.

- **`registryID` is the controller's second constructor argument**, which the standalone
  activity passes as `""`. `loadActivity` in `healthadvisoriescontroller.min.js` posts it
  form-encoded after fetching a CSRF token. It is sent as the controller sends it; the
  captured instance ignores it entirely (absent, lowercased `registryid` and a bogus value
  all returned the same thirteen topics).

- **The antiforgery token is required, as a header or in the form body — not in the query
  string.** Probed live: header 200, form body 200, `?__RequestVerificationToken=…` 500,
  no token 500. The header is what this scraper sends, matching
  `Insurance/Coverages/GetPayors`. `X-Requested-With: XMLHttpRequest` turned out not to
  matter, and is sent because jQuery sends it.

- **A `GET` of `GetTopics` throws inside the action** — a bare 500 ASP.NET "Runtime Error"
  page on the captured instance, which also answers an unknown path and an unknown `/api/*`
  path with a bare 500. That is the August-2025-shaped error surface, not the November 2025
  redirect dance.

- **A null `HealthAdvisoryViewModelList` is "none"; anything else is a gap.** The
  controller's own test for the error surface is a non-empty `Text`, and a successful
  response carries no `Text` key at all. So a null or empty list is a real answer, and a
  failed request, an error `Text` or an envelope without the key is named in `unavailable`
  instead of being flattened to an empty list.

- **There is no HTML parser.** One survived the rewrite as a fallback "for an instance that
  still renders the table server-side" — but no such instance has ever been captured, so it
  could only ever produce items from a page shape nobody has seen, which is the same class
  of answer this scraper exists to stop giving. `unavailable` is the honest answer when the
  endpoint does not answer. If a server-rendered instance turns up, its capture says what
  to write.

### Sample size

The response shape, the CSRF transport and the `registryID` behavior are all from **one
live instance** (November 2025 organization, mount `/MyChart-PRD`, 13 topics). Nothing here
has been checked on a second one. That is why topics pass through whole rather than through
a fixed field list: a list built from one capture silently drops whatever a second Epic
release adds.

`StatusCode` values seen on the wire: `100_OVERDUE`, `500_NOTDUE`, `700_SATISFIED`,
`800_AGED_OUT`. The other five in `statusFromCode` (`200_DUE`, `300_DUESOON`,
`400_POSTPONED`, `600_ADDRESSED`, `900_EXCLUDED`) are the client's own switch; Epic's custom
`<code>^<display text>` form and anything unrecognized come out `unknown` rather than being
guessed at.

Fields the bundles advertise that the captured response does **not** carry at the top level:
`HelpTextHeader`, `HelpTextDescription`, and the attestation/snooze flags, which live inside
`UpdateInformation`. `StatusText`, `ShouldShowStatusText`, `BreadcrumbMessage*` and
`AllDoneDates` are computed by the client and are not server fields — but `Status` is,
carrying the display word (`Overdue` / `Not due` / `Completed`).

## Modes: what each mode carries

Part of the processor layer. The rules (never rename a MyChart field, membership by field
name, markup only in `raw`, never invent a shape) and the drop-reason tags used in the
Reasoning column are in [`docs/processor-layer-proposal.md`](../../../../docs/processor-layer-proposal.md);
example output in all four modes is in
[`docs/processor-layer-examples.md`](../../../../docs/processor-layer-examples.md).

Columns: **Field** (MyChart's name, or the derived name), **What it is**,
**Derived** (✓ when the processor computes it from other fields; such a field
is never in `raw`), **Standard / JSON**, **Concise**, **Reasoning** (why the
field is in or out of each of the two).

Fields that share a description and a fate are grouped on one row. A group's
members are all listed so nothing is implied.

## `get_preventive_care`

`POST /HealthAdvisories/GetTopics`, whose envelope is `{ HealthAdvisoryViewModelList,
HealthAdvisorySettings }`.

| Field | What it is | Derived | Standard / JSON | Concise | Reasoning |
| --- | --- | :-: | :-: | :-: | --- |
| `items[]` | `HealthAdvisoryViewModelList`, each topic pass-through | — | ✓ | ✓ | Every field MyChart sent, under MyChart's names. One instance captured, so no field list is fixed. |
| `items[].Name` | The screening | — | ✓ | ✓ | The topic. |
| `items[].dueStatus` | `StatusCode` normalized: `overdue` / `due` / `due_soon` / `postponed` / `not_due` / `addressed` / `satisfied` / `aged_out` / `excluded` / `unknown` | ✓ | ✓ | ✓ | Derived. `Status` is display text; this is the locale-independent form. |
| `items[].Status` | MyChart's display word for the status | — | ✓ | ✓ | What the activity shows the patient. |
| `items[].FormattedDueDate`, `items[].FormattedLastDoneDate` | When it is due, and when it was last done | — | ✓ | ✓ | A status without its dates is half an answer. |
| `items[].StatusCode`, `CareGapType`, `TopicId`, the `…ISO` dates, `FormattedDoneDates`, `FormattedLastCompletedDate`, `FormattedPostponedDate`, `FormattedLastRequestedDate`, the `Can…` / `Is…` / `Has…` flags, `ContentLink*`, `OrderId`, `OrderTicketId`, `Sched*`, `UpdateInformation` | The rest of the topic | — | ✓ | — | Pass-through: history, scheduling and attestation detail. Detail, so out of concise. |
| `settings` | `HealthAdvisorySettings` — the activity's appointment-scheduling context | — | ✓ | — | Pass-through. Chrome for the scheduling buttons, not the record. |
| `unavailable[]` | The paths that did not answer | ✓ | ✓ | ✓ | Derived. Non-empty means the item list is *not known*, not empty. In concise too: it is the difference between "nothing due" and "nothing read". |
