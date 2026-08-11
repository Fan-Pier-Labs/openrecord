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

{ "system": "<system prompt>", "messages": [{ "role": "user", "content": "..." }], "model": "gemini-2.5-flash-lite" }
→ 200 { "text": "<model output>", "model": "gemini-2.5-flash-lite" }
```

`model` is optional and allow-listed (`gemini-2.5-flash`, `gemini-2.5-flash-lite`);
anything else is a 400 so a caller can't request an expensive model. The iOS app
uses the lite model for cheap side calls like chat titles. The provider-neutral
shape keeps the demo's and the app's agent loops identical. Swap the upstream in
`buildGeminiRequest`/`extractText` to change models.

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
| Per-container global cap | 1500 / 10 min | Backstop against load spread over many IPs. |
| Message count | 40 | |
| Message length | 24,000 chars | |
| Total conversation | 160,000 chars | |
| Output tokens | 2048 | |
| Upstream timeout | 25s | |

Rate-limit state is per-container and resets on cold start. That's leaky by
design — precise limits would need a datastore, and the cost ceiling here is a
few dollars, not a few thousand.

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
