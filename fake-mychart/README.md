# Fake MyChart

A standalone Next.js server that faithfully mimics Epic MyChart's web API surface. Pre-loaded with Homer Simpson fake data across 30+ medical data categories. All state lives in RAM — no database, no external dependencies.

## Why This Exists

1. **International engineers can't get real MyChart accounts** — signing up requires a US SSN and an active patient relationship with a hospital. This blocks engineers in India, Europe, etc. from developing or testing scrapers.
2. **CI needs a real HTTP target** — unit tests use in-process mocks, but integration tests need an actual server to exercise the full login flow, cookie handling, redirects, and HTML parsing.
3. **Fast iteration** — no rate limits, no 2FA emails to wait for, no session expiry surprises. The fake server responds instantly and accepts a fixed 2FA code.

## Credentials

| User    | Username | Password    | 2FA Required by Default |
|---------|----------|-------------|-------------------------|
| Homer   | `homer`  | `donuts123` | No                      |
| Marge   | `marge`  | `donuts123` | Yes (TOTP enabled)      |

The **login-time** 2FA accepts the fixed code `123456`, or a live TOTP code
for the account's stored secret (marge seeds `JBSWY3DPEHPK3PXP`) — real
MyChart validates real codes, and this is what lets a client's silent
re-login (stored TOTP secret → generated code) be tested end to end. The
fixed code is unrelated to TOTP *setup*, below, which mints a fresh secret
per enrollment and verifies against that.

- `homer` logs in directly.
- `marge` exists for testing the 2FA path — her login always returns the secondary-validation page until you submit the code.
- Toggling TOTP via the settings UI (or the `UpdateTwoFactorTotpOptInStatus` endpoint) only affects the per-user UI flag (`IsTotpEnabled` returned by `GetTwoFactorInfo`). It does NOT change whether login requires 2FA — that's a fixed per-user behavior (off for homer, on for marge). The CLI's `--set-up-totp` / `--disable-totp` flow can therefore keep using username+password without ever needing a 2FA code. Use `POST /reset` to restore both users to their seed state.

### TOTP setup is cryptographically real

The authenticator-app setup flow is not stubbed:

- `POST /api/secondary-validation/TotpQrCode` mints a **fresh 160-bit Base32 secret per call** and holds it pending on the user (real MyChart does the same — an abandoned setup leaves the account untouched).
- `POST /api/secondary-validation/VerifyCode` validates the submitted code against that pending secret — or, during opt-out, against the account's committed secret — using RFC 6238 (`src/lib/totp.ts`: HMAC-SHA1, 6 digits, 30-second step, ±1 step of slack). A wrong code gets a 400.
- `POST /api/secondary-validation/UpdateTwoFactorTotpOptInStatus` commits the pending secret on opt-in and clears it on opt-out.

`FAKE_MYCHART_ACCEPT_ANY` **does not** bypass code validation. That knob loosens credential lookup; the code check is the one genuinely computational step in the setup flow, and waving it through would mean a client that fabricated six digits passed CI.

`marge` is seeded with the standard test secret `JBSWY3DPEHPK3PXP`, since she starts with TOTP already enabled.

