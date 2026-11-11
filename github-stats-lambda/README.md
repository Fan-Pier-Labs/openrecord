# github-stats-lambda

A weekly snapshot of `Fan-Pier-Labs/openrecord`, written to CloudWatch as one JSON line per item:
every issue and PR (author, state, dates, link), every fork (owner, link), and recent stars.

- Lambda `openrecord-github-stats` (Python 3.13, no dependencies), account `fanpierlabs`, `us-east-2`
- EventBridge rule `openrecord-github-stats-weekly`: Mondays 14:00 UTC
- Log group `/aws/lambda/openrecord-github-stats`, no retention limit, so snapshots are kept forever

Deploy: `AWS_PROFILE=fanpierlabs ./deploy.sh` (idempotent). Run it now:
`aws --profile fanpierlabs --region us-east-2 lambda invoke --function-name openrecord-github-stats --invocation-type Event /dev/null`

## No token, on purpose

Every call is unauthenticated, so there is no secret to store or rotate. Two consequences:

- **Stars come from the events feed, not `/stargazers`.** GitHub now answers `/stargazers` with 401
  when no token is sent, and the stargazers web page returns 404 when you are signed out. The
  public `/events` feed does list each star as a `WatchEvent` (who starred it, and when). It only
  covers the last 300 events (about 4 weeks of this repo's activity), so each weekly run logs
  the recent stars, not the full list. Taken together, the weekly snapshots record every new star.
- **A run can hit the limit of 60 requests per hour per IP.** Lambda's outgoing IP addresses are
  shared with other AWS customers, so the hour's allowance may already be spent before a run starts.
  The handler waits for the limit to reset. If the wait is longer than the time left in the
  invocation, it starts a new invocation of itself, up to 8 in a row (about 2 hours in total).
  Nothing is printed until every list has been fetched, so a run that was rate-limited never
  leaves a partial snapshot in the logs.

## Log format

Every line carries the `snapshot` timestamp of its run and a `type`: `issue`, `pr`, `fork`, `star`,
`summary` (the counts), and `rate_limited` / `retry_scheduled` while it waits. Logs Insights:

```
fields @timestamp, type, author, number, title
| filter snapshot = "2026-11-11T20:46:46Z" and type = "pr"
```
