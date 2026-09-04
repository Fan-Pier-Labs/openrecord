# Architecture

Why the load-bearing pieces are shaped the way they are. `CLAUDE.md` carries the one-line
rule for each of these; this file carries the reasoning, which is what you need when you are
about to change one.

## Authenticated requests & session expiry (`scrapers/myChart/core/makeAuthenticatedRequest.ts`)

**Every post-login scraper call goes through `makeAuthenticatedRequest(request, config)`, never
raw `request.makeRequest`.** MyChart answers an expired session by bouncing the request to the
login page, and the login page carries its own `__RequestVerificationToken` — so without central
detection, an expired session either crashes `.json()` on login HTML or, worse, renders as an
empty result ("this patient has no allergies").

The wrapper:

- **Detects the bounce** — final URL at `/Authentication/Login`, an unfollowed 302 there, or strict
  login-page markers via `looksLikeSignedOutPage`. The loose `looksLikeLoginPage` matches every
  post-login page and must not be used for expiry.
- **Silently re-logs-in** through the `reauthenticate` hook the client wired onto the request.
  Single-flight per request object — a 30-category scrape whose session dies triggers ONE re-login.
- **Restores the active proxy patient** recorded in `request.activeProxyTarget`. Re-login resets
  MyChart's server-side context to the account holder, and retrying on the wrong patient's chart is
  the one unforgivable failure.
- **Retries exactly once**, then throws a typed `SessionExpiredError` when no silent path exists.
- **Auto-enrolls the session in the shared keepalive**; `request.disableAutoKeepalive` opts out.

Raw `makeRequest` remains the transport for the pre-login world: mount discovery, DoLogin, 2FA,
terms, keepalive pings. That is also what makes renewal deadlock-free — the renewal path itself
only issues raw or `autoRenew: false` calls.

## Silent login ladder (`scrapers/myChart/auth/silentLogin.ts`)

The shared non-interactive login behind every client's `reauthenticate` hook: saved passkey (with
WebAuthn signature-counter retry) → username/password → TOTP-secret 2FA. Anything needing a human
returns a failure instead of blocking.

`wireSilentReauthentication(request, getParams, onRenewed?)` wires the hook. `getParams` runs at
renewal time so credential stores are re-read fresh, and success adopts the fresh state onto the
SAME request object via `MyChartRequest.adoptStateFrom` — login functions construct a new instance,
and everything holding a reference mid-scrape has to keep working.

Wired in all four clients: the CLI (`wireCliSessionRenewal` in `npm-package/cli/cli.ts`), the
desktop extension (`manageSession` in `claude-desktop-extension/src/session-manager.ts`), the Expo
app (`manageSession` in `expo-app/src/lib/scrapers/session-manager.ts`), and the npm library
(`MyChartClient` wires it from connect args; `autoRenew: false` opts out).

## Keepalive heartbeats (`scrapers/myChart/core/sessionStore.ts`)

