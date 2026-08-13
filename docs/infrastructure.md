# Infrastructure & Deployment

**AWS account**: fanpierlabs (`aws --profile fanpierlabs`), region `us-east-2`.

Read-only AWS calls are fine at any time. **Never create, update, or delete AWS resources without
explicit user direction** — see the rules in `CLAUDE.md`.

## Fake MyChart (`fake-mychart/`)

Fargate app, deployed independently. **Run the deploy script from inside `fake-mychart/`** so the
relative `Dockerfile` path resolves to `fake-mychart/Dockerfile`:

```bash
cd fake-mychart && bun install && bun run deploy
```

Domain: `fake-mychart.fanpierlabs.com` (its own ALB + ECS service `fake-mychart-service` in cluster
`fake-mychart-cluster`). Uses its own `deploy` dev dependency and `deploy.yaml`.

## Static splash page + interactive demo (`openrecord-splash/`)

`openrecord.fanpierlabs.com` serves a static site — two halves on purpose: `index.html` is a
hand-written self-contained splash with no build step, and `demo/` is a React + TypeScript app built
with Vite. On S3 + CloudFront, following the standard Fan Pier Labs static-site pattern
(`people-monitor-tool`, `autoinsights`, …).

- Bucket `openrecord-fanpierlabs-com` (us-east-2, private) → CloudFront `EXUZ8GHUQ9ULF`
  (OAC `E1X3K4LP97988Z`, wildcard `*.fanpierlabs.com` cert).
