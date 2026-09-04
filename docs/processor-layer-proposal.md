# Processor layer: what each capability returns in each mode

**Status: implemented** (PR #388). This is the design record and the per-field contract; the
per-capability tables now live beside each scraper as `scrapers/myChart/chart/<name>/README.md`
and are indexed in §3.

A proposal, originally. Nothing in it was implemented when it was written. It covers the scraper layer only:
what every read capability's raw HTTP response contains, and which of those
fields the four output modes carry. How the CLI, the MCPB and the Expo app pick
a mode is a separate change.

The inventory behind every table came from reading each scraper, the captured
live skeletons in `fake-mychart/src/data/realShapes.ts`, the fixtures in
`fake-mychart/src/data/homer.ts`, `realBehavior.integration.test.ts`,
`docs/api-surface-gaps.md`, and the three PRs that already started this work
(#375, #377, #380).

## 1. The layer

Today a scraper does two jobs: it talks to MyChart, and it decides what the
caller gets to see. Those decisions are scattered and inconsistent. Medications
picks 12 fields out of ~150 and throws the rest away. Visits returns all 159
fields of Epic's view model untouched. Labs deletes one field and keeps the other
~120. Notes hand back raw HTML. Preventive care parses an HTML page into records
and the page itself is gone.

The processor layer splits the two jobs.

```
scraper   : MyChartRequest → RawResponse            (network only, no editing)
processor : RawResponse × mode → output              (pure, no network)
```

One processor per scraper, in the scraper's own folder
(`scrapers/myChart/chart/<name>/<name>.ts` beside `<name>.processor.ts`, with the
folder's `__tests__/`). The capability registry runs the scraper, then the
processor, and the `mode` becomes a parameter every read capability accepts.
Clients pass whichever mode suits them; none of them post-processes.

### Modes

| Mode | What it is | Format |
| --- | --- | --- |
| `raw` | The HTTP response body, byte-for-byte as MyChart sent it. HTML snippets, always-empty fields, wrong fields, Epic's UI flags, everything. | JSON (or the HTML string, for HTML endpoints) |
| `standard` | Everything with any chance of being useful to a consumer. HTML is stripped into new text fields. Fields that are always empty, always wrong, or describe MyChart's own web UI are removed. | Markdown |
| `concise` | The subset of `standard` that answers "what happened / what is it / when / who". | Markdown |
| `json` | Exactly the data behind `standard`, as JSON. | JSON |

One parameter, `mode`, with those four values. `standard` and `json` are one
thing rendered two ways: the processor builds one object (the *standard
object*), `json` serializes it, and `standard` renders it through a generic
markdown renderer. `concise` is a projection of the same object, rendered by
the same generic renderer. There is no per-capability markdown template: a
field that is in the object is on the page, so nothing can go missing between
the two formats. There is never a field in `standard` that is not in `json`, or
the other way round, and the tables below have one column for the pair. `raw`
has no column: every MyChart field is in it by definition, and no derived field
is.

### Rules

1. **Raw is untouched.** Whatever cleanup a scraper does today moves into its
   processor. PR #375's `dropUnusableAbnormalFlags` is the model: the field
   exists in `raw`, and only in `raw`.
2. **A MyChart field is never edited in place, and never shadowed.** A field that
   passes through keeps MyChart's name, casing and value. Anything the processor
   computes gets a *new* name, so one name means one thing everywhere in the
   codebase. `body` is always MyChart's body; the stripped text is `bodyText`.
   `Instant` is always Epic's `/Date(ms)/` string; the parsed value is
   `instantISO`.
3. **Derived-field naming.** Suffix by what was done:
   `<field>Text` for markup stripped to plain text, `<field>ISO` for a
   timestamp normalized to ISO-8601, `<field>Number` for a parsed amount. A field
   the processor synthesizes from several raw fields (a status word, a flattened
   list) gets a plain camelCase name that no MyChart field uses and is listed in
   this document.
4. **Dropping needs evidence.** A field leaves `standard` only for one of the
   reasons in §2, and the processor's comment says which. "Looks useless" is not
   a reason; a patient's data is not recoverable without another round trip.
5. **Handles survive every mode.** Any id another capability takes as input
   (`Csn`, `hnoID`/`hnoDAT`/`lrpID`, `hthId`, `image_id`, contact `id`, proxy
   `Id`) is in `standard` and `concise`. A concise view that cannot be followed
   up on is a dead end.
6. **Membership is decided by the field's name, never by its value.** Each
   mode has a fixed field list per capability. A field on the list is emitted
   every time, including when its value is `false`, `0`, `""`, `null` or `[]`:
   "not refillable" and "no allergies on file" are answers, and a reader must
   be able to tell "none" from "not looked at". A field that is empty on every
   captured instance is off the list for `standard` and `concise` (the
   provably-empty class in §2). A field that carries data on some responses
   and not others is on the list, and the processor never looks at the value
   to decide whether to emit it. The unmerged condensers' `row()` helper,
   which drops a key when its value is empty, violates this and is not
   carried over.
   Two consequences worth stating. The rule still decides by value once, at
   design time: "empty on every captured instance" is evidence about values,
   and the field list is where that evidence lives, so that runtime never has
   to look. And `concise`'s size win comes from the list being short, not from
   rows being sparse — the 36× / 52× that #377 and #380 measured used
   drop-if-empty, so those numbers move. `concise` is a static pick of fields
   per capability, which is also what lets a test check every listed field
   against the captured skeleton.

   **One sanctioned exception, and the bar for another.** `get_goals` drops a
   patient goal whose `text` is empty, which is membership by value. It is
   allowed because MyChart appends exactly one such element to *every*
   response — the empty editable slot the activity renders — and Epic's own
   client does the same thing with it (`epic.px.client.goals` gates on
   `!isNullOrEmpty(patientGoals[0].text)`, and its reducer deletes an element
   whose `text` is `''`). Without the drop every patient has one nameless goal,
   which is a wrong answer rather than a verbose one. The bar for a second
   exception is that one: a sentinel MyChart always sends, and Epic's shipped
   client discarding it by the same test. "This field is usually empty" is not
   that, and neither is "the output is smaller without it".
7. **Errors pass through.** A scrape-error shape (`{ error }`), a WAF
   interstitial, a literal `null` from an unknown id: the processor returns it
   unchanged in every mode. Summarizing an error into nothing hides why the
   scrape failed.

   **An endpoint that did not answer is never reported as an empty list**, and
   how to say so depends on how many endpoints there are. A capability whose
   answer comes from one endpoint **throws** — there is nothing partial to
   return, and `get_insurance` reporting "no insurance on file" from a 500 is
   the failure mode the whole layer exists to prevent (`get_insurance_payers`
   and `get_questionnaires` do the same). A capability that reads several
   independent endpoints returns what loaded and **names the ones that did
   not** in a derived `unavailable` list, because throwing away a good half is
   its own wrong answer: one captured instance answers `LoadPatientGoals` with
   HTTP 500 on every request while care-team goals load fine, so `get_goals`
   returns the care-team goals and says which endpoint is missing.
8. **No clock, no locale.** Dates come from MyChart's own rendering or from a
   field that carries an explicit instant. The processor never formats an
   instant in the process's local zone (PR #380's reasoning: that moves an
   evening appointment to the wrong day).
9. **Markup stays in `raw`.** A field that carries HTML or RTF (`reportContent`,
   `bodyHTML`, a message `body`, a lab `value` with `isValueRtf`) is not on the
   `standard` or `concise` list. Those modes carry the derived `<field>Text`
   instead: plain text, block elements as line breaks, headings on their own
   lines, list items as bullets, table rows as tab-separated cells. The
   converter parses to a tree and never re-emits markup, so nothing it
   produces is ever rendered as HTML downstream.
10. **Never invent a shape.** A processor projects only field names that a
    captured real response has shown. Where the element shape has never been
    captured, the processor passes the element through whole and the table
    says so. Fixture fields that exist only in the fake are not evidence.
11. **A capability is not one MyChart endpoint.** There is no 1:1 relationship
    between a scraper and a MyChart API. A scraper calls whatever it takes to
    gather everything relevant to its category: several endpoints (labs is a
    list call, then a details call, a trend call and a report call per order;
    billing is a page scrape plus three calls per account), or one endpoint
    many times (past visits pages; vitals pages per episode). The capabilities
    are a re-organization of MyChart's API surface around what a reader asks
    for, which is why `raw` is an envelope of requests rather than one body,
    and why the join across those requests is processor work.

### The raw envelope for multi-request scrapers

Half the scrapers issue more than one request (labs is four list calls plus two
or three per order; billing is a page scrape plus three JSON calls per account;
past visits pages). "The raw HTTP response" is therefore a list, not a value.

```ts
type RawResponse = {
  requests: Array<{
    path: string;            // as sent, minus the noCache nonce
    method: 'GET' | 'POST';
    requestBody?: unknown;   // the JSON we posted, when it matters (orderKey, csn…)
    status: number;
    contentType: string;
    body: unknown;           // parsed JSON, or the HTML/text string
  }>;
};
```

For a single-request scraper `raw` mode returns `requests[0].body` directly so a
CLI user sees the endpoint's JSON, not a wrapper. For multi-request scrapers it
returns the envelope. The `standard` object is built from the envelope, so
merging (visits pages, lab detail + trend + report) is processor work, not
scraper work.

## 2. Reasons that recur in the tables

The reasoning column in §3 uses these short names so the argument is written
once. Anything not covered by one of these is spelled out on the row.

| Name | Meaning |
| --- | --- |
| **UI flag** | A boolean saying which button or panel MyChart's own web page renders (`IsRescheduleEnabled`, `showRefillButton`, `CanHideProvider`). No information about the patient. |
| **portal link** | A relative URL into the web portal. Useless outside a browser session. |
| **asset** | Photo, logo, icon, thumbnail, color, blob token. Presentation only. |
| **org blob** | The ~20-field organization object MyChart repeats on every row (`IsSSO`, `IncompleteH2GSetup`, `PayerOrgDetails`, `hasValidRefreshToken`, …). Only `OrganizationName` (and an address where a location matters) carries anything; it is lifted onto the row as a scalar. |
| **DXR plumbing** | State of MyChart's Care Everywhere / cross-organization data loading (`showDxrRefreshBanner`, `LoadingOrgNames`, `linkType`). Not chart content. |
| **session context** | Describes the caller, not the chart (`isProxyContext`, `userSettings`, `devicePlatform`, `IsClientTime`). |
| **internal** | Continuation tokens, Epic 1840-epoch day counts, blob keys, report variables, nonces. Needed by the scraper to fetch, not by a reader. A few stay as handles where a follow-up capability needs them. |
| **duplicate** | The same fact in another rendering that is kept (`Date` beside `Instant`, `contentAsHtml` beside `contentAsString`). |
| **always empty** | Empty, null or a constant on every captured instance, with the source of the evidence named. |
| **release-only** | Present on one Epic release and absent on the other, and not about the patient. |
| **uncaptured** | The element shape has never been seen on a real instance; passed through whole until a capture exists. |
| **handle** | An id another capability takes as input. Kept in every mode (rule 5). |
| **derived** | Computed by the processor from the raw fields named. Not in `raw`. |

## 3. Per-capability tables

One table set per scraper, kept beside the code it describes so a processor change and its
contract change land in the same folder. Each README uses the columns **Field**, **What it
is**, **Derived**, **Standard / JSON**, **Concise**, **Reasoning** (why the field is in or out
of each of the two), with the drop reasons from §2.

| Capabilities | Contract |
| --- | --- |
| `get_profile` | [`scrapers/myChart/chart/profile/README.md`](../scrapers/myChart/chart/profile/README.md) |
| `get_health_summary` | [`scrapers/myChart/chart/healthSummary/README.md`](../scrapers/myChart/chart/healthSummary/README.md) |
| `get_medications` | [`scrapers/myChart/chart/medications/README.md`](../scrapers/myChart/chart/medications/README.md) |
| `get_allergies` | [`scrapers/myChart/chart/allergies/README.md`](../scrapers/myChart/chart/allergies/README.md) |
| `get_health_issues` | [`scrapers/myChart/chart/healthIssues/README.md`](../scrapers/myChart/chart/healthIssues/README.md) |
| `get_vitals` | [`scrapers/myChart/chart/vitals/README.md`](../scrapers/myChart/chart/vitals/README.md) |
| `get_immunizations` | [`scrapers/myChart/chart/immunizations/README.md`](../scrapers/myChart/chart/immunizations/README.md) |
| `get_preventive_care` | [`scrapers/myChart/chart/preventiveCare/README.md`](../scrapers/myChart/chart/preventiveCare/README.md) |
| `get_medical_history` | [`scrapers/myChart/chart/medicalHistory/README.md`](../scrapers/myChart/chart/medicalHistory/README.md) |
| `get_goals` | [`scrapers/myChart/chart/goals/README.md`](../scrapers/myChart/chart/goals/README.md) |
| `get_upcoming_visits` | [`scrapers/myChart/chart/visits/README.md`](../scrapers/myChart/chart/visits/README.md) |
| `get_visit_notes`, `get_note_content` | [`scrapers/myChart/chart/notes/README.md`](../scrapers/myChart/chart/notes/README.md) |
| `get_letters`, `get_letter_details` | [`scrapers/myChart/chart/letters/README.md`](../scrapers/myChart/chart/letters/README.md) |
| `get_documents` | [`scrapers/myChart/chart/documents/README.md`](../scrapers/myChart/chart/documents/README.md) |
| `get_lab_results`, `get_imaging_results`, `download_imaging_study` | [`scrapers/myChart/chart/labs/README.md`](../scrapers/myChart/chart/labs/README.md) |
| `get_messages`, `get_message_thread`, `get_message_recipients`, `get_message_topics` | [`scrapers/myChart/chart/messages/README.md`](../scrapers/myChart/chart/messages/README.md) |
| `get_billing` | [`scrapers/myChart/chart/bills/README.md`](../scrapers/myChart/chart/bills/README.md) |
| `get_insurance` | [`scrapers/myChart/chart/insurance/README.md`](../scrapers/myChart/chart/insurance/README.md) |
| `get_insurance_payers` | [`scrapers/myChart/chart/insurancePayers/README.md`](../scrapers/myChart/chart/insurancePayers/README.md) |
| `get_care_team` | [`scrapers/myChart/chart/careTeam/README.md`](../scrapers/myChart/chart/careTeam/README.md) |
| `get_referrals` | [`scrapers/myChart/chart/referrals/README.md`](../scrapers/myChart/chart/referrals/README.md) |
| `get_upcoming_orders` | [`scrapers/myChart/chart/upcomingOrders/README.md`](../scrapers/myChart/chart/upcomingOrders/README.md) |
| `get_questionnaires` | [`scrapers/myChart/chart/questionnaires/README.md`](../scrapers/myChart/chart/questionnaires/README.md) |
| `get_questionnaires` | [`scrapers/myChart/chart/careJourneys/README.md`](../scrapers/myChart/chart/careJourneys/README.md) |
| `get_activity_feed` | [`scrapers/myChart/chart/activityFeed/README.md`](../scrapers/myChart/chart/activityFeed/README.md) |
| `get_education_materials` | [`scrapers/myChart/chart/educationMaterials/README.md`](../scrapers/myChart/chart/educationMaterials/README.md) |
| `get_ehi_export` | [`scrapers/myChart/chart/ehiExport/README.md`](../scrapers/myChart/chart/ehiExport/README.md) |
| `get_linked_accounts` | [`scrapers/myChart/chart/otherMyCharts/README.md`](../scrapers/myChart/chart/otherMyCharts/README.md) |
| `get_emergency_contacts` | [`scrapers/myChart/chart/emergencyContacts/README.md`](../scrapers/myChart/chart/emergencyContacts/README.md) |
| `list_proxy_targets` | [`scrapers/myChart/proxy/README.md`](../scrapers/myChart/proxy/README.md) |
| `lookup_npi`, `search_npi_registry` | [`scrapers/npi/README.md`](../scrapers/npi/README.md) |

The NPI Registry is the one source here that is not MyChart — a public CMS API
that needs no login. The rules are about a source's fields rather than about
Epic, so they carry over unchanged, and reusing the envelope and the processor
contract is what lets those two capabilities take the same `mode` parameter as
every MyChart read. Its scraper builds the one-request envelope directly rather
than through `RawCollector`, whose job is MyChart session expiry and the
active-patient restore; there is no session to keep.

## 4. What moves out of the scrapers

| Scraper | Logic that becomes processor work |
| --- | --- |
| `profile.ts` | Print-header regex, email pick from `SecureCommunicationInfo`. |
| `healthSummary.ts`, `medications.ts`, `allergies.ts`, `healthIssues.ts`, `immunizations.ts`, `medicalHistory.ts`, `goals.ts`, `letters.ts`, `documents.ts`, `referrals.ts`, `upcomingOrders.ts`, `questionnaires.ts`, `careJourneys.ts`, `activityFeed.ts`, `educationMaterials.ts`, `ehiExport.ts`, `otherMyCharts.ts`, `emergencyContacts.ts`, `careTeam.ts`, `notes.ts` (list) | The field projection into the local `type`. |
| `vitals.ts` | Regrouping readings by row, page de-duplication, `readingValue`. Paging stays. |
| `preventiveCare.ts`, `insurance.ts`, `bills.ts` (summary cards) | HTML parsing. |
| `visits/visits.ts` | Per-organization page merge, `visitTimestamp`. Paging stays. |
| `labs/labResults.ts` | `dropUnusableAbnormalFlags`, nesting the report and trend bodies onto the order, imaging classification, narrative lifting, FDI extraction and `image_id` encoding. The SAML fetch stays in the scraper (it is a request). |
| `messages/messageThreads.ts` | Ascending merge of pages, `senderName`, `isPatientAuthor`, the `ThreadMessage` rename. Paging stays. |
| `bills/bills.ts` | The per-account join of visits, statements, payments. |

Everything that issues a request stays where it is. Everything that reads a
response and decides what to keep moves.

## 5. Relationship to the three PRs

- **#375** drops `abnormalFlagCategoryValue` inside the scraper. Under this
  proposal the drop lives in the labs processor and `raw` keeps the field.
  The research in that PR's comment is the evidence the processor cites.
- **#377** adds `summary` on the capability and `full_detail` on the MCPB
  tool, with a `shared/summaries.ts` visits projection. That projection is the
  visits `concise` column above. `full_detail: true` becomes `mode: 'raw'`.
- **#380** adds `condense.ts` in the MCPB with seven hand-written condensers
  and a generic prune, plus a `get_raw_data` tool. The seven condensers are the
  `concise` columns for visits, labs, imaging, billing, messages and
  recipients. Their `text()`/`rec()` readers carry over; `row()` and the
  generic `prune` do not, because both decide by value (a key is dropped when
  empty), which rule 6 forbids. `get_raw_data` is `mode: 'raw'` on the
  ordinary tool.

None of the three should merge as written; each should be re-cut against the
processor layer once it exists.

## 6. Decisions

Settled in review; recorded here so the processors do not reopen them.

1. **One parameter, four values.** `mode: raw | standard | concise | json`.
   `standard` and `concise` are markdown, `json` is JSON, `raw` is whatever
   MyChart sent. **Decided over the review objection**, which stands and is
   recorded here: rendering is presentation, and a `detail: raw | standard |
   concise` returning typed objects, with the markdown renderer in `shared/`
   called by the clients, would keep presentation out of the capability
   signature. The cost of the decision as taken: there is no concise-as-JSON,
   so a consumer that needs the concise projection as data reads `json` and
   re-applies the concise field list itself — the list rule 6 keeps in one
   place is then maintained a second time in that consumer. Accepted for now
   for simplicity; `processor.concise(standard)` is exported per capability so
   such a consumer can call it rather than copy the list.
2. **One generic markdown renderer** for both markdown modes. Objects render
   as a heading and a definition list, flat arrays of objects as tables, nested
   ones as sub-sections. No per-capability templates. (The reviewer's
   disagreement is only about *where* it runs — see 1 — not about generic
   over templates.)
3. **`medicationKey` stays open.** The medications processor surfaces `id` and
   nothing else as a handle until a capture of the real refill request shows
   what `request_refill` should post.
4. **Never invent a shape** (rule 10). What that means for the capabilities
   whose element shape has not been captured is in §7.
5. **Message bodies are plain text.** `bodyText` is the field the non-raw
   modes carry; `body` is in `raw` only, like every other markup-bearing field
   (rule 9).
6. **Rule 2 is a breaking change to the public API, and is shipped as one.**
   Keeping MyChart's spelling means `ThreadMessage.messageId` → `wmgId`,
   `sentDate` → `deliveryInstantISO`, notes' `hnoId` → `hnoID`, and every
   `get…()` in the npm package returns a `…Standard` object in place of the
   old projected types (`Medication` → `PrescriptionStandard`, `Flowsheet` →
   `FlowsheetStandard`, `MedicalHistoryResult` gone). That is a semver-major
   for `mychart-cli`; the package is bumped and the rename table is in its
   README. MCPB tool output changes shape the same way; the extension's
   default is `concise` markdown, so the JSON shape change only reaches a
   caller that asks for `json`.
7. **Landing order.** The review asked for an incremental path (visits first,
   identity processors elsewhere). The implementation landed as one PR
   instead, every capability migrated, because the identity-processor stage
   would have shipped two projections per capability for as long as it
   lasted. `mode` enters at `executeCapability`, so no client can diverge.

## 7. Capabilities whose shape is unverified

Rule 10 says a processor projects only captured field names. These are the
capabilities where the scraper today projects names that no capture has shown.
None of them is known to be broken against a real instance; what is known is
that nobody has seen them return data on one. The recommendation is the same for
all: **keep the scraper and the endpoint call, have the processor pass the
element through whole, and label the capability "shape unverified" until a
capture exists.** Removing a scraper would remove functionality that may well
work; removing the fixture's invented element fields would leave the fake
serving empty lists and take away the only test coverage those scrapers have,
so that should wait for a capture to replace them with.

| Capability | What the captures show | What the scraper projects today | Status |
| --- | --- | --- | --- |
| `get_goals` (patient goals) | `loadPatientGoals` skeleton has elements with `goalId`, `goalType`, `readings[]`, `complianceType`, `lastUpdatedDate`, `creationDate` | `name`, `description`, `status`, `startDate`, `targetDate` | **Projection is wrong against real data.** The captured element has none of the five names; against a real instance with patient goals the scraper returns five empty strings per goal. The only case in this table with evidence of breakage. |
| `get_goals` (care-team goals) | `careTeamGoals: []` on every capture | Same five names | Unverified. |
| `get_upcoming_orders` | `orderList`, `orderGroupList`, `providerList` all `{}` on every capture (scraper comment) | `orderName`, `orderType`, `status`, `orderedDate`, `orderedByProvider`, `facilityName` | Unverified. The envelope is captured; the element is not. |
| `get_allergies` | `dataList: []` on the captured account | `name`, `id`, `formattedDateNoted`, `type`, `reaction`, `severity`, with two nesting guesses | Unverified. |
| `get_documents` | No skeleton; endpoint never captured | `id`, `title`, `documentType`, `date`, `providerName`, `organizationName` | Unverified, envelope included. |
| `get_questionnaires` | No skeleton. `api-surface-gaps.md` saw the React-era `/api/questionnaire/GetQuestionnaireList` return data; the scraper calls the legacy `/Questionnaire/GetQuestionnaireList` | `id`, `name`, `status`, `dueDate`, `completedDate` | Unverified, and the endpoint may be the wrong one. |
| `get_care_journeys` | No skeleton | `id`, `name`, `description`, `status`, `providerName` | Unverified, envelope included. |
| `get_insurance` | HTML page; the captured account had no coverage on file and every `/api/insurance-hub/*` endpoint answered 500 | `.coverage-card` / `.plan-name` / `.member-id` selectors matching the fake's page | Unverified. `pageText` in the standard object is the audit trail. |
| `get_health_summary` (`conditionList`, `journeyList`, `actionPlans`) | `[]` on every capture | Not projected today | Passed through whole. |

By contrast, `get_activity_feed`, `get_education_materials`, `get_ehi_export`
and `get_emergency_contacts` were in this state once, were captured, and were
fixed (the scraper comments record the invented key each one used to read).
`realBehavior.integration.test.ts` now pins their real envelopes. The path for
the rows above is the same: capture, replace the fixture's guesses with the
real element, narrow the processor.
