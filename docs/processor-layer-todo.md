# Processor layer: open action items

Companion to [`processor-layer-proposal.md`](processor-layer-proposal.md). Everything here is
work the proposal could not settle from the code and the captures alone. Tick items off in the
PR that closes them; delete the section when it is empty.

## 1. Shapes to capture against a real instance

Rule 10 of the proposal: a processor projects only field names a captured real response has
shown. Each of these is passed through whole until captured, then narrowed. Capture means a
`realShapes.ts` skeleton from a live account that has data in the category, and a fake-mychart
fixture rebuilt from it.

| Capability | Endpoint | What is missing | Notes |
| --- | --- | --- | --- |
| `get_goals` | `POST /api/goals/LoadPatientGoals` | A *populated* element. Four instances answered with only the empty editable slot, which the processor now drops | `text` is the display field (`epic.px.client.goals`); the fake models the rest on the same bundle |
| `get_goals` | `POST /api/goals/LoadCareTeamGoals` | Element shape (`careTeamGoals: []` on all four captures, with `FullLoad: true` too) | Field names from the bundle: `title`, `goalId`, `goalType`, `complianceType`, `readings[]`, `createdByUser`, `creationDate` |
| `get_upcoming_orders` | `POST /api/upcoming-orders/GetUpcomingOrders` | Element shape of `orderList{}` values, and of `orderGroupList{}` / `providerList{}` (all `{}` on every capture) | |
| `get_allergies` | `POST /api/allergies/LoadAllergies` | `dataList[]` element (`[]` on the captured account). The scraper hedges between `allergyItem.*` and flat fields | |
| `get_documents` | `POST /api/documents/viewer/LoadOtherDocuments` | The whole response; never captured | |
| `get_questionnaires` | `POST /Questionnaire/GetQuestionnaireList` | The whole response; never captured. `api-surface-gaps.md` saw the React-era `POST /api/questionnaire/GetQuestionnaireList` return 3.9 KB of real data; decide which endpoint to call | |
| `get_care_journeys` | `POST /api/care-journeys/GetCareJourneys` | The whole response; never captured | |
| `get_health_summary` | `FetchHealthSummary` | `conditionList[]`, `journeyList[]`, `actionPlans[]` elements (`[]` on every capture) | |
| `get_medications` | `LoadMedicationsPage` | `prescriptionList.pickups[]`, `.deliveries[]`, `.inProgressWorkRequests[]`, `owningPharmacy.hours[]`, `lastDispense.delivery.shipmentTrackingInfo[]` elements | Mail-order accounts only |
| `get_health_issues` | `LoadHealthIssuesData` | `externalItems[]`, `externalOrgs[]` elements | Needs a Care Everywhere-linked account |
| `get_messages` / `get_message_thread` | conversation endpoints | `messages[].tasks[]`, `.suggestedActions[]` elements; whether `body` ever carries HTML | Decision recorded: plain text. Worth one confirming capture. |
| `get_visit_notes` | `GetVisitNotes` | `noteList[].attachments[]` element | |
| `get_lab_results` | `GetDetails` | `studyResult.transcriptions[]`, `.ecgDiagnosis[]`, `indicators[]`, `variants[]`, `providerComments[]` elements | ECG and genetic results |
| `get_lab_results` | `GetDetails` | A component `value` with `isValueRtf: true` — what MyChart's RTF actually looks like | `valueText` passes such a value through untouched until one is captured (the hand-written RTF stripper was removed in review; no library does this on device) |
| `get_letters` | `GetLettersList` | `departments{}` value shape (`{}` on capture) | |
| `get_billing` | `GetVisits` | `UndistributedPayments[]` element; `EstimateInfo`, `VisitAutoPay`, `AgencyInformation` populated | |
| `list_proxy_targets` | `/ProxySwitch`, `/Home` | Which discovery surface each captured instance uses | Three surfaces exist; only the JSON one has a skeleton |

## 1a. Capabilities we declare and deliberately do not implement

`Capability.notImplemented` in `shared/capabilities/types.ts` is one sentence saying why a
capability ships no scraper. `capabilityDescription()` appends it to the description every
client shows, and `executeCapability` returns `unimplementedMessage()` instead of calling
anything. `UnimplementedCapabilityImpl` has `run?: never`, so attaching a scraper to one is a
compile error rather than a review note.

This replaces the obvious-looking alternative — ship the scraper and warn about it in prose —
which is worse in both directions. An unverified *read* answers `[]`, which nobody reads as
"this has never seen a real instance"; they read it as "your chart has none". An unverified
*write* answers HTTP 200 from an endpoint that ignored it, and the patient believes their
refill is on the way. A caveat in a tool description does not stop a caller acting on the
payload it was handed, so the fix is to hand it no payload.

What we know about the endpoint goes in a README beside the capability's other code
(`scrapers/myChart/chart/medications/REFILL.md`), where whoever implements it will look — not
in a scraper that runs. Not an unwired `.ts` file: the coverage gate is per-file, so an
untested module fails the build.

Currently: `request_refill`. Clearing it means capturing the request the shipped client sends,
rebuilding the fake's handler around it, and watching one real refill land.

