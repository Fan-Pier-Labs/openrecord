# Scraping guide

How to reverse-engineer a new MyChart endpoint, and the traps that make a wrong guess look
like a working scraper. What each *existing* scraper does is its own folder's README — see
[`README.md`](README.md).

Three of those READMEs carry the ground the earlier version of this file covered:

- **Login, mount discovery, 2FA, TOTP and passkeys** — [`myChart/auth/`](myChart/auth/)
- **The pre-login surface** (phones, the bookable provider directory, billing entities) —
  [`myChart/prelogin/`](myChart/prelogin/)
- **Epic's instance directory and its logos** — [`list-all-mycharts/`](list-all-mycharts/)

## Match the browser's request exactly

Header **name casing** (these APIs want lower-case), the `origin` header, the `user-agent`
version string, `x-clientversion` — all of it. A missing `origin` alone is a 403. Capture
the browser's exact request with Playwright MCP and replicate it; a request-shape mismatch is
the first thing to suspect behind an unexplained 403, and the browser header block in
[`http.ts`](http.ts) is where the shared half lives.

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
trap on four out of four instances; see [`myChart/api-surface-gaps.md`](myChart/api-surface-gaps.md), "Insurance payer catalogue".

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

### Logging in with a saved passkey, in Playwright

A CDP **virtual authenticator** logs in with a saved software passkey automatically — no 2FA
prompt, which makes a reverse-engineering session repeatable:

```typescript
const cdpSession = await page.context().newCDPSession(page);
await cdpSession.send('WebAuthn.enable');
const { authenticatorId } = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true }
});
// Add the saved credential from .passkey-credentials/<hostname>.json
await cdpSession.send('WebAuthn.addCredential', {
  authenticatorId,
  credential: { credentialId, rpId, privateKey, userHandle, signCount, isResidentCredential: true }
});
```

CDP expects the private key as raw PKCS8 bytes in base64, which is exactly what the credential
file stores. Then click "Log in with passkey" and the virtual authenticator does the rest. The
scraper's own software authenticator is [`myChart/auth/softwareAuthenticator.ts`](myChart/auth/softwareAuthenticator.ts).
