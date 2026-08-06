# openrecord-splash

The static site served at **https://openrecord.fanpierlabs.com/** — a marketing splash
plus a fully interactive product demo.

This replaces the old Next.js web app at that hostname. Hosted on S3 behind CloudFront,
following the same low-cost, zero-server pattern as the other Fan Pier Labs marketing
sites (`people-monitor-tool`, `autoinsights`, `auto-label-emails`).

Two halves with different build stories, on purpose: the splash is a single
self-contained HTML file that anyone can edit and ship in seconds, while the demo is a
real React + TypeScript app because it is a real application.

```
index.html      marketing splash — hand-written, no build step
demo/           React + TypeScript demo (Vite)
  demo.html       entry HTML
  src/            application source
  __tests__/      unit tests (bun)
dist/           build output — gitignored, produced by deploy.sh
```

## The splash (`index.html`)

- **Presentational only** — hero, demo band, feature grid, privacy section, 3-step timeline, CTA, footer.
- **Waitlist form** posts to the shared `fanpierlabs-forms` Lambda (emails `ryan@fanpierlabs.com`
  and logs to CloudWatch). Endpoint: `https://ns8remz3t7.execute-api.us-east-2.amazonaws.com`,
  payload `{ site: "openrecord", name, email }`. A hidden `company` honeypot drops bots client-side.
- **No auth** — sign in / sign up were removed. "Get Notified" scrolls to the waitlist.
- **Download buttons** for iOS & Android are scaffolded in the hero (`href="#"` placeholders) —
  swap in real App Store / Google Play URLs when the apps ship.

## The demo (`demo/`)

A complete OpenRecord session in the browser, against a fictional patient. It re-creates
both clients — the iOS app (`expo-app/`) and the Claude Desktop extension
(`claude-desktop-extension/`) — sharing one session, so a refill requested on the phone
shows up in the desktop chat.

React 19 + TypeScript, built with Vite. Everything is `strict`, and `bun run typecheck`
is part of `build`, so the demo cannot ship with a type error.

### Logic (framework-free, fully unit-tested)

| File | What it is |
| --- | --- |
| `src/data.ts` | The fictional record. Ported from `web/src/lib/mcp/demo-data.ts` and extended with lab trends and a longer billing ledger. |
| `src/types.ts` | Shared types for the record, the tool layer, and the agent loop. |
| `src/tools.ts` | All 46 MyChart tools over that record. Write tools genuinely mutate session state. |
| `src/agent.ts` | The agent loop — a faithful port of `expo-app/src/lib/ai/claude-client.ts`, including the JSON tool-call protocol, read batching, and exclusive write tools. |
| `src/stream.ts` | Reveals a finished reply at the pace a model would have produced it. |
| `src/skills.ts` | The three skill playbooks, ported from `expo-app/src/lib/skills/catalog.ts`, plus the home-screen alert cards. |
| `src/markdown.ts` | Parses assistant replies into a typed tree. Produces no HTML. |
| `src/display.ts` | Formatting helpers for the activity panel and tool disclosures. |
| `src/config.ts` | `AI_ENDPOINT`. Required — without it the demo cannot answer and says so. |

### Components

| File | What it is |
| --- | --- |
| `src/App.tsx` | Shell — owns the session, surface switching, and the shared tool-call activity panel. |
| `src/components/IosSurface.tsx` | The iPhone app: chat, alerts, skills, insights, drawer, settings. |
| `src/components/DesktopSurface.tsx` | Claude Desktop: chat with tool disclosures, the tool catalogue, connector settings. |
| `src/components/Markdown.tsx` | Renders the parsed tree as React elements. |
| `src/components/Radiograph.tsx` | The procedurally drawn chest X-ray. |

**Everything is fictional.** No portal is contacted, nothing is persisted, and reloading
starts over. The header carries a "Fictional data" badge.

**Every reply is a real model call.** There is deliberately no canned-response path. An
earlier version fell back to a keyword table when no model was reachable, which produced
confident non sequiturs the moment a visitor asked something it hadn't anticipated — ask
it who one of the doctors is and it would answer with a summary of the whole record. An
honest error is better than a fluent wrong answer, so a failed call says so and the badge
reads "Model unreachable".

