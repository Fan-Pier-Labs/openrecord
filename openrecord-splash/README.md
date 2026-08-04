# openrecord-splash

The static site served at **https://openrecord.fanpierlabs.com/** — a marketing splash
plus a fully interactive product demo.

This replaces the old Next.js web app at that hostname. No build step: `index.html` is
self-contained (inline CSS + vanilla JS) and the demo is plain ES modules. Hosted on S3
behind CloudFront, following the same low-cost, zero-server pattern as the other Fan Pier
Labs marketing sites (`people-monitor-tool`, `autoinsights`, `auto-label-emails`).

```
index.html      marketing splash
demo.html       interactive demo page
demo/           the demo's ES modules + stylesheet
```

## The splash (`index.html`)

- **Presentational only** — hero, demo band, feature grid, privacy section, 3-step timeline, CTA, footer.
- **Waitlist form** posts to the shared `fanpierlabs-forms` Lambda (emails `ryan@fanpierlabs.com`
  and logs to CloudWatch). Endpoint: `https://ns8remz3t7.execute-api.us-east-2.amazonaws.com`,
  payload `{ site: "openrecord", name, email }`. A hidden `company` honeypot drops bots client-side.
- **No auth** — sign in / sign up were removed. "Get Notified" scrolls to the waitlist.
- **Download buttons** for iOS & Android are scaffolded in the hero (`href="#"` placeholders) —
  swap in real App Store / Google Play URLs when the apps ship.

## The demo (`demo.html` + `demo/`)

A complete OpenRecord session in the browser, against a fictional patient. It re-creates
both clients — the iOS app (`expo-app/`) and the Claude Desktop extension
(`claude-desktop-extension/`) — sharing one session, so a refill requested on the phone
shows up in the desktop chat.

| File | What it is |
| --- | --- |
| `demo/data.js` | The fictional record. Ported from `web/src/lib/mcp/demo-data.ts` and extended with lab trends and a longer billing ledger. |
| `demo/tools.js` | All 46 MyChart tools over that record. Write tools genuinely mutate session state. |
| `demo/agent.js` | The agent loop — a faithful port of `expo-app/src/lib/ai/claude-client.ts`, including the JSON tool-call protocol, read batching, and exclusive write tools. |
| `demo/scripted.js` | Offline fallback. Runs the *same real tool calls* and renders the *same real data*; only the prose is pre-written. |
| `demo/skills.js` | The three skill playbooks, ported from `expo-app/src/lib/skills/catalog.ts`. |
| `demo/ios.js`, `demo/desktop.js` | The two device surfaces. |
| `demo/ui.js` | Shared rendering — including the strict markdown renderer and the procedurally drawn radiograph. |
| `demo/main.js` | Boot, surface switching, the shared tool-call activity panel. |
| `demo/config.js` | `AI_ENDPOINT`. Empty means scripted-only. |

**Everything is fictional.** No portal is contacted, nothing is persisted, and reloading
starts over. The header carries a "Fictional data" badge, and any reply the scripted
engine produced is labelled as such under the message.

### Wiring up the model

The demo calls [`openrecord-demo-lambda`](../openrecord-demo-lambda) for chat turns. Set
`AI_ENDPOINT` in `demo/config.js` to that endpoint. With it empty the demo still works —
it runs on the scripted engine and the header badge says "Scripted replies" instead of
"Live model".

Any proxy failure (down, rate limited, over quota) finishes the turn on the scripted
engine rather than surfacing an error, so an outage degrades the demo instead of
breaking it.

### Running it locally

```bash
cd openrecord-splash && python3 -m http.server 8080
```

Then open `http://localhost:8080/demo.html`. ES modules need a real origin — opening the
file over `file://` will not work. To point at a local or deployed model proxy without
editing `config.js`, append `?ai=<url>`.

### Security note

Model output is untrusted text. `demo/ui.js` escapes every HTML-significant character
before applying a fixed markdown whitelist, and `el()` throws if you hand it raw HTML.
There is no raw-HTML path anywhere in the demo — keep it that way.

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

Uploads `index.html`, `demo.html`, and everything under `demo/` to the bucket, then
invalidates the CloudFront cache. Content types are set explicitly — S3 guesses
`binary/octet-stream` for unknown extensions, and a `.js` served as anything but a
JavaScript MIME type is refused by the browser's ES-module loader, which would break the
demo while leaving the splash page looking fine.

Note the demo lives at `/demo.html`, not `/demo`. The distribution's default root object
only applies to `/`, so there is no directory-index behaviour for subpaths, and the
403/404 → `/index.html` error handling would quietly serve the splash page instead.

## Reading waitlist signups

The `fanpierlabs-forms` Lambda emails each signup and logs it to CloudWatch
(`/aws/lambda/fanpierlabs-forms`, filter `FORM_SUBMISSION`). This repo does not own that
Lambda — see the `fanpierlabs-projects-email-submission` project.