The single keepalive implementation — the desktop extension's, Expo app's and npm client's bespoke
per-entry intervals were collapsed onto it. `makeAuthenticatedRequest` auto-registers a session
after any successful authenticated request (`sessionStore.registerForKeepalive`, idempotent); pings
hit `/Home/KeepAlive` + `/keepalive.asp` every 30s (MyChart's own cadence); the interval is
`unref`'d so it never holds a process open; and a heartbeat that finds the session dead proactively
renews through the same `reauthenticate` hook before marking it expired. Call
`sessionStore.unregister(request)` when a client discards a session.

## Capability registry (`shared/capabilities/`)

**The single source of truth for what OpenRecord can do with a MyChart account.** One entry per
capability — id, title, description, `kind` (`read` / `write` / `account` / `public`), parameter
list, and a `run(request, args, ctx)` returning JSON-serializable data. All four clients *derive* their surface
from it and none hand-maintains a list: the desktop extension registers one MCP tool per entry, the
mobile app puts one agent tool per entry in its prompt, the CLI gains `--action <id>`, and the npm
client exposes `runCapability(id, args)`. Adding an entry here ships the capability everywhere.

`shared/__tests__/capability-parity.unit.test.ts` reads each client's *real* surface — the tools the
MCP server registers, the mobile catalog, the CLI's dispatch, the library's methods — and fails the
build if any stops covering an entry.
`scrapers/myChart/__tests__/fake-mychart/capabilities.integration.test.ts` runs every capability
against fake-mychart, so the list is proven to work, not just to exist. This replaced four
hand-maintained lists that had drifted to 46 / 43 / 46 / 38 capabilities, which meant a patient's
answer depended on which client they asked.

**Layout.** `index.ts` is the assembly, the lookup and `executeCapability`; `types.ts` is the shape
of an entry; `args.ts`, `params.ts`, `imaging.ts` and `resolve.ts` are the pieces entries share. The
entries themselves live one file per group under `registry/` — `profile.ts`, `visits.ts`,
`results.ts`, `messages.ts`, `billing.ts`, `care.ts`, `emergencyContacts.ts`, `prescriptions.ts`,
`patients.ts`, `accountSecurity.ts`, `providers.ts`, `directory.ts` — each exporting one ordered
array, which `index.ts` concatenates
in listing order. Group membership, ordering and `lessFrequentlyUsed` are presentation decisions, so
they stay in the registry rather than moving out to the ~40 chart folders the entries call into;
those folders keep knowing nothing about capabilities. **`CapabilityImpl` is exported from
`types.ts` but deliberately *not* re-exported from `index.ts`**, so `capability.run(...)` still does
not compile for any client — the enforcement for "every dispatch goes through `executeCapability`".

- **`kind` decides how each client treats it.** `read` is safe to batch and needs no confirmation.
  `write` mutates the chart — the mobile app shows a confirmation popup, the extension marks it
  `destructiveHint`. `account` changes how the patient signs in (passkeys, authenticator app) — the
  CLI drives them from flags and the mobile app from settings; the extension has no surface but
  tools, so it registers them and flags them `destructiveHint`. **No client may run one as a side
  effect of something else.** Registering a passkey removes the password and the 2FA code from every
  later sign-in and leaves a credential on the portal that outlives the session, so logging in
  recommends it and waits — `setup_account` / `complete_2fa` never call `register_passkey`
  themselves (`meta-tools.unit.test.ts` fails the build if the login path reaches `setupPasskey`).
  `public` reads something no MyChart account owns — CMS's NPI Registry, Epic's directory of MyChart
  instances — so it is read-shaped everywhere but takes no `account`, needs no session, and skips
  the active-patient assertion.
- **A `public` capability's `run` cannot take a `MyChartRequest`, and that is the enforcement.**
  `PublicCapabilityImpl` declares `run(args)`, so a public entry that grew a chart read would not
  compile; exempting it from the guard is then safe by construction rather than by review.
  `executeCapability` takes `MyChartRequest | null` for them, and refuses a null for anything else
  by name rather than failing fifteen frames into a scraper. Each client skips its own session
  resolution the same way: the extension omits the `account` parameter, the CLI runs the action
  once before it resolves a single credential (rather than once per connected account, after
  logging in), the mobile app bypasses `requireSession`, and the library exposes them as **static**
  methods on `MyChartClient` — constructing a client means logging in, which is a login for
  nothing. This is where the extension's hand-written `search_mycharts` went: same tool name, same
  result shape, now in every client, and searching Epic's live directory with the checked-in
  `mychart-instances.json` as the fallback (the result says which answered).
- **`lessFrequentlyUsed` decides what a listing leads with, and nothing else.** MyChart's surface is
  not evenly valuable: labs, medications, visit notes and messages are the reason to connect an
  account at all, while goals, letters, education materials, care journeys, questionnaires, the
  emergency-contact writes and the `account`-kind sign-in settings are endpoints most charts leave
  empty and most callers never reach for. Listing all ~50 at equal weight buries the useful ones — a
  person skims past them and a model picks a plausible-looking wrong tool out of the noise. So the
  flag is **presentation only**: `COMMON_CAPABILITIES` / `LESS_FREQUENTLY_USED_CAPABILITIES`
  partition the registry, the CLI's `--help` and `--list-capabilities` print the common set and name
  the count they held back, and `--show-all` appends the rest under their own heading.
  `executeCapability` never looks at it, every client still registers every entry, and a hidden id
  still runs as `--action <id>` with the same arguments.
  `npm-package/cli/__tests__/help.unit.test.ts` pins that down, and `capability-parity.unit.test.ts`
  asserts `--show-all` still lists the whole registry.
- **`CapabilityContext`** carries the per-account state that isn't on the MyChart session — the
  stored password, the saved TOTP secret, and the callbacks that persist new ones. Each client wires
  it to its own credential store; the registry never knows where credentials live.
- **Fuzzy resolution lives in the registry, not in a client.** `send_message` takes a provider
  *name* and `request_refill` a medication *name*; both resolve against the live list and **refuse
  to guess when a name is ambiguous**, listing the candidates instead.
- **The active-patient guard runs in `executeCapability`, not per client.** Every chart-touching
  capability accepts an optional `patient` and asserts, via `assertProxyReadContext`
  (`scrapers/myChart/proxy/proxyTools.ts`), that MyChart is on the patient the call is about — refusing
  with the `switch_proxy_target` call that fixes it rather than returning the wrong family member's
  chart. Omitting `patient` means the account holder, explicitly. The `Patients` group and the
  `account`- and `public`-kind capabilities are exempt: guarding "you must already be on patient X"
  in front of the tools that list and change X would make them unusable exactly when they are
  needed, and a public lookup has no chart to be on.
  **No client calls `capability.run` — every dispatch goes through `executeCapability`**, the
  `account`-kind ones included, and `capability-parity.unit.test.ts` greps the three client dispatch
  modules to keep it that way. The extension and the CLI each used to branch on `rendersMedia`
  *before* dispatching and run the media capability directly, which made `download_imaging_study`
  the one tool that skipped the assertion.
- **`rendersMedia`** marks the one capability (`download_imaging_study`) whose payload isn't JSON:
  it returns raw CLO bytes because the encode step is the client's, not the capability's — the CLI
  uses the sharp-backed exporter, while the MCPB and the mobile app share the pure-JS one
  (`convertCloToJpgPureJs`, `scrapers/myChart/clo-image-parser/exporters/to_jpg_purejs.ts`), because
  neither can load a native module. **Clients branch on the flag, never on
  the id** — a second media capability must not require editing five call sites, and
  `capability-parity.unit.test.ts` fails if an id check reappears. The branch decides how to render
  the payload; it sits after the dispatch, never in place of it. The CLI never prints image
  bytes: it decodes each CLO to a JPEG in `./imaging-output` (override with `--output <dir>`) and
  prints the file paths (`writeStudyImages` in `npm-package/cli/capabilityActions.ts`). The
  download always fetches **every** instance in the study — there is deliberately no
  `max_images` knob — and instances that answer CLOERROR are skipped, never returned as images:
  real eUnity studies can lead with `SeriesSelector` pseudo-instances that carry no pixel data,
  and an earlier budget spent on those first N junk entries returned zero images with zero
  errors. fake-mychart's CT study reproduces that shape.
- **The account selector is declared here too** (`ACCOUNT_PARAM`). It is the one parameter every
  capability takes in every client, and was the last one still hand-written per client: `account` in
  the extension, `instance` in the mobile app. Both now emit `account`; `readAccountArg` still
  accepts `instance` for the mobile alert cards and saved chats, and the parity test checks the
  spelling matches across clients.
- **Name → object lookup is `shared/resolveUnique.ts`**, used by `send_message` and
  `request_refill`. **Exact match first, then a unique partial** — a substring-only matcher rejects a
  perfectly correct name whenever another entry contains it ("Dr. Smith" against "Dr. Smithson"),
  telling the caller to be more specific about a name that could not have been. Ambiguity is always
  an error listing the candidates. `resolveTopic` is the deliberate exception: an unmatched topic
  falls back to the first one, because MyChart requires a topic and the category is cosmetic — but
  `send_message` returns `topic_used` and `topic_substituted` so the substitution is never silent.
- **`shared/base64url.ts`** is the portable codec behind `image_id` — no `Buffer`, no `atob`,
  because the token round-trips through Hermes. Tested against Node's `Buffer` as the oracle, since
  a token minted by one client has to decode in every other.

## The processor layer (`scrapers/myChart/processors/`, `chart/<name>/<name>.processor.ts`)

A read capability is two pure-ish halves. The scraper's `fetch…Raw(request, …)` talks to MyChart
and records every request it makes into a `RawResponse` envelope (`core/rawResponse.ts`): path,
method, the body we posted, status, and the body MyChart sent, parsed when it was JSON. It never
projects, renames, strips or merges. The sibling `<name>.processor.ts` turns the envelope into the
four output modes: `raw` (the untouched body, or the envelope when there were several payload
requests), `json` (the *standard object*), `standard` (that object as markdown) and `concise` (a
projection of it as markdown). `executeCapability` runs the scraper, then the processor, driven by
the `mode` argument the registry declares once as `MODE_PARAM`.

The rules, with their reasoning, are in [`processor-layer-proposal.md`](processor-layer-proposal.md);
the ones that bite when you add a capability:

- **A MyChart field is never edited in place or shadowed.** Anything computed gets a new name
  (`bodyText`, `instantISO`, `organizationName`). One name means one thing everywhere.
- **Membership is by field name, never by value.** A field on a mode's list is emitted even when
  empty, so "no allergies on file" survives. A field that is empty on every captured instance is
  off the list. No `prune`, no drop-if-empty.
- **Markup stays in `raw`.** HTML and RTF fields are not in `standard`; their `<field>Text`
  derivative is (`processors/htmlText.ts`).
- **Never invent a shape.** Only field names a captured real response has shown are projected;
  uncaptured elements pass through whole. `docs/processor-layer-todo.md` lists which.
- **A missing verification token throws** (`MissingVerificationTokenError`). It used to return an
  empty result, which read as "this patient has no allergies".
- **A failed answer throws** (`MyChartResponseError`), in every mode. `RawCollector.send` records
  the response and then refuses a non-2xx status, Epic's own error page (a November 2025 instance
  bounces a failed request through `/Home/FiveHundred` to a **200** `/Home/Error` page, so the
  status alone is not enough) and an F5 block page. Before this, only five processors looked at
  the status; for the rest a 500 was `{}`, projected to `[]`, rendered as "no allergies on file".
  A best-effort request — an optional endpoint, a speculative probe — opts out per call with
  `tolerateFailure`, and its processor reports the gap (`externalProvidersUnavailable`). Never the
  payload. fake-mychart's `failingEndpoints` knob is how a test proves a capability fails loudly.
