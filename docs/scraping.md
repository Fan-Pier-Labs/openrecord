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

## Scraping Tips

When reverse engineering health portal APIs (MyChart, etc.), the request headers must **exactly match** what the browser sends — including header name casing (lowercase), `origin` header, `user-agent` string version, and `x-clientversion`. A missing `origin` header alone causes a 403 Forbidden. Use Playwright MCP to capture the exact request the browser makes, then replicate it exactly in the scraper code. 

## Tools

- **Playwright MCP** is the preferred tool for exploring websites, reverse engineering APIs, and understanding web app behavior. Always use the Playwright MCP tools (browser_navigate, browser_snapshot, browser_click, browser_network_requests, etc.) rather than writing one-off TypeScript scripts that import Playwright directly. The MCP gives you an interactive browser session that's far more efficient for investigation and debugging.
