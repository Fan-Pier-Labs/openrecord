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
- **Link previews + PWA install** — Open Graph / Twitter card tags, favicons, an apple-touch-icon,
  and `manifest.json`. See "Assets" below.

## Assets

| File | Purpose |
| --- | --- |
| `og-image.png` | 1200×630 share card (iMessage, Slack, Twitter/X, Facebook, LinkedIn) |
| `icon.svg` | Source of truth for every icon |
| `favicon.ico` | 16/32px browser tab icon |
| `apple-touch-icon.png` | 180×180 iOS home-screen icon |
| `icon-192.png`, `icon-512.png` | PWA manifest icons (512 doubles as the maskable icon) |
| `manifest.json` | Web app manifest — name, theme colors, icons |

The PNGs are **generated, but committed** so deploying stays a plain `s3 cp` with no build step.
Regenerate them after editing `icon.svg` or `assets-src/og-image.html`:

```bash
./generate-assets.sh
```

It renders the share card with headless Chrome and the icons with `rsvg-convert`
(`brew install librsvg`), and writes the web app's matching assets into `../web/public` so both
sites share one design and one icon source.

Two things are easy to get wrong and are covered by `__tests__/metadata.test.ts`:

- **`og:image` must be an absolute `https://` URL.** iMessage and Slack do not resolve a relative
  path, so the preview silently falls back to a bare link.
- **Every referenced asset must be in `deploy.sh`.** A file that exists locally but was never
  uploaded looks fine in a local browser and 403s in production.

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
