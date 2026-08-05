# openrecord-splash

The static marketing / waitlist splash page served at **https://openrecord.fanpierlabs.com/**.

This replaces the old Next.js web app at that hostname. It's a single self-contained
`index.html` (inline CSS + vanilla JS, no build step) hosted on S3 behind CloudFront —
following the same low-cost, zero-server pattern as the other Fan Pier Labs marketing
sites (`people-monitor-tool`, `autoinsights`, `auto-label-emails`).

## What it is

- **Presentational splash only** — hero, feature grid, privacy section, 3-step timeline, CTA, footer.
- **Waitlist form** posts to the shared `fanpierlabs-forms` Lambda (emails `ryan@fanpierlabs.com`
  and logs to CloudWatch). Endpoint: `https://ns8remz3t7.execute-api.us-east-2.amazonaws.com`,
  payload `{ site: "openrecord", name, email }`. A hidden `company` honeypot drops bots client-side.
- **No auth** — sign in / sign up were removed. "Get Notified" / "Get started" scroll to the waitlist.
- **Download buttons** for iOS & Android are scaffolded in the hero (`href="#"` placeholders) —
  swap in real App Store / Google Play URLs when the apps ship.

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

Uploads `index.html` to the bucket and invalidates the CloudFront cache.

## Reading waitlist signups

The `fanpierlabs-forms` Lambda emails each signup and logs it to CloudWatch
(`/aws/lambda/fanpierlabs-forms`, filter `FORM_SUBMISSION`). This repo does not own that
Lambda — see the `fanpierlabs-projects-email-submission` project.
