# Scraping Guide

## MyChart Login

- Login field auto-detection: `LoginIdentifier` vs `Username` — detected from `loginpagecontroller.min.js`
- `mychart.example.org` is the primary test target and often skips 2FA
- Fetch passwords from the browser keystore
- Do not ask the user for 2FA codes — retrieve them automatically via the Resend API (see [CLI docs](cli.md#automatic-2fa-via-resend))
- Session expiration: a 302 redirect to the Login page means cookies are dead
- **Passkey auto-login**: Passkey credentials can be registered per MyChart instance and preferred at login (bypasses 2FA entirely), falling back to username/password/TOTP. The CLI stores them via `npm-package/cli/passkeyStore.ts`.
  - Scraper layer: `scrapers/myChart/auth/setupPasskey.ts` (registration), `scrapers/myChart/auth/login.ts` (`myChartPasskeyLogin`), `scrapers/myChart/auth/softwareAuthenticator.ts` (software WebAuthn)

## The instance directory (mychart.org)

Every client's list of MyChart instances comes from Epic's own picker data, scraped by
`scrapers/list-all-mycharts/directory.ts`.

- **The list**: `GET https://www.mychart.org/cached-api/help/organizations/?locale=en-us&includeOrganizations=1`.
  ~1400 organizations with `slgId`, `name`, `loginUrl`, `aliases`, `states`, `countries` and a logo
  record. **`includeOrganizations=1` is required** — without it the endpoint returns 200 with the
  country/state dictionaries and no `organizations` key at all.
- **The logos**: `https://media.epic.com/mychartdotorg/directus/<subAreaName>/<imageId>/<fileName>`,
  built from the entry's `logo`. Eight organizations have no logo record; Epic's picker falls back to
  a per-`slgId` override (Mayo, Kaiser, HealthPartners and five others) and then to a generic image,
  and so does `logoUrlFor`. All of them are on one host, so the per-host permit is what paces a bulk
  fetch — fetch the logos you're about to show, not all 1400.
- This replaced a scrape of `window.PageContext.Directory` inlined into `/LoginSignup`. mychart.org
  was rebuilt as a Next.js app and that page now ships no organizations at all, so anything still
  parsing the HTML is parsing a page that no longer holds the answer.
- fake-mychart serves both halves (`/cached-api/help/organizations/` and the mirrored media path) so
  neither the tests nor the mobile app's first-boot refresh has to reach Epic.

## The pre-login surface (`scrapers/myChart/prelogin/`)

What an instance tells anyone about the health system behind it, with no account. Verified on five
real instances spanning both scheduling-bundle generations; the routes, request encoding and every
key read are identical on all of them. `fetchHospitalNetworkProfile(hostname)` runs all three:

- **Contact lines** — every pre-login page inlines `$$WP.Strings.addMnemonic("@MYCHART@HELPDESKPHONE@", …)`
  plus `SCHEDULINGPHONE`, `BILLINGPHONE`, `HELPEMAIL`, `ORGNAME`, `APPTITLE`, `ABSOLUTEURL`. Values
  are HTML (`tel:` anchors, or a bare span for a vanity number). Epic ships placeholders —
  `(555) 555-5555` and `MyChartSupport@DoNotUse.DoNotUse` — which read as unset.
- **"Find a Doctor"** — `GET /<mount>/OpenScheduling` sets a session cookie and issues an antiforgery
  token; then form-encoded POSTs with the token as a header:
  `Scheduling/Anonymous/GetSchedulingWorkflowData` (`schedulingParameters[workflow]=NewProvider&isFirstLoad=true`
  → specialties + feature flags) and `Scheduling/Anonymous/GetSpecialtyData` (`SpecialtyId=…` → providers,
  departments with street address/phone/coordinates/hours, provider-department pairs). One specialty is
  0.6–2 MB. Bookable providers only, no NPI; the newer build adds `SpecialtySearchTerms` per provider.
  A wrong payload gets the release's error surface (302 → `/Home/FiveHundred` or a bare 500), never JSON.
- **Guest estimates** — `GET /<mount>/GuestEstimates` → `SelectServiceArea`, which inlines
  `$$WP.Estimates.OtherSAs = [{Id,Title,Phone,…}]` (billing entities with customer-service lines);
  `SelectLocation?svcArea=…` inlines `var model = {Locations:[…],HasCompletedCaptcha:false}`. The payer
  list two steps on sits behind a disclaimer whose accept step is reCAPTCHA-protected; not scraped.
- **Not published anywhere**: a fax number, an org-level mailing address, an accepted-insurance list.
- The mychart.org directory (`fetchMyChartDirectory`) also carries `phone`, `email` and `faq` per org.

## Scraping Tips

When reverse engineering health portal APIs (MyChart, etc.), the request headers must **exactly match** what the browser sends — including header name casing (lowercase), `origin` header, `user-agent` string version, and `x-clientversion`. A missing `origin` header alone causes a 403 Forbidden. Use Playwright MCP to capture the exact request the browser makes, then replicate it exactly in the scraper code. 

## Finding the request the web UI sends

The `/app/*` pages are React, and each one's bundle is a separate file under
`/<mount>/scripts/lib/pxbuild/`. The page HTML carries a map of every bundle
name to its cache-busting hash, so `epic.px.client.<page>.js` — e.g.
`epic.px.client.communication-center.js` — is fetchable directly, without the
`?v=` and (for most instances) without credentials. Prettify it and grep for the
endpoint name: the caller is right there, with the exact `requestData` keys, any
`nonceProperty`, and the values its own caller passes.

**Check the React activity is actually served before trusting its bundle.** An
instance that still runs the legacy jQuery version of an activity answers
`GET /app/<activity>` with a **200 Home page** (the `<title>` says "Home"), and
every `/api/*` endpoint that activity's bundle names 500s with
`{"Message":"An error has occurred."}` whatever it is sent — which reads exactly
like "no data on file". The bundle is still downloadable, so the caller looks
perfectly real. The legacy page's own bundles (`/<mount>/bundles/<area>-controllers`,
listed as `<script src>` on the legacy page) hold the real endpoint, reached by
`makeLink("Area/Controller/Action")` and usually a form-encoded `$.post`.
`/api/insurance/LoadPayers` vs `Insurance/Coverages/GetPayors` was this exact
trap on four out of four instances; see `api-surface-gaps.md` §1f.

Worth knowing before guessing at a payload: **parameter names are per-endpoint,
not per-area**. Under `/api/conversations/` the read endpoints
(`GetConversationDetails`, `GetConversationMessages`) key the thread on `id`,
while the mutating ones (`SendReply`, `DeleteConversation`) use
`conversationId`. Sending the wrong one is an opaque HTTP 500
`{"Message":"An error has occurred."}`, which looks exactly like a dead
endpoint.

**And rejections are per-endpoint too.** Given the very same bad id,
`GetConversationMessages` answers 500 while `GetConversationDetails` answers
**200 with a literal JSON `null`** — as `GetVisitNotes` and `GetLetterDetails`
also do. So `if (!response.ok) throw` is not enough on this API: check the
payload as well, or an unknown id becomes an empty medical record.

## Tools

- **Playwright MCP** is the preferred tool for exploring websites, reverse engineering APIs, and understanding web app behavior. Always use the Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_network_requests, etc.) rather than writing one-off TypeScript scripts that import Playwright directly. The MCP gives you an interactive browser session that's far more efficient for investigation and debugging.