- Deploy: `cd openrecord-splash && AWS_PROFILE=fanpierlabs ./deploy.sh` — it typechecks, builds the
  demo into `dist/`, then uploads `index.html`, `demo.html`, the hashed assets, and the
  icons/share card/manifest, setting content types explicitly (a `.js` served as
  `binary/octet-stream` is refused by the browser's module loader). Hashed assets get a one-year
  immutable cache; the HTML and fixed-name assets are invalidated.
- Splash is presentational — no auth. Waitlist form posts to the shared `fanpierlabs-forms` Lambda
  (`https://ns8remz3t7.execute-api.us-east-2.amazonaws.com`), which is not in this repo.
- **The demo lives at `/demo.html`, not `/demo`** — the default root object only applies to `/`, and
  the 403/404 → `/index.html` error handling would otherwise quietly serve the splash.
- **The splash deliberately does not link to the demo.** `/demo.html` deploys with every push but is
  unadvertised, so it is reached by sharing the URL. Don't "fix" the missing CTA — putting the demo
  on the homepage is a product decision to make on purpose.
- **Share previews + PWA assets**: `og-image.png` (1200×630 card), `favicon.ico`, `icon.svg`,
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `manifest.json`. The PNGs are generated but
  committed — run `cd openrecord-splash && ./generate-assets.sh` after editing `icon.svg` or
  `assets-src/og-image.html`. It renders the card with headless Chrome and the icons with
  `rsvg-convert` (`brew install librsvg`). `og:image` must be an **absolute** `https://` URL —
  iMessage and Slack will not resolve a relative path. `deploy.sh` uploads and invalidates every
  asset; `openrecord-splash/__tests__/metadata.unit.test.ts` fails if one is referenced but not
  deployed.

### Interactive demo (`openrecord-splash/demo/`)

A complete OpenRecord session running in the browser against a fictional patient (Homer Simpson), so
people can try the product before installing anything. Re-creates **both clients** — the iOS app and
the Claude Desktop extension — sharing one session, so a refill requested on the phone shows up in
the desktop chat.

**React 19 + TypeScript, built with Vite.** `strict` everywhere; `npx tsc --noEmit` runs as part of
the build and of `deploy.sh`, so the demo cannot ship with a type error. Build output goes to
`openrecord-splash/dist/` (gitignored). React, its types, and the build toolchain (`vite`,
`@vitejs/plugin-react`, `@types/bun`) resolve from the **root** `package.json` — the demo's own
manifest is script-only.

Logic modules are framework-free and fully unit-tested: `src/data.ts` (the fictional record; payload
shapes elsewhere derive from it with `typeof` so they can't drift), `src/types.ts`, `src/tools.ts`
(all 46 MyChart tools — **write tools genuinely mutate session state**), `src/agent.ts` (a faithful
port of `expo-app/src/lib/ai/claude-client.ts`: same JSON tool-call protocol, read batching,
exclusive write tools, `respond` terminator), `src/stream.ts` (reveals a finished reply at model
pace using `setTimeout`, **not** `requestAnimationFrame` — rAF is paused in background tabs, so a
visitor who switches away mid-reply would return to a message frozen half-written), `src/skills.ts`,
and `src/markdown.ts` (parses replies into a typed tree; produces no HTML).

Components: `src/App.tsx` (shell — owns the session, surface switching, the shared tool-call activity
panel; both surfaces stay mounted and toggled with `hidden` so switching clients preserves each
conversation), `IosSurface.tsx` / `DesktopSurface.tsx`, `Markdown.tsx`, and `Radiograph.tsx` (the
chest X-ray, drawn procedurally on a canvas rather than shipped as a file, labelled as simulated).
`src/config.ts` resolves `AI_ENDPOINT` from `?ai=<url>`, then `VITE_AI_ENDPOINT`, then the baked-in
default.

**Every reply is a real model call — there is deliberately no canned-response path.** An earlier
version fell back to a keyword table when no model was reachable, and it produced confident non
sequiturs the moment a visitor asked something it hadn't anticipated. A failed call now surfaces an
honest error and the badge reads "Model unreachable". **The demo also starts on a connected
account** — the onboarding and extension-setup flows belong to the product, not the demo.

**Security:** model output is untrusted. `markdown.ts` parses it into a typed tree and
`Markdown.tsx` renders that tree as React elements, so React escapes every text node. **There is no
`dangerouslySetInnerHTML` in the demo and there must never be one.** Tests assert that markup in
model output stays text.

Local dev: `cd openrecord-splash/demo && npx vite` (serves `/demo.html` with hot reload).

## OpenRecord AI Lambda (`openrecord-demo-lambda/`)

Zero-dep Lambda backing both the demo's chat turns and the **mobile app's free tier**. Takes
`{ system, messages, model? }` and returns `{ text }` — a provider-neutral shape, so the demo's and
the app's agent loops stay identical.

- Endpoint: `https://dur15eh31e.execute-api.us-east-2.amazonaws.com` (baked into
  `openrecord-splash/demo/src/config.ts` and `expo-app/app.config.ts`).
- **Two tiers.** Unauthenticated (the browser demo): `gemini-2.5-flash` / `gemini-2.5-flash-lite`,
  per-IP rate limit (40 req / 10 min). Signed-in (the mobile app): the request carries a Google ID
  token as `Authorization: Bearer`, verified server-side in `src/google-auth.mjs` against Google's
  JWKS (signature, issuer, audience = our OAuth client ids, expiry) — never trust the client about
  identity. Verified users additionally get **`gemini-2.5-pro`**, a higher per-account rate limit
  (120 req / 10 min), and the **$50/month included credit**, metered per Google account × calendar
  month in the `openrecord-ai-spend` DynamoDB table (`src/spend.mjs`, on-demand billing; the AWS SDK
  comes from the Lambda runtime, imported lazily so local tests stay dependency-free). Over the cap
  → 402. `GET` with a valid token returns `{ spentCents, limitCents, remainingCents, period }` for
  the app's settings screen. Invalid/expired tokens → 401 (the app silently refreshes and retries),
  unauth request for pro → 403.
- Model: **`gemini-2.5-flash` with `thinkingBudget: 0`** by default; override with
  `DEMO_MODEL=... ./deploy.sh`. Flash-lite as the *primary* model was tried and rejected: it
  completed 23/40 of the demo's own suggested prompts against flash's 40/40. See
  `openrecord-demo-lambda/README.md`.
- Reuses the existing `GEMINI_API_KEY` secret, read at deploy time and set as a function env var (so
  the Lambda needs no Secrets Manager permissions). Google OAuth client ids and the spend table name
  are also env vars set by `deploy.sh` (`GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`,
  `SPEND_TABLE`, optional `SPEND_LIMIT_CENTS`).
- Public endpoint, so it's treated as hostile input: a server-side guard preamble is prepended to
  whatever system prompt the client sends (worded to fit both the fictional-patient demo and the
  app's real-record sessions), plus the rate limits above, a per-container global cap, and hard size
  caps. Upstream error bodies are never forwarded (they can echo the key's project id).
- Deploy: `cd openrecord-demo-lambda && AWS_PROFILE=fanpierlabs ./deploy.sh`. Creates/updates the
  `openrecord-demo-ai` Lambda, the `openrecord-demo-ai-api` HTTP API, the `openrecord-ai-spend`
  DynamoDB table, and the role's table access, then prints the endpoint — if it changed, update the
  two baked-in configs above and redeploy the splash site.
- Usage/cost: `fields @timestamp, @message | filter @message like /demo_ai_call/ | sort @timestamp desc`
  on `/aws/lambda/openrecord-demo-ai` (`authed: true|false` per call).
- **Any proxy failure surfaces an honest error in the chat** and flips the header badge to "Model
  unreachable". The demo has no offline path by design.

## S3 buckets (us-east-2)

- **mychart-connector** (`arn:aws:s3:::mychart-connector`) — `mychart-logos/` holds logos for all
  MyChart instances, uploaded by `scrapers/list-all-mycharts/fetch-mychart-instances.ts`.
- **openrecord-fanpierlabs-com** (`arn:aws:s3:::openrecord-fanpierlabs-com`) — the static splash and
  demo, plus `mcpb/` — the Claude Desktop extension's release channel
  (`openrecord-<version>.mcpb` immutable artifacts, the stable `openrecord.mcpb`, and `latest.json`,
  all written only by `claude-desktop-extension/release.sh`; installed extensions poll `latest.json`
  for update notices). Private; served only via CloudFront `EXUZ8GHUQ9ULF` (OAC). The splash deploy
  uploads named files only, so it never touches `mcpb/`.

## Secrets (AWS Secrets Manager, us-east-2)

| Secret | ARN | Used for |
| --- | --- | --- |
| `RESEND_API_KEY` | `arn:aws:secretsmanager:us-east-2:555985150976:secret:RESEND_API_KEY-vKJonO` | CLI autonomous 2FA code retrieval via Resend inbound email (`healthapp@bocuedpo.resend.app`) |
| `GEMINI_API_KEY` | `arn:aws:secretsmanager:us-east-2:555985150976:secret:GEMINI_API_KEY-GPbdf6` | The `openrecord-demo-ai` Lambda, which copies it into a function env var at deploy time |
| `EXPO_TOKEN` | `arn:aws:secretsmanager:us-east-2:555985150976:secret:EXPO_TOKEN-XYwf9T` | EAS CLI builds and TestFlight submissions (`EXPO_TOKEN` env var) |
| `APPLE_CREDENTIALS` | `arn:aws:secretsmanager:us-east-2:555985150976:secret:APPLE_CREDENTIALS-GZhHoo` | Apple Developer credentials (appleId, appleTeamId) for iOS builds and App Store submissions |
| `APPLE_APP_SPECIFIC_PASSWORD` | `arn:aws:secretsmanager:us-east-2:066949051862:secret:APPLE_APP_SPECIFIC_PASSWORD-fZNTNC` | App Store Connect / TestFlight CLI uploads (ryanhughes624) |
