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
| `get_questionnaires` | `POST /Questionnaire/GetQuestionnaireList` | The whole response; never captured. `scrapers/myChart/api-surface-gaps.md` saw the React-era `POST /api/questionnaire/GetQuestionnaireList` return 3.9 KB of real data; decide which endpoint to call | |
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

## 2. Requests to verify

- **`request_refill` body.** The scraper posts `{ medicationKey }` to `/api/medications/RequestRefill`. `medicationKey` exists only in the fake's fixture; the captured medications skeleton has `id`. Capture the web UI's refill request (`epic.px.client.medications.js` on any instance) and fix both the scraper and the fixture. Until then the medications processor exposes `id` and the refill capability is documented as unverified.
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
  against fake-mychart in any PR that changes a processor or a fixture.

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

## 8. Requests that tolerate failure — probably none of them should

`RawCollector.send` throws on a failed answer (#406). Eight call sites opt out with
`tolerateFailure`, each because it was already best-effort before the throw existed, and each
processor now reports the gap under a name. The suspicion is that most of that tolerance is
covering for requests we should not be making, or should be treating as the payload. Go through
them and cut what the captures do not justify.

- **Labs `GetList` group types 1, 2 and 3 (`labResults.ts`).** The 0–3 loop dates from the
  initial commit, before any live capture, and appears to have been fishing for an imaging-only
  or procedures-only list — the fake's `GetList` handler notes the old fake "invented" one. Nothing
  in the repo, the docs, or MyChart's own page script gives 2 or 3 a meaning. Three live captures
  across both Epic releases accept only 0 and 1, both returning the same combined list of labs,
  imaging and procedures (which is why orders are de-duplicated by key), and answer 2 and 3 with a
  500 (`realBehavior.integration.test.ts`). So every lab read pays two guaranteed 500s plus a
  redundant fourth list, and the tolerance, the accepted-versus-speculative split, and the two
  `failure` records in the raw envelope exist only to keep those expected failures from throwing.
  Proposed: one `GetList` with group type 0, treated as the payload. Keeping 1 buys insurance
  against an instance that rejects 0 but serves 1, which the unit test at `labResults.unit.test.ts`
  ("still tolerates a group type this instance does not serve") models and no capture has shown.
- **Labs trend body (`GetMultipleHistoricalResultComponents`).** Tolerated per order; a failure
  loses that order's sparkline. Decide whether a 500 here should name the order in a gap field or
  fail the read — today it is silent in `standard` (`historicalResults: {}`).
- **Goals, both endpoints (#409).** Justified by one captured instance that 500s `LoadPatientGoals`
  on every request while care-team goals load. Keep, but re-check that instance once more: if it
  was a transient, both calls become the payload.
- **Billing extras (`GetStatementList`, `LoadPaymentList`, the details page).** Tolerated so a
  statement outage does not cost the visit history. No capture has shown any of the three failing
  on a healthy instance; if none does, they are payload too. The details page is fetched only for
  `EncID`, which no processor reads — probably drop the request outright.
- **Profile `GetContactInformation`.** "Missing on some instances" is the stated reason; find
  which instance, and whether it is missing (404 / FourOhFour dance) or failing. A missing
  endpoint can be detected once and skipped rather than tolerated on every read.
- **Care team `LoadExternal`.** Care Everywhere is optional per deployment, so this one is
  probably legitimate — but confirm what a deployment without it actually answers (404 dance vs
  500 vs an empty `ProvidersList`) on a live instance; if it is an empty list, the tolerance is
  unnecessary.
- **Imaging `FdiData` handshake.** Tolerated so an order without a working viewer still lists.
  Check whether a failure here is ever anything but "this order has no images", in which case the
  scraper should decide that from the order metadata before making the request.

## 6. Endpoints worth exploring next (from `scrapers/myChart/api-surface-gaps.md`)

Not processor work, but the same capture-first discipline applies. `scrapers/myChart/api-surface-gaps.md` ranks the
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
return. See the overlap table in `scrapers/myChart/api-surface-gaps.md`.
