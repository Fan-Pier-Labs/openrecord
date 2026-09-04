# `prelogin` — what an instance tells anyone, with no account

Everything a MyChart deployment publishes to an anonymous visitor: the health system's
support lines, its bookable provider and clinic directory, when those providers are free,
the screening questionnaire in front of booking, and its billing entities.

| | |
| --- | --- |
| **Client surface** | `get_hospital_info` (MCPB tool, account-free) · `--host <h> --action hospital-info` (CLI) · library exports. **Not in the capability registry** — see [Known gaps](#known-gaps) |
| **Source** | [`networkProfile.ts`](networkProfile.ts) · [`orgProfile.ts`](orgProfile.ts) · [`providerDirectory.ts`](providerDirectory.ts) · [`schedulingContext.ts`](schedulingContext.ts) · [`openSlots.ts`](openSlots.ts) · [`schedulingQuestionnaire.ts`](schedulingQuestionnaire.ts) · [`guestEstimates.ts`](guestEstimates.ts) · [`preloginSession.ts`](preloginSession.ts) · [`types.ts`](types.ts) |

**Nothing here sends a credential.** Every request is one an anonymous browser makes by
opening the portal. `fetchHospitalNetworkProfile(hostname)` is the one-call entry; the
scheduling reads are library exports only. The CLI runs `hospital-info` **before credential
resolution**, so no password store is ever opened for it.

## Endpoints

| Request | Body | Purpose |
| --- | --- | --- |
| `GET /Authentication/Login` | — | the login shell: org name, brand, support lines, and a session cookie + antiforgery token |
| `GET /<mount>/OpenScheduling` | — | the anonymous scheduling session and its token |
| `POST /Scheduling/Anonymous/GetSchedulingWorkflowData` | `schedulingParameters.workflow=NewProvider&isFirstLoad=true` | specialties, `WorkflowSettings`, org name |
| `POST /Scheduling/Anonymous/GetSpecialtyData` | `SpecialtyId=<id>` | providers, departments, locations, provider-department pairs, reasons for visit, visit types |
| `POST /Scheduling/Anonymous/GetSlots` | workflow + appointment-builder + `startDte` + `continueInfo` | open appointment slots |
| `POST /DecisionTrees/AnonymousDecisionTree/NextStep` | `traversalInfo` + `prevInputNode` + `question` | one step of the screening questionnaire |
| `GET /<mount>/GuestEstimates` → `GuestEstimates/SelectServiceArea` | — | billing entities, inlined as `$$WP.Estimates.OtherSAs` |
| `GET /GuestEstimates/SelectLocation?svcArea=…&isMultiSA=true` | — | that entity's facilities, inlined as `var model = {Locations:[…]}` |

Everything POSTed here is **form-encoded** (Epic's `$$WPUtil.postify`) and carries the
antiforgery token of the page that hosts it, on that page's session cookie. So "call an
anonymous endpoint" is always "open its page first" — which is what
[`preloginSession.ts`](preloginSession.ts) does once per page.

These are raw `makeRequest` calls on purpose: `makeAuthenticatedRequest` exists to notice an
expired login and re-login, there is no login here to expire, and its login-page detector
would misread every one of these pages — they *are* the login shell with a different
activity in the middle.

## The whole scheduling API is mirrored for anonymous callers

Epic's client builds every scheduling URL through one helper:

```js
$$WPSchedulingUtil.GetEndpointUrl = function (action, workflow) {
  return IsWorkflowTreatedAsAnonymous(workflow) ? "Scheduling/Anonymous/" + action : "Scheduling/" + action
}
```

`Scheduling/Anonymous/` is therefore not a handful of endpoints — it is the logged-in
scheduling API, action for action (`GetSlots`, `ReserveAppointment`, `ReviewAppointment`,
`DeleteReservationFromSlot`, `CreateSecureSession`). **This package implements the read half
only.**

**It never reserves, reviews or books.** `ReserveAppointment` places a real hold on a real
clinic's calendar and `ReviewAppointment` / `ScheduleAppointment` create a real appointment
for a real person — side effects on a live health system, not scraping. Both also gate on a
CAPTCHA and on identity the org is entitled to verify. Availability is public; booking is
not ours to automate unattended. Nor does anything here expose a provider's *booked*
appointments: MyChart never sends those to an anonymous caller, and they would be patient
data if it did.

## Same schema everywhere

Verified on five real instances — root-mounted and prefixed, spanning both
scheduling-bundle generations. **Identical routes, request encodings and response keys on
all five.** The only drift is two additive keys on the newer build:
`Providers[].SpecialtySearchTerms` and `WorkflowSettings.UseLegacyQuestionnaires`. Read
everything as optional; **never branch on version**.

## What exists, and where

- **Support phone lines, org name, portal brand** — the `$$WP.Strings.addMnemonic("@MYCHART@…@", …)`
  block every pre-login page carries (`HELPDESKPHONE`, `SCHEDULINGPHONE`, `BILLINGPHONE`,
  `HELPEMAIL`, `ORGNAME`, `APPTITLE`, `ABSOLUTEURL`).
- **The bookable provider directory and clinic addresses** — the anonymous open-scheduling
  workflow. One specialty is **0.6–2 MB**, and large systems list 190–856 providers per
  specialty across twenty-plus specialties, so `specialties` narrows the crawl and
  `maxSpecialties` caps it; the per-host permit paces what is left.
- **Billing entities with customer-service lines, and their facilities** — the guest
  price-estimate pages, inlined in script blocks.
- **Portal feature flags** — self-signup, guest scheduling, On My Way, on-demand video.

### What is *not* published anywhere

Checked on all five instances, and worth not re-exploring:

- **a fax number** — nowhere on the login, FAQ, terms or privacy pages, nor in any captured
  post-login shape;
- **an org-level mailing address** — only clinic street addresses exist;
- **accepted insurance** — the payer picker is the last step of the guest-estimate flow,
  behind a price-transparency disclaimer whose accept step runs an invisible reCAPTCHA. The
  profile reports `insurance.status: 'gated'` and says why. The post-login route to the same
  list is [`../chart/insurancePayers/`](../chart/insurancePayers/).

The mychart.org directory ([`../../list-all-mycharts/`](../../list-all-mycharts/)) also
carries `phone`, `email` and `faq` per organization.

## Notes and research

- **Epic ships placeholder contact details.** An org that never set a line leaves
  `(555) 555-5555` / `tel:5555555555` in place, and the support email defaults to
  `MyChartSupport@DoNotUse.DoNotUse`. Both are reported as `null`, never as a number to
  call.
- **Mnemonic values are HTML** — usually a `tel:` anchor, sometimes a bare span for a vanity
  number ("800-4Sprng") with no `tel:` link at all — and the text ones are wrapped in
  `HTMLUnencode(...)`, so the JS string literal still holds entities. A regex finds the
  machine-generated `addMnemonic` lines; **cheerio decodes the values**. Hand-rolled entity
  decoding gets `&amp;lt;`, every named entity outside the big six, and out-of-range numeric
  references wrong ([#399](https://github.com/Fan-Pier-Labs/openrecord/pull/399)).
- **The directory is the bookable list, not the medical staff**, once per specialty a
  provider is bookable under (they de-duplicate on the opaque WP-encoded provider id), and
  it carries **no NPI** — for that, see [`../../npi/`](../../npi/).

### Three refusal surfaces on the slot search

Each was isolated by replaying one captured body against a live instance with a single
variable changed ([#411](https://github.com/Fan-Pier-Labs/openrecord/pull/411)):

| Cause | How it fails | Hosts affected |
| --- | --- | --- |
| jQuery `outer[inner]` form encoding instead of Epic's `outer.inner` | 500 / 302 | everywhere strict |
| A provider-department pair the reason for visit does not cover | 302 | 59 of 577 |
| An unanswered screening questionnaire | `ErrorCode: "LqfAnswersRequired"` | 205 of 577 |

**The encoding one is the trap.** `GetSchedulingWorkflowData` and `GetSpecialtyData` bind
*either* convention, so it is invisible on the first instance anyone tries — identical body,
dots 200 and brackets 500, nothing else changed.

Across all 577 scheduling-enabled hosts, fixing these took `GetSlots` acceptance from
**517 → 571 (99.0%)** and hosts returning slots from **164 → 227**, with refusals 59 → 2.

### The questionnaire gate

When an org attaches a decision tree to a visit type, `GetSlots` refuses until the tree has
been walked and its answer id included. It lives on a **different route family**
(`DecisionTrees/AnonymousDecisionTree/` rather than `Scheduling/Anonymous/`) and is walked
one question at a time. The tree id is not a separate lookup — it is
`AnonymousSchedulingDecisionTreeId` on the visit type, already in `GetSpecialtyData` — and
when the walk finishes `TraversalInfo.TreeAnswerID` is what `GetSlots` wants as
`PatientAnswerIds`, alongside the tree id as `LqfIds`.

Two facts only a capture gives you: **`traversalInfo.AdditionalContext` is mandatory**, and
the response echoes **`RestartTree: true`** — return it unchanged and the walk re-serves
question one forever.

**Nothing here answers a question for you.** These are clinical screening questions; the
opening one on the reference instance asks whether you are having a life-threatening
emergency. Guessing the answer that keeps the funnel moving would put words in a patient's
mouth and could route a real emergency into a routine appointment. The questions are
surfaced; the caller supplies the answers.

### Paging

The slot search is **incremental, not offset-based**. Each response returns a
`ContinueInfo` cursor — a date range plus a `NextProviderIndex` like `"16^1"` — that must be
echoed back verbatim. The server decides how far to walk per call and sets `IsStopSearch`
when it is done. `ErrorCode` carries back-pressure: an instance throttles a caller that
pages too hard and says so rather than returning junk.

### Known gaps

- **Multi-response and free-text questionnaire answers** are surfaced to callers
  (`multiResponse` / `freeText`) but **refuse to submit** with `WorkInProgressError` — the
  shapes have never been driven against a live instance. 3 and 6 of 198 sampled instances
  open with one.
- The questionnaire walk is proven on **one** organization, whose tree is three plain
  yes/no questions. A 19-choice or deeply branching tree is untested.
- **No client surface**: library export only — no MCPB tool, CLI action or app screen, and
  not in the capability registry (refitting the prelogin scrapers to `fetch…Raw` +
  processor is its own piece of work).
- 2 of 577 hosts still refuse, cause undiagnosed.
- Post-login scheduling is untested — likely the same shapes through the same helper, but
  there is no real account to check against.

## The two error surfaces

A rejected call — wrong payload, missing token, a feature the org switched off — **never**
comes back as a JSON error. The November 2025 release answers 302 → `/Home/FiveHundred` →
`/Home/Error?code=14` → a 200 HTML error page; August 2025 answers a bare 500 HTML page.
`postForm` refuses to follow the redirect and treats anything that is not a 200 JSON body as
the same failure, so a caller sees one `PreloginEndpointError` on either release instead of
`SyntaxError: Unexpected token '<'`.