Set `FAKE_MYCHART_ACCEPT_ANY=true` to accept any username/password (treated as homer).
Set `FAKE_MYCHART_REQUIRE_2FA=true` to force every login (including homer's) through the 2FA flow.

## Proxy (Multi-Patient) Records

`homer` has proxy access to his three kids, so the "one login, several charts"
shape is exercisable:

| Record        | `IsSelf` | Profile name             | DOB        | MRN |
|---------------|----------|--------------------------|------------|-----|
| Homer (self)  | `true`   | Homer Jay Simpson        | 05/12/1956 | 742 |
| Bart          | `false`  | Bartholomew JoJo Simpson | 04/01/2014 | 744 |
| Lisa          | `false`  | Lisa Marie Simpson       | 05/09/2016 | 745 |
| Maggie        | `false`  | Margaret Evelyn Simpson  | 01/12/2024 | 746 |

`marge` has no proxy access at all, covering the single-record account. Note
that her `/ProxySwitch` still returns a **one-entry list containing herself** —
captured from two live single-record accounts. An empty list is not a shape that
has ever been observed.

### The account holder is NOT the record with a blank id

**Every record, self included, carries a long opaque `WP-…` id** — 84-90
characters, different on every organization, meaningless outside the session
that produced it. The account holder's record is identified by `IsSelf: true`
and nothing else.

This is worth stating loudly because this fake previously modelled self as the
empty string. That shape came from a hand-written mock in the original PR, was
never observed anywhere, and does not exist on any instance measured: UCSF
(`/ucsfmychart`), Renown (`/mychart`) and Carson Tahoe (`/patientportal`) all
give the account holder a real `WP-…` id. Anything that needs "the account
holder" must key off `IsSelf`; never parse, construct or compare an id to find
it.

Two more details reproduced from the live captures:

- The self entry's `LinkUrl` is a **bare `inside.asp` with no query string** —
  not `?mode=self`. Following it is what returns you to the account holder.
- `LinkUrl` is relative and un-prefixed on UCSF and Carson Tahoe; Renown serves
  a prefix-absolute `/mychart/inside.asp`. The fake emits the relative form —
  the majority shape, and the harder one for a scraper to resolve.

The proxy list shows a short name ("Bart Simpson") while the profile page
carries the legal name ("Bartholomew JoJo Simpson"). Real portals do this, and
any code verifying a switch has to tolerate it.

### Per-record chart data

Switching context changes what **every** endpoint returns, not just the profile.
Each child has their own medications, allergies, health issues, immunizations,
care team and insurance. A category a child has no data for comes back
structurally empty — same envelope, empty lists — and **never** falls back to
the account holder's data. A parent's prescriptions appearing inside a child's
chart is the worst failure this codebase could ship, so the fallback direction
is always "empty", never "inherit".

Account-level data (TOTP config, passkeys) is deliberately *not* scoped to the
active record — it belongs to the login, not to a patient.

### Endpoints

- `GET /ProxySwitch` → `ProxySubjectList` plus `ShowFriendsAndFamily`, `ShouldTryAgain`, `ShowPersonalInformation`, `ShowAccountSettings`, `AvailableLanguageList`, `CurrentlySelectedTabColor`. Each subject carries `Id`, `Ids`, `DisplayName`, `DisplayText`, `PhotoUrl`, `PhotoMagicId`, `BlobToken`, `TabColor`, `LinkUrl`, `IsSelected`, `IsSelf`, `Loading`, `Disabled`, `ServiceAreaAbbreviationList`. **This shape is captured from two live instances, not inferred** — note `Ids` is an empty array, `DisplayText`/`PhotoMagicId` are `null`, `TabColor` is a number, `ServiceAreaAbbreviationList` is a string, and there is no `IdEmpty`/`IdPrefix`. No scraper reads any of them.
- `GET /inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=<id>` → 302 to `/Home`, switching the session's active record. An `eid` the account can't reach returns 403.
- `GET /inside.asp?mode=self` → 302 to `/Home`, back to the account holder.
- `GET /inside.asp` (bare, as served in the self `LinkUrl`) → when a proxy record is active, 302 to `?mode=self` and so back to the account holder; otherwise an ordinary page.

`/Home` renders whichever record is active, so the profile scraper reads the
proxy patient's details after a switch.

### Discovery modes

Real instances don't all expose the same surface, so the shape is switchable via
`POST /mode` (see below):

| `proxyDiscovery` | `GET /ProxySwitch` | `/Home` markup                            |
|------------------|--------------------|-------------------------------------------|
| `json` (default) | JSON list          | `.proxySubjectLink` anchors               |
| `html`           | 404                | `.proxySubjectLink` anchors               |
| `script`         | 404                | only `proxySubjects.push(...)` script blocks |

`script` mode is the awkward one: the payload lists the records but never says
which is active, so anything confirming a switch there has to fall back to the
profile page.

> **Only the `json` surface is verified.** The anchor markup and the
> personalization script blocks — their class names, `data-id` attributes,
> aria-labels and payload shape — are inferred, not captured. Agreement between
> the fake and the scraper on those two paths is self-consistency, not evidence
> about real MyChart. Replace them the moment a real Home page is captured.

## Deployment Shape and Discovery Modes

`POST /mode` flips the server between real MyChart shapes without a restart.
Independent knobs; every field is optional and omitted ones are left alone, so a
caller that cares about one doesn't silently reset the others.

```bash
curl -X POST http://localhost:4000/mode -H 'Content-Type: application/json' -d '{"mode":"root"}'
curl -X POST http://localhost:4000/mode -H 'Content-Type: application/json' -d '{"discovery":"meta-refresh"}'
curl -X POST http://localhost:4000/mode -H 'Content-Type: application/json' -d '{"discovery":"moved-host","movedHost":"127.0.0.1:4000"}'
curl -X POST http://localhost:4000/mode -H 'Content-Type: application/json' -d '{"proxyDiscovery":"script"}'
curl -X POST http://localhost:4000/mode -H 'Content-Type: application/json' -d '{"requireTerms":true}'
curl http://localhost:4000/mode   # {"mode":"prefixed","discovery":"redirect","movedHost":null,"proxyDiscovery":"json","requireTerms":false}
```

- `mode` — **where MyChart is mounted.** `prefixed` (default, under `/MyChart`) or `root` (served from the domain root, the Cleveland Clinic shape). Requires re-login: the session discovered its path prefix at login time.
- `discovery` — **how `/` announces the mount.** Requires re-login for the same reason. Every value is a shape observed on a live instance:
  - `redirect` (default) — a 302 with a `Location` header.
  - `meta-refresh` — a 200 carrying an *absolute* `<meta http-equiv="refresh">`. The Renown shape; the absolute form is what breaks naive parsing.
  - `default-asp` — the multi-hop bounce almost every instance uses: `/` → `/MyChart/` → a bare relative `DefaultAsp` → `/MyChart/Authentication/Login?`. Only the last hop names the route, so reading one hop yields the nonsense prefix `DefaultAsp`. Root-mounted instances hop straight from `/` to `DefaultAsp` (adams.mychartcc.com).
  - `script` — a 200 whose body assigns `window.location`, with no refresh tag and no `Location` header (mydovetale.ca).
  - `landing-page` — a 200 affiliate chooser that redirects nowhere; the mount is only discoverable from the page's links, and a sister organization's portal on another host is linked alongside it (mychart.chihealth.com).
  - `moved-host` — the deployment now lives on a different hostname (patients.mycslink.org → mycslink.cedars-sinai.org). Pair it with `movedHost`.
- `movedHost` — **where `moved-host` sends the client.** Point it at another name for this same server — `127.0.0.1:4000` when the client came in on `localhost:4000` — to exercise the move without running a second server. Setting `discovery: "moved-host"` without it is a 400.
- `proxyDiscovery` — **which surface lists the patient records an account can access.** `json` (default), `html`, or `script`. No re-login needed.
- `requireTerms` — **whether login lands on the chart or on Terms & Conditions.** `false` (default) or `true`, which bounces every un-accepted session to `/Authentication/TermsConditions`. Wants a fresh login, since it gates sessions that haven't accepted yet. This was the `FAKE_MYCHART_REQUIRE_TERMS` environment variable, which needed a second server on another port to exercise.

`mode` and `discovery` are orthogonal — every combination works, and whichever
mount is active serves MyChart from exactly one prefix while the other 404s. A
root-mounted instance also 404s `/<anything>/Authentication/*`, matching real
root-mounted instances, so a wrong prefix guess can't quietly look like it
worked.

All of them are global to the process, so a test suite that depends on any of
them must set it rather than inherit whatever ran before it. `/reset` restores
the defaults.

## Resetting In-Memory State

Because all state lives in RAM, mutations during a session (sent messages, deleted contacts, TOTP toggles, registered passkeys, etc.) accumulate until the process exits. Two ways to reset without restarting:

- **Browser**: visit [`/reset`](http://localhost:4000/reset) and click the **Reset Fake MyChart RAM** button.
- **HTTP**: `curl -X POST http://localhost:4000/reset` — returns `{"ok":true}`.

Reset clears all sessions, restores the seeded conversations and emergency contacts, returns each user's TOTP to its seed state (off with no secret for homer, on with the seeded secret for marge — any secret minted during a setup is discarded), removes all passkeys, forgets booked appointments, and restores the default mount and proxy-discovery modes.

## Running

```bash
cd fake-mychart
bun install
bun run dev    # Development mode → http://localhost:4000
```

For production builds:
```bash
bun run build
bun run start  # Production mode → http://localhost:4000
```

## Connecting Scrapers

Pass `protocol: 'http'` to `MyChartRequest` or `myChartUserPassLogin`:

```ts
import { myChartUserPassLogin } from './scrapers/myChart/login'

const result = await myChartUserPassLogin({
  hostname: 'localhost:4000',
  user: 'homer',
  pass: 'donuts123',
  protocol: 'http',
})
// result.state === 'logged_in'
```

Or via the CLI:
```bash
bun run cli mychart --host localhost:4000 --user homer --pass donuts123 --no-cache --protocol http
```

## Architecture

```
fake-mychart/
  src/
    app/
      route.ts                    # GET / → 302 to /MyChart/ (firstPathPart discovery)
      MyChart/
        [...path]/
          route.ts                # Catch-all: dispatches all 80+ URL patterns
    data/
      homer.ts                    # All Homer Simpson fake data (~800 lines)
    lib/
      session.ts                  # In-memory session store (Map + 30-min TTL)
      csrf.ts                     # Fake CSRF token generation
      html.ts                     # HTML page templates for cheerio-parsed pages
```

### Key design decisions

- **Single catch-all route** — One file (`[...path]/route.ts`) handles everything. It parses the URL path segments and dispatches to handler functions. This keeps the server simple and easy to extend.
- **All state in RAM** — Sessions, conversations, and any mutations (sending messages, deleting threads) live in memory. Restarting the server resets everything to the Homer Simpson seed data.
- **No HTTPS** — The fake server runs plain HTTP only. Scrapers pass `protocol: 'http'` to connect.
- **Fake CSRF tokens** — Every HTML page includes a `__RequestVerificationToken` hidden input. The server generates tokens but never validates them, matching how scrapers interact with real MyChart.

## Patient Data: Homer Jay Simpson

All fake data is shaped to exactly match the JSON/HTML structures that the scrapers parse. The patient:

| Field | Value |
|-------|-------|
| Name | Homer Jay Simpson |
| DOB | 05/12/1956 |
| Age | 69 |
| MRN | 742 |
| PCP | Dr. Julius Hibbert, MD |
| Blood Type | O+ |
| Height | 6'0" |
| Weight | 260 lbs |

### Data categories implemented

| Category | Scraper | Key Data |
|----------|---------|----------|
| **Profile** | `profile.ts` | Name, DOB, MRN, PCP, email |
| **Health Summary** | `healthSummary.ts` | Age, blood type, vitals overview |
| **Medications** | `medications.ts` | Duff Beer Extract 500mg, Donut Supplement, Lisinopril, Atorvastatin — each carries a `medicationKey` (`FAKE-MED-KEY-001`…`004`, and `101`/`102` for the kids), because real MyChart returns one and refill-by-name resolves the key from this list |
| **Allergies** | `allergies.ts` | Vegetables (Severe), Exercise (Moderate) |
| **Health Issues** | `healthIssues.ts` | Obesity, Hypertension, Hypercholesterolemia, Radiation exposure |
| **Immunizations** | `immunizations.ts` | Flu, Tdap, COVID-19, Hep B |
| **Vitals** | `vitals.ts` | BP 145/95, HR 88, Weight 260 lbs with history |
| **Care Team** | `careTeam.ts` | Dr. Julius Hibbert (PCP), Dr. Nick Riviera (Surgery) |
| **Insurance** | `insurance.ts` | Springfield Nuclear Power Plant Employee Health Plan |
| **Emergency Contacts** | `emergencyContacts.ts` | Marge Simpson (Spouse), Barney Gumble (Friend) |
| **Medical History** | `medicalHistory.ts` | Diagnoses, surgeries (triple bypass, crayon removal), family history |
| **Lab Results** | `labResults.ts` | CMP, Lipid Panel, CBC — cholesterol and triglycerides high |
| **Visits** | `visits.ts` | Upcoming: annual physical. Past: ER donut incident, radiation screening |
| **Messages** | `conversations.ts` | Threads with Dr. Hibbert (weight mgmt) and Dr. Nick (discount surgery) |
| **Billing** | `bills.ts` | Multiple billing accounts with charges |
| **Letters** | `letters.ts` | After-visit summaries from Dr. Hibbert |
| **Goals** | `goals.ts` | Lose 50 lbs (care team), eat one vegetable/week (patient) |
| **Referrals** | `referrals.ts` | Cardiology referral to Dr. Nick |
| **Preventive Care** | `preventiveCare.ts` | Colonoscopy overdue, flu shot due |
| **Documents** | `documents.ts` | After Visit Summary, Lab Results Report |
| **Questionnaires** | `questionnaires.ts` | PHQ-9, Health Risk Assessment |
| **Care Journeys** | `careJourneys.ts` | Weight Management Program |
| **Activity Feed** | `activityFeed.ts` | New lab results, appointment reminders |
| **Education Materials** | `educationMaterials.ts` | Heart Health, Managing Cholesterol |
| **EHI Export** | `ehiExport.ts` | Full Health Record template |
| **Upcoming Orders** | `upcomingOrders.ts` | Lipid Panel, HbA1c |
| **Linked Accounts** | `linkedAccounts.ts` | Shelbyville Medical Center |

## Messaging (Mutable State)

Messages are fully interactive. You can:

- **List conversations** — returns seed data plus any new messages sent this session
- **Read conversation threads** — full message history with timestamps and senders
- **Send a new message** — goes through the full compose flow (get topics → get recipients → get compose ID → send). The new conversation appears in subsequent list calls.
- **Reply to a message** — appends to an existing conversation thread
- **Delete a conversation** — removes it from the in-memory list

All mutations persist in RAM until the server restarts.

### Message flow (what the scraper does)

```
1. POST /api/medicaladvicerequests/getsubtopics        → list of topics
2. POST /api/medicaladvicerequests/getmedicaladvicerequestrecipients → list of providers
3. POST /api/medicaladvicerequests/getviewers           → viewer permissions
4. POST /api/conversations/getcomposeid                 → compose session ID
5. POST /api/medicaladvicerequests/sendmedicaladvicerequest → send the message
6. POST /api/conversations/removecomposeid              → cleanup
```

## Login Flow

The fake server replicates the exact login flow that `scrapers/myChart/login.ts` expects:

```
1. GET /                                    → 302 to /MyChart/ (firstPathPart = "MyChart")
2. GET /MyChart/Authentication/Login        → HTML with __RequestVerificationToken + loginpagecontroller.min.js
3. GET /MyChart/loginpagecontroller.min.js  → JS with Credentials:{Username:""} pattern
4. POST /MyChart/Authentication/Login/DoLogin → checks creds, returns:
   - Success: HTML containing "md_home_index"
   - Need 2FA: HTML containing "secondaryvalidationcontroller"
   - Failed: HTML containing "login failed"
5. (If 2FA) POST /MyChart/Authentication/SecondaryValidation/Validate → accepts code "123456"
6. GET /MyChart/inside.asp                  → confirms session
```

### Session management

- Login sets a `MyChartSession=<uuid>` cookie
- `GET /MyChart/Home` returns 200 if session valid, 302 to login if not
- **The entire post-login surface enforces the session the way real MyChart
  does** — every page AND every `api/*` JSON endpoint answers an expired or
  missing session with a 302 to `/Authentication/Login` (which a
  redirect-following client experiences as a 200 HTML login page). Only
  `Authentication/*` (the login flow itself), the root/`DefaultAsp` discovery
  hops, and the keepalive endpoints stay open.
- `Home/KeepAlive` and `keepalive.asp` answer `"1"` for a live session and
  `"0"` without one, matching the contract MyChart's own JS relies on.
- `POST /api/invalidate-sessions` (test-only, outside the mount) deletes every
  session — how tests simulate mid-scrape expiry.
- Sessions expire after 30 minutes of inactivity
- Keepalive endpoint at `/MyChart/Home/KeepAlive` returns `"1"`

## eUnity / Imaging Viewer

The fake server includes a stub eUnity imaging viewer co-located on the same host so the full CLO download pipeline (SAML chain → AMF3 session init → CLO wrapper + pixel data → JPEG conversion) can be exercised end-to-end without a real Epic deployment.

### Routes (all served from `/e/*` on the same origin)

| Route | Method | Purpose |
|-------|--------|---------|
| `/MyChart/api/test-results/GetWidgetList?groupType=2` | POST | Lists imaging studies (X-ray skull, CT head) |
| `/MyChart/api/test-results/GetDetails?id=...` | POST | Returns study metadata with `reportID` |
| `/MyChart/api/report-content/LoadReportContent` | POST | Returns HTML containing `data-fdi-context` |
| `/MyChart/Extensibility/Redirection/FdiData` | POST | Bridge: returns `{url, launchmode, IsFdiPost}` pointing at `/e/saml-sts` |
| `/e/saml-sts` | GET | SAML STS page with auto-submit form (mimics real STS) |
| `/e/saml-acs` | POST | SAML ACS that 302-redirects to the eUnity viewer |
| `/e/viewer` | GET | Viewer HTML; sets `JSESSIONID` cookie and embeds study params |
| `/e/AmfServicesServlet` | POST | AMF3 `getStudyListMeta` response with study/series/instance UIDs. Required before `CustomImageServlet` returns image bytes. |
| `/e/CustomImageServlet` | POST | Returns pre-generated CLO data (`requestType=CLOWRAPPER` or `CLOPIXEL`) keyed by `seriesUID` |

### CLO image data

Pre-generated CLO files for each Homer study live in `src/data/clo-images/`:

- **X-ray skull** — `skull_ap_*.clo`, `skull_lateral_*.clo`
- **CT head** — `checkerboard_512x512_*.clo`, `circle_512x512_*.clo`, `gradient_h_512x512_*.clo`, `gradient_v_512x512_*.clo`, `diagonal_510x510_*.clo` (one per series/instance)

Each image is a wrapper + pixel pair. The encoder lives at `scrapers/myChart/clo-image-parser/generate_clo.ts` if you need to add more synthetic test patterns.

### Origin handling

`FdiData`, `/e/saml-sts`, and `/e/saml-acs` build SAML/viewer URLs from the inbound `Host` header (not `request.url`) because Next.js normalizes `request.url` to the bind address. This makes the URLs reachable from any caller — the host (`localhost:4000`), another container in the same Docker network (`fake-mychart:3000`), or a custom Compose alias.

### Coverage in CI

`claude-desktop-extension/src/imaging/__tests__/encode.unit.test.ts` exercises the CLO fixtures directly, and the `integration` CI job runs every `*.integration.test.ts` in the repo — the scraper suites, the desktop extension and npm-package included — against a live instance of this server.

## What's NOT Implemented

### Draft Persistence

Message draft endpoints (`savereplydraft`, `savemedicaladvicerequestdraft`) return success but don't actually persist — drafts are discarded. This doesn't affect normal message sending.

## CI Integration

The GitHub Actions workflow (`.github/workflows/checks.yml`) has a `fake-mychart` job that:

1. Builds the fake server (`bun run build`)
2. Starts it in the background (`bun run start &`)
3. Polls until the server responds with 302 on `GET /`
4. Runs every `*.integration.test.ts` against it (`bun run test:integration`)

```bash
# Run locally
cd fake-mychart && bun run build && bun run start &
# Wait for server...
bun run test:integration
```

## Adding New Endpoints

**Fidelity rule — the fake MUST behave EXACTLY like real MyChart.** It is a faithful stand-in, not a
convenience mock. Replicate the real API's response shapes, field names and casing, pagination (page
sizes, `HasMoreData`/`SerializedIndex` continuation), status codes, and server-side enforcement rules
(e.g. WebAuthn signature-counter monotonicity) precisely as observed on a real instance. Never
simplify a contract just to make a test easier — if real MyChart returns 10 results per page, the
fake returns 10, and the fixture is sized around that. When you discover how a real endpoint
behaves, update the fake to match it exactly.

To add a new endpoint:

1. Add fake data to `src/data/homer.ts`
2. Add the URL pattern match in `src/app/MyChart/[...path]/route.ts`
3. If it's an HTML page parsed by cheerio, add a template in `src/lib/html.ts`
4. Add a test case in `scrapers/myChart/__tests__/fake-mychart/fake-mychart.integration.test.ts`
