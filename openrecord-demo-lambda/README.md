# openrecord-demo-lambda

The model proxy behind every OpenRecord surface that needs a hosted model:

- the public demo at **https://openrecord.fanpierlabs.com/demo.html**, whose
  fictional health record, 45-tool MyChart layer, and agent loop all live in
  `openrecord-splash/demo/` — the one thing a static page can't do is call a
  model, and
- the iOS app's **free tier** (`expo-app/`), whose agent loop runs on-device
  against the user's real record. The record is scraped locally; only what the
  client puts in the prompt reaches this Lambda.

Current endpoint: `https://dur15eh31e.execute-api.us-east-2.amazonaws.com`
(baked into `openrecord-splash/demo/src/config.ts` and `expo-app/app.config.ts`).

## Contract

```
POST /
Content-Type: application/json
Authorization: Bearer <google id token>        # optional — unlocks the signed-in tier

{ "system": "<system prompt>", "messages": [{ "role": "user", "content": "..." }], "model": "gemini-2.5-flash-lite" }
→ 200 { "text": "<model output>", "model": "gemini-2.5-flash-lite" }

GET /                                          # requires a valid token
→ 200 { "spentCents": 55, "limitCents": 5000, "remainingCents": 4945, "period": "2026-08" }
```

The provider-neutral shape keeps the demo's and the app's agent loops identical.
Swap the upstream in `buildGeminiRequest`/`extractText` to change models.

## Tiers

| | Unauthenticated (demo) | Signed-in (iOS app) |
|---|---|---|
| Identity | none | Google ID token, verified server-side (`google-auth.mjs`: signature vs Google's JWKS, issuer, audience, expiry) |
| Models | `gemini-2.5-flash`, `gemini-2.5-flash-lite` | + `gemini-2.5-pro` |
| Rate limit | 40 req / 10 min per IP | 120 req / 10 min per Google account |
| Spend | — | $50/month included credit, metered per account × month in the `openrecord-ai-spend` DynamoDB table (`spend.mjs`); 402 once used up |

An invalid or expired token is a 401 — never a silent downgrade — so the app
knows to silently refresh the token and retry. An unauthenticated request for
`gemini-2.5-pro` is a 403; an unknown model is a 400. The iOS app uses the lite
model for cheap side calls like chat titles.

The DynamoDB client comes from the AWS SDK bundled in the Lambda Node runtime
and is imported lazily, so the source stays zero-dependency and local `bun test`
runs against an in-memory store.

Error responses are `{ "error": "..." }` with a 4xx/5xx status. The demo has no
offline path — every reply is a real model call — so an outage here shows an
honest error in the chat and flips its header badge to "Model unreachable". That
is deliberate: a canned-response fallback produced confident non sequiturs
whenever a visitor asked something it hadn't anticipated.

## Model

`gemini-2.5-flash` with `thinkingBudget: 0`. Override per-deploy with
`DEMO_MODEL=... ./deploy.sh`.

This was `gemini-2.5-flash-lite`, on the theory that the agent loop is
mechanical enough (emit JSON tool calls, read results, emit more) that
reasoning depth buys less than latency. Measured against the demo's own
suggested prompts, that was wrong: flash-lite completed 23/40 of them, flash
40/40. The flash-lite failures were the bad kind — it would answer "I've listed
your current medications" without listing any. A landing-page demo that
mis-answers 4 questions in 10 costs more than the model does.

Flash is ~3x the input price and ~6x the output price, but the demo's traffic
is tiny and input-dominated (~26 input tokens per output token, because the
system prompt carries 46 tool definitions), so the real difference is fractions
of a cent per conversation. Flash also derails less, so it burns fewer retries.

## Abuse controls

The endpoint is public and unauthenticated, so it's treated as hostile input:

| Control | Value | Why |
| --- | --- | --- |
| Guard preamble | prepended server-side | The client sends the system prompt. A server-side preamble scopes the assistant to the demo so the endpoint isn't a free general-purpose model. |
| Per-IP rate limit | 40 requests / 10 min | ~5-10 demo conversations. Returns 429 with `Retry-After`. |
| Global cap | 1500 / 10 min | Backstop against load spread over many IPs. Counted in DynamoDB, so it holds across containers. |
| Message count | 40 | |
| Message length | 24,000 chars | |
| Total conversation | 160,000 chars | |
| Output tokens | 2048 | |
| Upstream timeout | 25s | |

The two limits are kept in different places on purpose.

**Per-IP** state is in memory, per-container, and resets on cold start. It is
leaky by design: it runs on every request, a shared counter would mean a write
per request per caller, and the worst case is that a caller spread across
several containers gets a few extra calls.

**The global cap** is the one that actually bounds the bill, so it is counted in
DynamoDB — one item per 10-minute window, atomically incremented, TTL'd once the
window closes. In memory it capped each container separately, which meant the
real ceiling was 1500 × however many containers Lambda happened to be running —
i.e. no ceiling at all under exactly the traffic spike it exists to survive.

It is checked *after* the per-IP bucket, so a single-IP flood costs no writes,
and it fails open: if DynamoDB is unreachable the request is served, the failure
is logged as `demo_ai_global_limit_error`, and the old per-container count
applies. A metering outage should not become a product outage.

Upstream error bodies are never forwarded to the client (they can echo the
key's project id); they go to CloudWatch instead.

## Deploy

```bash
cd openrecord-demo-lambda && AWS_PROFILE=fanpierlabs ./deploy.sh
```

Creates/updates the `openrecord-demo-ai` Lambda and the `openrecord-demo-ai-api`
HTTP API. The script reads the existing `GEMINI_API_KEY` secret from Secrets
Manager and sets it as a function env var, so the Lambda needs no Secrets
Manager permissions and stays dependency-free.

It prints the endpoint at the end. Paste that into
`openrecord-splash/demo/config.js` as `AI_ENDPOINT` and redeploy the splash
site.

## Reading usage

Every call logs one structured line to `/aws/lambda/openrecord-demo-ai`:

```
fields @timestamp, @message | filter @message like /demo_ai_call/ | sort @timestamp desc
```

Each line carries the model, turn count, and input/output token counts, which is
enough to track spend. Errors log as `demo_ai_upstream_error` /
`demo_ai_transport_error`.
