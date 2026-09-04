# `core` — the request path every scraper shares

Cookies, redirects, the deployment prefix, the antiforgery token, session expiry and
renewal, the keepalive heartbeat, and the raw envelope every read scraper returns.

| | |
| --- | --- |
| **Source** | [`myChartRequest.ts`](myChartRequest.ts) · [`makeAuthenticatedRequest.ts`](makeAuthenticatedRequest.ts) · [`sessionRenewal.ts`](sessionRenewal.ts) · [`sessionStore.ts`](sessionStore.ts) · [`rawResponse.ts`](rawResponse.ts) · [`csrf.ts`](csrf.ts) · [`util.ts`](util.ts) · [`types.ts`](types.ts) |

## `MyChartRequest`

One session: hostname, protocol, cookie jar, deployment prefix, and the hooks a client
wires onto it.

- **There is deliberately no "pass me a fetch" option.** Which network call to make, and
  whether to keep our own cookie jar, are platform questions
  [`scrapers/http.ts`](../../http.ts) answers at runtime — on iOS the platform owns cookies
  and the jar stays empty. Callers say *where* they are going, not *how* to get there.
  Tests use the `transport` seam, which sits below the headers, the jar, the per-host permit
  and the deadline, so a test still exercises all four.
- `firstPathPart` is the deployment prefix, `null` for a root-mounted instance
  (see [`../auth/`](../auth/)).
- **Redirects: 301, 302, 303, 307 and 308, capped at 20 hops.** 303/307/308 are rare in
  front of MyChart but do appear (SSO stops, load balancers), and dropping them turned a
  working instance into an unexplained blank response. The cap exists because at least one
  real instance answers `/CRH/` with a 301 to `/CRH/`.
- `reauthenticate` and `restoreProxyContext` travel **on the request object**, wired by
  whichever client owns the credentials. That is what lets session renewal be a leaf module.

## `makeAuthenticatedRequest` — the invariant

**Every post-login call goes through this. Never raw `makeRequest`.**

MyChart answers an expired session by bouncing the request to the login page: a 302 to
`/Authentication/Login` that a redirect-following client turns into a 200 HTML page. A
scraper that does not check lands in one of two failure modes — `.json()` throws on the
HTML, or, far worse for a health app, **a token-extraction guard quietly returns an empty
result and an expired session renders as "this patient has no allergies."**

This wrapper is the one place that is handled. It:

1. detects the login bounce;
2. silently re-logs-in through the `reauthenticate` hook, **single-flight** — a 30-category
   scrape whose session dies mid-run triggers **one** re-login, not thirty;
3. restores the active proxy patient if the session had been switched to a family member;
4. retries the original request exactly once;
5. keeps the session registered for the keepalive heartbeat, so expiry stays rare.

Only when all of that fails does the caller see a typed `SessionExpiredError` — never a
fake-empty result.

**The division of labour is what makes it safe.** Raw `makeRequest` stays the transport for
everything pre-login — mount discovery, `DoLogin`, 2FA, terms, the keepalive pings
themselves — so the renewal path is built entirely from raw calls (plus `autoRenew: false`
wrapped ones) and a renewal can never end up awaiting its own single-flight promise.

`sessionRenewal.ts` is a **leaf module** for the same reason: both callers
(`makeAuthenticatedRequest` on a bounce, `sessionStore` when a heartbeat finds the session
dead) import it statically without a cycle.

```
makeAuthenticatedRequest ─┐
                          ├─→ sessionRenewal ─→ (nothing)
sessionStore ─────────────┘
proxyContext ─→ makeAuthenticatedRequest
```

## Keepalive

**MyChart has two independent timeout mechanisms, and only one of them matters here.**

- **Server-side session.** Reset by `GET /Home/KeepAlive?cnt=N` and `GET /keepalive.asp?cnt=N`,
  both of which answer `"1"` if alive and `"0"` if expired. These are the endpoints that
  actually move the server's timer. **Pinging `/Home` does not extend the session** — it
  just serves the page. `sessionStore` calls both every 30 seconds, matching MyChart's own
  JS interval.