- **The model-facing clients default to `concise`** (`MODEL_FACING_OUTPUT_MODE`); the library and
  the CLI default to `json`. One generic markdown renderer serves both markdown modes so a field
  cannot be on the page and missing from the JSON.

`dev-scripts/generate-processor-examples.ts` regenerates `docs/processor-layer-examples.md`, every
read capability in all four modes against fake-mychart.

## The one outbound path (`scrapers/http.ts`)

**Every request the scrapers send leaves through `scraperFetch`, and there is deliberately nowhere
else to make one from.** It owns the three things every outbound request needs, none of which
survives being reimplemented at a call site: the Chrome header block (MyChart and the eUnity image
servers answer a browser, not a bare `fetch`), the cookie jar wiring (load-balancer and bot-check
cookies get set mid-redirect-chain and are expected back on the next hop), and the per-host permit.

`MyChartRequest.makeRequest` builds MyChart URLs and follows redirects on top of it; the eUnity
imaging scraper calls it directly with its own jar; the directory script does too. A second raw-fetch
path is how the cap silently stops applying — it keeps working, it just isn't limited — so
`http.unit.test.ts` greps `scrapers/` and fails the build if a network call appears outside
`http.ts`. **Add a request, don't add a path.**

### No injected fetch — the platform decides

There is deliberately no `fetchFn` option on `MyChartRequest`, the login functions, or the npm
package: which network call to make, and whether to keep our own cookie jar, are facts about the
runtime, not about the caller. `resolveTransport` answers it in three branches:

