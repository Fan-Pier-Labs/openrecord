# OpenRecord

**Let AI manage your healthcare.** Ask Claude to request a prescription refill, message your doctor to schedule an appointment, review your latest lab results, or update your insurance information — all through a natural conversation. OpenRecord connects to Epic MyChart patient portals and exposes 35+ tools for reading and managing your health data, with full write support — send messages, request refills, and update your insurance information, not just view it.

OpenRecord ships as three clients, all built on the same scraper core:

1. **Claude Desktop extension** (`claude-desktop-extension/`) — a `.mcpb` bundle that runs entirely on your machine. Install it, say "Set up my MyChart", and Claude handles the rest.
2. **Mobile app** (`expo-app/`) — an Expo/React Native iOS app with an on-device agent, skills, and alerts.
3. **CLI + npm package** (`npm-package/`) — the `mychart-cli` npm package: a headless CLI for scripting and testing, plus an importable library.

## What It Does

Connects to any Epic MyChart patient portal and exposes 35+ tools for reading and managing your health data:

- **Profile** — name, DOB, MRN, PCP, email
- **Medications** — current meds, dosages, refill details, pharmacy info
- **Lab Results** — test results, reference ranges, trending
- **Imaging** — X-ray, MRI, CT, ultrasound results
- **Allergies** — known allergies with severity and reactions
- **Health Issues** — active diagnoses and conditions
- **Vitals** — weight, blood pressure, height, BMI
- **Immunizations** — vaccine records and dates
- **Visits** — upcoming appointments and past visit history
- **Messages** — read, send, and reply to provider messages
- **Billing** — billing history and account balances
- **Care Team** — providers, specialists, departments
- **Insurance** — coverage details and plan info
- **Preventive Care** — overdue screenings and recommendations
- **Referrals** — active and past referrals
- **Medical History** — past conditions, surgical, family, and social history
- **Letters** — after-visit summaries and clinical letters
- **Documents** — clinical documents and visit records
- **And more** — emergency contacts, goals, care journeys, questionnaires, education materials, EHI export, linked accounts, medication refill requests

## How It Works

OpenRecord logs in with your credentials, handles 2FA automatically (via TOTP authenticator codes or passkeys), and interacts with MyChart's APIs on your behalf. No FHIR, no OAuth, no Epic developer account needed — just your MyChart username, password, and optionally a TOTP secret for automatic 2FA.

Sessions are kept alive automatically and re-established on expiry. Credentials never leave your machine — every client runs the scrapers locally.

## Getting Started

### 1. Claude Desktop extension

```bash
cd claude-desktop-extension
bun install
bun run pack          # builds dist/server.cjs and produces openrecord.mcpb
```

Then double-click `openrecord.mcpb` (or drag it into Claude Desktop → Settings → Extensions), open a new chat, and say "Set up my MyChart". Claude walks you through picking your health system, signing in, and 2FA. Credentials are stored locally in `~/.openrecord-mcpb/` and are never sent to Anthropic.

Want to try it without real credentials? Search for **Springfield General Hospital (test)** during setup — it points at the `fake-mychart.fanpierlabs.com` sandbox (sign in with `homer` / `donuts123`).

See [claude-desktop-extension/README.md](claude-desktop-extension/README.md) for details.

### 2. Mobile app

The Expo app in `expo-app/` runs the scrapers on-device. See `expo-app/` for build instructions (`bunx expo run:ios`).

### 3. CLI

```bash
npm i -g mychart-cli
mychart-cli --help
```

Or from a checkout: `bun run cli mychart [flags]`. See [docs/cli.md](docs/cli.md) for cookie caching, credential resolution, 2FA, and the full action list.

## Architecture

```
openrecord/
  scrapers/                  # Shared MyChart scraper code (login, API calls, parsing)
  shared/                    # Common types and enums
  claude-desktop-extension/  # Claude Desktop .mcpb extension
  expo-app/                  # Expo/React Native mobile app
  npm-package/               # mychart-cli npm package (CLI + library)
  read-local-passwords/      # Browser password store extraction (used by the CLI)
  fake-mychart/              # Fake MyChart server for development and CI
  openrecord-splash/         # Static splash site + in-browser interactive demo
  openrecord-demo-lambda/    # Lambda backing the demo's AI chat
  newsletter-lambda/         # Lambda capturing waitlist signups
```

The scrapers are shared across all entry points. Each entry point handles auth and session management differently, but they all call into the same scraper functions.

## Development

```bash
bun install

# Fake MyChart (for development without real credentials)
bun run fake-mychart         # Fake MyChart server on a random port (4000-5000), printed at startup

# CLI
bun run cli                  # Run the CLI scraper

# Tests
bun run test                 # Unit tests
bun run test:integration     # Integration tests (needs the compose fake-mychart)

# Linting
bun run lint                 # ESLint
bun run fix                  # ESLint auto-fix
```

## Telemetry

The CLI and `mychart-cli` npm package send anonymous
usage events (event name, MyChart portal hostname, OS platform / arch /
version, runtime version, plus a per-machine random UUID for dedupe).
No public IP, OS hostname, OS username, git identity, or scraped chart
content is ever collected. Set
`MYCHART_CLI_TELEMETRY_DISABLED=1` to opt out.

A separate dev-mode env var, `OPENRECORD_MOCK_DATA=1`, switches the
scrapers' HTTP layer over to canned mock responses (was previously
`MOCK_DATA`; renamed for namespacing). Don't set this in production.

## License

Proprietary source-available license (see `LICENSE`). Viewing and personal/educational use permitted; no commercial use, redistribution, SaaS offerings, or competing products without written permission from Fan Pier Labs.