- **Client-side inactivity timer.** MyChart's `checkActivity()` tracks
  `$$WPUtil.setActivity.__lastActivity`, shows "your session is expiring" at 19 minutes
  (`refreshTimeout = 1140000`) and force-logs-out at 20 (`sessionTimeout = 1200000`). It is
  reset only by real user interaction or by clicking "stay logged in". **The keepalive pings
  do not reset it.** It is browser JavaScript and irrelevant to a scraper.

## The antiforgery token

MyChart's `/api/*` endpoints reject a POST without a `__RequestVerificationToken`. Chart
scrapers harvest one from the hidden input on their own activity page
(`RawCollector.pageToken`, which records the fetch as `purpose: 'token'`). Flows with no
activity page — TOTP and passkey enrollment, the eUnity imaging handoff — ask
`/Home/CSRFToken` directly.

**`/Home/CSRFToken` is one of the least consistent surfaces across Epic instances.** It
answers with any of:

- JSON `{"Token": "..."}`, or the same key camel-cased, or `RequestVerificationToken` in
  either casing;
- the bare token as the entire response body;
- a full HTML page with the usual hidden input;
- an **empty 200** — seen on at least one live instance, which is why the `/Home` page
  fallback exists.

Getting this wrong does not fail loudly: it produces a token-less POST that the instance
answers with ASP.NET's redirect dance, which reads downstream as "this account has no
imaging" rather than as an error. Three copies of this parsing had drifted apart before
[`csrf.ts`](csrf.ts) existed; keep it as the one.

A missing token on an activity page is a typed `MissingVerificationTokenError`, not an
empty result — same reasoning.

## `RawResponse` — the envelope

A scraper's job is to talk to MyChart and hand back exactly what MyChart sent; deciding what
a caller sees is [`../processors/`](../processors/). Half the scrapers issue more than one
request — labs is several list calls plus two or three per order, billing is a page scrape
plus three JSON calls per account, past visits pages — so "the raw HTTP response" is a
**list of requests**, not one body. `raw` mode returns the single body when there was one
request and the whole envelope otherwise.

Each record carries the path (minus the `noCache` buster), method, the request body when it
matters for reading the response, status, content type, the parsed body, and optionally
`purpose: 'token'` or `failure`.

### A failed answer is thrown, in every mode

`RawCollector.send` records the answer and then **throws a typed `MyChartResponseError`**
when it was not the data. The throw happens in the scraper, so `raw`, `json`, `standard` and
`concise` all fail identically — leaving it to each processor to notice is how a 500 becomes
`rec(html)` → `{}` → `[]` → "no allergies on file" in whichever ones forget.

What counts as a failed answer:

- a non-2xx status (bare 500s, Cloudflare 403/503 challenges);
- **a 200 that came from ASP.NET's error page.** A November 2025 instance bounces a failed
  request 302 → `/Home/FiveHundred` → 302 → `/Home/Error?code=14` → **200 HTML**. After
  redirects are followed the status is fine and only the response URL tells;
- an F5 Volterra block page (200, `text/html`, "Request Rejected");
- an unfollowed redirect whose `Location` is the error page.

A genuinely best-effort request opts out per call with `tolerateFailure`, and its processor
then reports the gap by name — `externalProvidersUnavailable`, `contactInformationUnavailable`,
a per-account billing `unavailable` list. **Nothing tolerates a failure on its payload
request.**

## Dates

`parseMyChartDate` accepts ISO-8601 first and falls back to MyChart's display form
("May 12, 2026 8:56 PM"). Unparseable input returns `MISSING_DATE`
(`Number.NEGATIVE_INFINITY`) so a newest-first sort always puts undated items last, even
against pre-1970 dates.