1. A **test** transport, if one is installed.
2. **We own the cookies** — a jar was passed, so we're driving the redirect chain ourselves and
   prefer `expo/fetch`, which honors `redirect: 'manual'` where React Native's own fetch silently
   follows redirects.
3. **The platform owns the cookies** — use the runtime's own fetch, the one its cookie store is
   attached to. Substituting a different networking stack here sends every request out with no
   session.

`PLATFORM_OWNS_COOKIES` is the React Native check, and reads two signals (`navigator.product` and
whether `expo/fetch` resolved) because getting it wrong on device is a silently broken session, not
a crash. `globalThis.fetch` is read per call, never captured at import.

### Test seams, in place of injection

`setTestTransport(fn)` routes every request process-wide (used by `loginFlow.unit.test.ts`, which
drives `myChartUserPassLogin` against a scripted server — **clear it in `afterEach`**), and
`req.transport = fn` overrides one session. Both sit *below* the headers, the jar and the permit, so
a test still exercises the request production would send. `req.transport` is null in production;
anything that wraps it must call `platformFetch`, not the old value — see
`probeMountDiscovery.unit.test.ts`, which exists because binding the old value broke the whole
750-host sweep and nothing else caught it.

## Per-host rate limiting (`shared/hostConcurrency.ts`)

