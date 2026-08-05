# newsletter-lambda

A tiny AWS Lambda that captures newsletter/waitlist signups from the OpenRecord
login page (`web/src/app/login/page.tsx`) and writes them to **CloudWatch Logs**.
Replaces the previous Formspree integration (which was quota-limited).

## How it works

```
browser form  ──POST {name,email}──▶  API Gateway HTTP API  ──▶  Lambda  ──console.log──▶  CloudWatch Logs
```

The handler (`src/handler.mjs`) is zero-dependency: it validates the payload and
`console.log`s a structured JSON line, which Lambda automatically ships to the log
group `/aws/lambda/newsletter-signup`. There is no database — signups live in the
logs.

### Why API Gateway and not a Lambda Function URL?

The original plan was a public Lambda **Function URL** (no API Gateway). This AWS
account **blocks unauthenticated (`auth-type NONE`) Function URL access at the
account level** — a correctly-configured public Function URL still returns
`403 AccessDeniedException` (a SigV4-signed request to the same URL returns 200,
confirming the block is anonymous-access-specific). API Gateway invokes the Lambda
as the authenticated `apigateway.amazonaws.com` principal, so the public ingress
works. The Lambda payload format (v2.0) is identical, so the handler is unchanged.

## Deploy

```bash
AWS_PROFILE=fanpierlabs ./deploy.sh
```

Idempotent — re-running updates the function code and re-applies the API config.
It creates/updates: the IAM role `newsletter-lambda-role`, the Lambda
`newsletter-signup` (Node.js 22), and the HTTP API `newsletter-signup-api` with
wide-open CORS (`AllowOrigins=*` — CORS doesn't protect a public sink anyway, and
this lets local dev / any origin post). It prints the public endpoint at the end.

Current endpoint: `https://a4443h7zdd.execute-api.us-east-2.amazonaws.com`
(Region `us-east-2`, account `555985150976`.)

To point the frontend at a different endpoint, set
`NEXT_PUBLIC_NEWSLETTER_ENDPOINT` at build time; otherwise the URL above is used.

## Reading signups

CloudWatch Logs Insights, log group `/aws/lambda/newsletter-signup`:

```
fields @timestamp, @message
| filter @message like /newsletter_signup/
| sort @timestamp desc
```

Or from the CLI:

```bash
aws --profile fanpierlabs --region us-east-2 logs filter-log-events \
  --log-group-name /aws/lambda/newsletter-signup \
  --filter-pattern 'newsletter_signup' \
  --query 'events[].message' --output text
```

Each line is JSON: `{ type, name, email, ts, ip, ua }`.

## Anti-spam

The form includes a hidden `company` honeypot field. Real users never fill it;
bots do. Submissions with `company` set get a `200 {ok:true}` (so the bot thinks it
worked) but are **not logged**.

## Caveat

This is a **log, not a datastore** — great for low-volume waitlist capture and
eyeballing/querying via Insights. If you later want to *email* the waitlist (e.g. a
"we're live!" blast), move the sink to Postgres or a Resend Audience; the repo
already has both wired up (`web/src/lib/db.ts`, `web/src/lib/email.ts`).

## Tests

```bash
bun test src/__tests__/
```