This is for capabilities with no trustworthy implementation at all. It is **not** for a
capability whose envelope is confirmed and whose element shape is merely uncaptured —
`get_allergies`, `get_documents`, `get_care_journeys`, `get_upcoming_orders` all pass elements
through whole and answer empty honestly. Those belong in the table above.

## 2. Requests to verify

- **`request_refill` body.** The scraper posts `{ medicationKey }` to `/api/medications/RequestRefill`. `medicationKey` exists only in the fake's fixture; the captured medications skeleton has `id`. Capture the web UI's refill request (`epic.px.client.medications.js` on any instance) and fix both the scraper and the fixture. The medications processor exposes `id`, and the capability itself is now declared-not-implemented (§1a) rather than shipping a request nobody has watched land.
- **`get_questionnaires` endpoint.** Legacy `/Questionnaire/GetQuestionnaireList` vs React `/api/questionnaire/GetQuestionnaireList` (see above). Checked on four live instances after the migration: three serve the legacy page and return an empty list; one answers the `/Questionnaire` page itself with HTTP 500, so the capability now fails there with `MissingVerificationTokenError` (it used to read as "no questionnaires"). The React endpoint is the one to move to.
- **`IsPastVisit`.** Documented false on rows `LoadPast` returned (#377, #380). Confirm on the August 2025 release too, so the drop is release-independent.
- **`results[].isAbnormal`.** `false` on all 39 captured results including out-of-range ones (#375). One more instance would settle whether any release sets it.

## 3. fake-mychart follow-ups

- Replace the invented element fields (upcoming orders, allergies, documents, questionnaires, care journeys) with captured ones as each capture lands. Do not delete them before then: the fake would serve empty lists and the scrapers would lose their only test coverage. Insurance is done (`insuranceGetCoverages`); goals are modelled on Epic's own client bundle rather than on a capture, which is better than invented but is still not rule 10.
- Make `conformToShape` fail loudly, or at least log, when a fixture carries a key the skeleton does not, so an invented field cannot ship silently again (`fake-mychart/README.md` calls this out as the trap).

## 4. Open PRs to re-cut against the layer

- **#375** (abnormal flag): the drop moves into the labs processor; the scraper keeps the field in `raw`. The capture in its comment is the evidence the processor cites.
- **#377** (`summary` / `full_detail`): the visits projection is the visits `concise` column; `full_detail: true` becomes `mode: 'raw'`.
- **#380** (`condense.ts`, `get_raw_data`): the seven condensers are the concise processors for their capabilities; `row()` and `prune()` do not carry over (rule 6); `get_raw_data` becomes `mode: 'raw'` on the ordinary tool.

## 5. Client wiring

Done in the implementation PR: the MCPB and the Expo agent default to `concise` and expose
`mode` on every read tool; the CLI takes `--mode` (default `json`); the library's typed methods
return the standard object and `runCapability(id, { mode })` picks any mode; `docs/cli.md`,
`claude-desktop-extension/README.md` and `npm-package/README.md` describe it. Remaining:

- `docs/processor-layer-examples.md` is generated and CI fails when it is stale (the fake-mychart
  job regenerates it and diffs). Regenerate with `bun dev-scripts/generate-processor-examples.ts`
  in any PR that changes a processor or a fixture — against the **compose service**, not a
  `bun run start` in the worktree; the generator's header says why.

## 7. Follow-ups from the #388 review

- **Field-list conformance test.** Every processor reads its input through `rec()`/`text()` by
  string key — roughly 600 reads with no compile-time check. A typo returns `null` forever and
  passes 100% coverage. One test that every key of each `…Standard` interface (minus the derived
  ones) exists on the matching `realShapes.ts` skeleton is rule 10 enforced mechanically. First.
- **Typed raw.** `RawResponse` is a flat request log, so the labs processor re-joins details,
  trend and report by reading `orderKey` / `orderID` / `reportID` out of `requestBody`. The
  scraper knew the join at fetch time; a typed raw (`{ list, orders: Record<key, { details,
  history, report? }> }`) lets the processor map over it. The flat log becomes a CLI `--trace`.
- **Typed reads.** `text()`/`rec()` over `unknown` should become typed reads once processors are
  typed against the skeletons.

## 6. Endpoints worth exploring next (from `api-surface-gaps.md`)

Not processor work, but the same capture-first discipline applies. `api-surface-gaps.md` ranks the
whole surface by conviction; its top of the list:

- Third-party and portal access logs (`/api/access-logs/*`): which apps read which categories of the
  record. Nothing we ship answers it.
- Implants (`/api/implants/GetImplants`) and the To Do list (`/api/todo/GetTasks`): single `POST {}`
  reads with no overlap against a shipped capability.
- `/api/personalInformation/GetContextIds`: worth one probe — it may give a server-side answer to
  "which patient record is active", which `assertProxyReadContext` can only hedge about today.
- A second sweep over `/areas/**` legacy scripts, where Care Team's endpoint was found. Better hit
  rate than anything left in the marginal tier.

Pedigree, trends dashboard, preferred pharmacies and PCP were demoted: each largely re-states data
`get_medical_history`, `get_vitals`/`get_lab_results`, `get_medications` and `get_care_team` already
return. See the overlap table in `api-surface-gaps.md`.