`scraperFetch` holds a per-hostname permit for the duration of each fetch. At most **10 requests are
in flight to a single MyChart host at a time**, process-wide — the limiter is keyed by host and
shared across every session and client, because the far end counts connections, not accounts. A full
30-category scrape otherwise fans out ~60 simultaneous requests at one hospital, which is how an
instance ends up in `blockedInstances.ts`.

Override with `MYCHART_MAX_CONCURRENT_REQUESTS_PER_HOST`; anything that isn't a positive integer
falls back to 10 rather than silently disabling the cap.

**The permit wraps only the individual fetch, never the redirect recursion** — `makeRequest` calls
itself to follow redirects, and holding a permit across that would let one chain hold several at
once and deadlock against its own callers. `requestConcurrency.unit.test.ts` covers that case
specifically; it times out if the permit is ever moved to wrap the whole call. Keys on the host
actually being contacted, so a cross-host redirect gets its own budget instead of spending the
vanity hostname's.

## Mount discovery (`scrapers/myChart/auth/login.ts`)

`determineFirstPathPart` works out where MyChart lives on a hostname — the prefix its routes sit
under (`/MyChart`, `/UCSFMyChart`, `prd`, or nothing for a root-mounted instance) and which host
actually serves it. It follows the root redirect chain to the end (Location headers, meta refreshes,
scripted `window.location`, cross-host moves), since MyChart's canonical bounce only names the mount
on its last hop. Guesses — a link off a landing page, a host it was redirected to — are checked for
a real login page before being trusted.

Verify changes with `bun scrapers/list-all-mycharts/probe-mount-discovery.ts` (all ~750 directory
hosts, sends no credentials).

## Proxy (multi-patient) support

Accounts with proxy access to several patients' charts (a parent reading a child's record) can list
and switch the active patient. **MyChart's active patient is server-side session state — there is no
per-request patient parameter — so callers must name the patient they mean rather than relying on a
previous switch.**

