# openrecord-demo-lambda

The model proxy behind the public OpenRecord demo at
**https://openrecord.fanpierlabs.com/demo.html**.

The demo runs entirely in the browser: the fictional health record, the 45-tool
MyChart layer, and the agent loop all live in `openrecord-splash/demo/`. The one
thing a static page can't do is call a model, which is all this Lambda is for.

## Contract

```
POST /
Content-Type: application/json

{ "system": "<system prompt>", "messages": [{ "role": "user", "content": "..." }] }
→ 200 { "text": "<model output>", "model": "gemini-2.5-flash-lite" }
```

Deliberately the same provider-neutral shape the web app's `/api/ai` uses, so
the demo's agent loop is a straight port of the iOS app's rather than a special
case. Swap the upstream in `buildGeminiRequest`/`extractText` to change models.

Error responses are `{ "error": "..." }` with a 4xx/5xx status. The demo has no
offline path — every reply is a real model call — so an outage here shows an
honest error in the chat and flips its header badge to "Model unreachable". That
is deliberate: a canned-response fallback produced confident non sequiturs
whenever a visitor asked something it hadn't anticipated.

## Model

`gemini-2.5-flash-lite` with `thinkingBudget: 0` — the cheapest and fastest tier
available. The demo's agent loop is mechanical (emit JSON tool calls, read
results, emit more), so reasoning depth buys much less here than latency does.
Override per-deploy with `DEMO_MODEL=... ./deploy.sh`.

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