**The demo starts on a connected account.** The onboarding and extension-setup flows
belong to the product, not the demo; making visitors click through sign-in, 2FA, and
passkey registration before they can ask anything buries the part worth showing.

### Wiring up the model

The demo calls [`openrecord-demo-lambda`](../openrecord-demo-lambda) for chat turns, and
cannot answer anything without it. The endpoint is resolved in this order:

1. `?ai=<url>` on the demo URL — handy for pointing at a local proxy.
2. `VITE_AI_ENDPOINT` at dev or build time.
3. `DEFAULT_AI_ENDPOINT` in `demo/src/config.ts`.

With none of them set the badge reads "No model configured" and every turn fails
explicitly, rather than the demo pretending to work.

Replies arrive whole from the proxy, so `stream.ts` reveals them on a timer at roughly a
fast model's token rate. It uses `setTimeout` rather than `requestAnimationFrame` on
purpose: rAF is paused entirely in a background tab, so a visitor who switches away
mid-reply would come back to a message frozen half-written. The reveal is derived from
elapsed time rather than tick count, so throttling costs smoothness but never
correctness.

### Running it locally

```bash
cd openrecord-splash/demo && npx vite
```

Vite serves the demo at `/demo.html` with hot reload. To point at a local or deployed
model proxy without editing `config.ts`, append `?ai=<url>`.

Other commands, all from `openrecord-splash/demo`:

```bash
npx tsc --noEmit -p tsconfig.json   # typecheck
npx vite build                       # production build into ../dist
bun test --isolate __tests__/        # unit tests
```

The unit tests also run from the repo root as part of `bun run test`.

### Security note

Model output is untrusted text. `src/markdown.ts` parses it into a typed tree and
`Markdown.tsx` renders that tree as React elements, so every text node is escaped by
React on the way out. **There is no `dangerouslySetInnerHTML` anywhere in the demo, and
there must never be one** — this is a health app, and prompt-injected markup reaching the
DOM is not an acceptable failure mode. The parser is covered by tests that assert markup
in model output stays text.

## Infrastructure (AWS account `fanpierlabs`, us-east-2)

| Resource | Value |
| --- | --- |
| S3 bucket | `openrecord-fanpierlabs-com` (private, Block Public Access on) |
| Access | CloudFront **OAC** `E1X3K4LP97988Z` (bucket policy scopes reads to the distribution) |
| CloudFront distribution | `EXUZ8GHUQ9ULF` (`d2ikmi5y8ff6yf.cloudfront.net`) |
| Alias | `openrecord.fanpierlabs.com` |
| TLS cert | `*.fanpierlabs.com` wildcard, ACM us-east-1 `9f7bca9a-6bd4-40a8-862a-6ad4debd3a1b` |
| Cache policy | Managed **CachingOptimized** (`658327ea-…`) |
| Error handling | 403 & 404 → `/index.html` (200) |

## Deploy

```bash
AWS_PROFILE=fanpierlabs ./deploy.sh
```

Typechecks and builds the demo, then uploads `index.html`, the built `demo.html`, and
the hashed assets, and invalidates the CloudFront cache. Content types are set explicitly
— S3 guesses `binary/octet-stream` for unknown extensions, and a `.js` served as anything
but a JavaScript MIME type is refused by the browser's module loader, which would break
the demo while leaving the splash page looking fine.

Vite fingerprints asset filenames, so assets get a one-year immutable cache and only the
two HTML entry points need invalidating.

Note the demo lives at `/demo.html`, not `/demo`. The distribution's default root object
only applies to `/`, so there is no directory-index behaviour for subpaths, and the
403/404 → `/index.html` error handling would quietly serve the splash page instead.

## Reading waitlist signups

The `fanpierlabs-forms` Lambda emails each signup and logs it to CloudWatch
(`/aws/lambda/fanpierlabs-forms`, filter `FORM_SUBMISSION`). This repo does not own that
Lambda — see the `fanpierlabs-projects-email-submission` project.