`withProxyTarget(request, patient, fn)` in `scrapers/myChart/proxy/proxyContext.ts` is the primitive;
`findProxyTarget` resolves a name, partial name, id or `me` and refuses to guess when ambiguous.

**The CLI is deliberately conservative: reads never mutate.** `--patient "<name>"` (names only,
never ids; defaults to the account holder) asserts who the command is about via `checkProxyContext`,
and if MyChart is on someone else the CLI errors out with the `--action list-proxies` and
`--switch "<name>"` commands to run. `--switch` is the only command that changes MyChart's
server-side active patient; it is verified against the profile page before it returns, so a switch
that lands on a different patient fails instead of returning the wrong chart. Record ids are opaque
and organization-specific, so switch tools accept `self: true` to return to the account holder
rather than requiring a looked-up id.

**All clients expose proxy support with the CLI's semantics.** The desktop extension and the mobile
app share `scrapers/myChart/proxy/proxyTools.ts`, a thin client layer over `proxyContext.ts`:
`runListProxyTargets` / `runSwitchProxyTarget` back the `list_proxy_targets` /
`switch_proxy_target` agent tools (extension: `claude-desktop-extension/src/tools.ts`; app: declared
in `expo-app/src/lib/ai/tool-catalog.ts`, dispatched in
`expo-app/src/lib/scrapers/session-manager.ts`), and `assertProxyReadContext` gates every other data
tool.

