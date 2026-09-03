# MyChart pre-login surface (verified 2026-09-03 on five real instances)

Implemented in `scrapers/myChart/prelogin/`; the how-to lives in `docs/scraping.md`. This file
records what was learned that the code alone wouldn't tell you.

## Same schema everywhere

Five instances (root-mounted and prefixed, two scheduling-bundle generations) returned identical
routes, request encodings and response keys. The only drift was two additive keys on the newer
build: `Providers[].SpecialtySearchTerms` and `WorkflowSettings.UseLegacyQuestionnaires`. Read
everything as optional; never branch on version.

## What exists, and where

- Support phone lines, org name, portal brand, mount prefix: mnemonic block on every pre-login page.
- Bookable provider directory + clinic addresses/phones/coordinates/hours: the anonymous
  open-scheduling workflow (`/OpenScheduling`, two form-encoded POSTs). 0.6–2 MB per specialty;
  190–856 providers per specialty on large systems. Bookable providers only, no NPI.
- Billing entities with customer-service lines, and facilities: guest price-estimate pages, inlined.
- mychart.org directory payload carries `phone` (958/1414 orgs), `email` (390), `faq` (1271).

## What does not exist anywhere on MyChart

- Fax numbers. Not on the login/FAQ/terms/privacy pages, not in any captured post-login shape.
- An organization-level mailing address (only clinic street addresses).
- An accepted-insurance list before login: the payer picker is the last step of the guest-estimate
  flow, behind a disclaimer whose accept step runs invisible reCAPTCHA v2. Post-login candidate:
  `/api/insurance/LoadPayers` (untapped as of this writing).
- `/api/FHIR/R4/metadata` is 404 on every mount; the FHIR base lives on a different host.

## Gotchas

- The anonymous POSTs must be form-encoded (`$$WPUtil.postify`) with the antiforgery token as a
  header. JSON or a missing token gets the release's error surface (302 dance or bare 500), never
  a JSON error — which looks like a dead endpoint.
- Placeholders: `(555) 555-5555` / `tel:5555555555` and `MyChartSupport@DoNotUse.DoNotUse` mean
  "not set". Vanity numbers ("800-4Sprng") have no `tel:` link.
- `String.prototype.replace` with a `$$WP…` replacement string: `$$` is a pattern; use a function.
- A CI fake-mychart container from another worktree often holds port 4000; `.claude/launch.json`
  starts a local one on an auto-assigned port (`FAKE_MYCHART_HOST=localhost:<port>` for tests).
