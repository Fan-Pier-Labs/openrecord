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
| `get_goals` | `POST /api/goals/LoadPatientGoals` | The scraper reads `name`, `description`, `status`, `startDate`, `targetDate`; the captured element has `goalId`, `goalType`, `readings[]`, `complianceType`, `lastUpdatedDate`, `creationDate`, `isSharingNotesEnabled` | **The scraper is wrong against real data.** Needs a capture with the goal's display fields, then a rewrite. |
| `get_goals` | `POST /api/goals/LoadCareTeamGoals` | Element shape (`careTeamGoals: []` on every capture) | |
| `get_upcoming_orders` | `POST /api/upcoming-orders/GetUpcomingOrders` | Element shape of `orderList{}` values, and of `orderGroupList{}` / `providerList{}` (all `{}` on every capture) | |
| `get_allergies` | `POST /api/allergies/LoadAllergies` | `dataList[]` element (`[]` on the captured account). The scraper hedges between `allergyItem.*` and flat fields | |
| `get_documents` | `POST /api/documents/viewer/LoadOtherDocuments` | The whole response; never captured | |
| `get_questionnaires` | `POST /Questionnaire/GetQuestionnaireList` | The whole response; never captured. `api-surface-gaps.md` saw the React-era `POST /api/questionnaire/GetQuestionnaireList` return 3.9 KB of real data; decide which endpoint to call | |
| `get_care_journeys` | `POST /api/care-journeys/GetCareJourneys` | The whole response; never captured | |
| `get_insurance` | `GET /Insurance` | The page markup on an account with coverage. The scraper's selectors (`.coverage-card`, `.plan-name`, `.member-id`) match only the fake | Every `/api/insurance-hub/*` endpoint answered 500 on the probed account (`api-surface-gaps.md` §2d) |
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

- Replace the invented element fields (goals, upcoming orders, allergies, documents, questionnaires, care journeys, insurance page) with captured ones as each capture lands. Do not delete them before then: the fake would serve empty lists and the scrapers would lose their only test coverage.
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

## 6. Endpoints worth exploring next (from `api-surface-gaps.md`)

Not processor work, but the same capture-first discipline applies.

- Third-party access log (`/api/access-logs/*`): which apps read which categories of the record.
- Implants, pedigree, trends dashboard, preferred pharmacies, PCP, To Do: single `POST {}` reads that returned data on the probed account.
- `GetDetailsByCSN` and the record-download visit list: richer encounter data than `LoadPast`.
- `/api/visits/*`: the React-era visits surface, as a possible replacement for the legacy `VisitsList` scrape.
- A second sweep over `/areas/**` legacy scripts, where Care Team's endpoint was found.