The guard caches one proxy discovery per session in a `WeakMap` keyed on the `MyChartRequest`, so a
re-login (keepalive reconnect, process restart) can never inherit stale knowledge, and parallel reads
(the app's memory builder) share a single discovery. In the app, `switch_proxy_target` is an
exclusive write tool with a native confirmation dialog, and the background memory/alert jobs run
through the same guard so they fail safe instead of mixing a family member's data into the account
holder's caches.

Note an account with no proxy access can still surface a single self-only entry on `/ProxySwitch` —
a one-entry list is "nothing to switch", not an error.

Tests: `scrapers/myChart/proxy/__tests__/proxyTools.unit.test.ts` (mocked),
`scrapers/myChart/__tests__/fake-mychart/proxy.integration.test.ts` (end to end),
`claude-desktop-extension/src/__tests__/proxy-tools.unit.test.ts` (registration shape),
`expo-app/src/lib/ai/__tests__/tool-catalog.unit.test.ts` (declarations + write gating).

## CLO image parser (`scrapers/myChart/clo-image-parser/`)

eUnity CLO image format decoder and encoder. **Getting an image out is two steps, and there is
deliberately no one-shot helper that does both.**

1. `clo_to_bitmap.ts` decodes CLO bytes to a `Bitmap` (8-bit) or `Bitmap16` — the codec, pure
   TypeScript, no `sharp`.
2. An exporter in `exporters/` encodes that bitmap: `convertBitmap16ToJpg` / `ToPng` / `ToWebp` /
   `ToAvif` / `ToTiff`, plus `convertBitmapToJpg` / `convertBitmapToWebp` for bitmaps that are
   already 8-bit (these feed sharp the samples directly instead of going via a 16-bit PNG, and
   consumers depend on those exact bytes).

**The format is the exporter you call, never inferred from a filename.** The old `convertCloToJpg`
wrapper did infer it, special-casing `.webp` and sending every other extension to the JPEG encoder,
so `out.png` got JPEG bytes under a PNG name — fine in any viewer, since they sniff the magic rather
than the name, until something trusts the extension. Teaching that wrapper every format would only
have made a second dispatch list to keep in step with `exporters/`, so it is gone instead.

The intermediate bitmap is also where you apply your own VOI LUT / windowing.

### `files-pulled-from-mychart/` is eUnity's own viewer, not ours

~6.9 MB of Dart-compiled JS and WASM downloaded verbatim off a real instance's `/e/viewer/`, kept as
reference material for the reverse engineering that produced `clo_to_bitmap.ts`. **Nothing imports
it, none of it is bundled, and it must stay that way** — decode behaviour belongs in
`clo_to_bitmap.ts` where a test can reach it.

It was called `wasm/`, which read like a build input and duly got flagged as 6.9 MB of unreferenced
dead code — true, and beside the point. It is also third-party code vendored into a proprietary
repo, so its redistribution terms want settling before it goes anywhere public. The `viewer.html`
from the same directory carries a real MRN, DOB and physician name and is gitignored **by basename**
(`**/viewer.html`), because the old path-pinned rule pointed at a directory renamed out from under it
and had quietly stopped matching anything.
`dev-scripts/clo-to-jpg.ts` wires the two steps together for terminal use.

## Client notes

- **CLI + npm package** (`npm-package/`) — `--action` accepts any capability id with repeated
  `--arg name=value`; `--help` prints usage plus the capability listing and `--list-capabilities`
  prints the listing alone. Both lead with the commonly-used capabilities and hold the rest behind
  `--show-all` (see `lessFrequentlyUsed` above). That dispatch, the listing and the help text live in
  `npm-package/cli/capabilityActions.ts` and `npm-package/cli/help.ts` rather than `cli.ts`, because
  `cli.ts` runs `main()` the moment it is imported and the tests have to import them.
  `runCapabilityAction` folds `--patient` into the args *after* coercion — the registry declares
  `patient`, not each capability, so coercing it would trip the unknown-argument check. The library
  exposes the same set as
  `MyChartClient.runCapability(id, args)` plus a typed method per capability. See
  [`docs/cli.md`](cli.md) and `npm-package/README.md`.
- **Claude Desktop extension** (`claude-desktop-extension/`) — `registerAllTools` (`src/tools.ts`)
  hand-writes only the account-management meta tools (`list_accounts`, `setup_account`,
  `complete_2fa`, `disconnect_account`), which manage credentials on this machine
  and have no counterpart in the other clients; everything else is one MCP tool per registry entry,
  with the parameter list translated to zod. Includes an interactive setup widget with a tool-call
  fallback for non-widget clients. Credentials live in `~/.openrecord-mcpb/`, **keyed by (hostname,
  username), never by hostname alone** — one hostname routinely carries several logins (a household
  sharing a health system), and each keeps its own `accounts.json` row, passkey file
  (`passkeys/<hostname>/<username>.json`) and session file. Setting up a second username never
  replaces or deletes the first one's login data: a hostname-keyed passkey would hand the previous
  user's WebAuthn credential to whoever registered last, and silent login would then read the wrong
  patient's chart. The account id tools accept is `username@hostname`, resolved by `lookupAccount`
  in `src/credential-store.ts` on a perfect hostname + username match or not at all — no
  hostname-only or fuzzy fallback. `search_mycharts` is a registry capability rather than a meta
  tool, and offers a built-in **Springfield General Hospital (test)** instance pointing at
  `fake-mychart.fanpierlabs.com` (`SANDBOX_INSTANCE` in
  `scrapers/list-all-mycharts/searchDirectory.ts`). See `claude-desktop-extension/README.md`.
- **Mobile app** (`expo-app/`) — tools come from `src/lib/ai/tool-catalog.ts`, derived from the
  registry and kept free of React Native imports so tests can read it;
  `src/lib/scrapers/session-manager.ts` dispatches every one through `executeCapability`, and
  `executeAccountCapability` drives the `account`-kind ones from the settings screen. **AI requires
  Google sign-in — all providers, BYO keys included**, because signing in is what unlocks the
  $50/month included credit: the free tier POSTs to the OpenRecord AI Lambda with the user's Google
  ID token attached (`backendUrl` in `expo-app/app.config.ts`, override with
  `EXPO_PUBLIC_BACKEND_URL`), and the Lambda verifies the token server-side — the client is never
  trusted about identity. Tokens live ~1h; `getFreshIdToken()`
  (`src/lib/backend/google-signin.ts`) silently re-signs-in to refresh. BYO-key providers call
  OpenAI/Anthropic/Gemini directly. Everything else lives on-device.
