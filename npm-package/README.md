# mychart-cli

Read and act on an Epic MyChart patient portal from your terminal or your Node.js code. Sign in
(password + 2FA, authenticator app, or passkey), pull any part of the chart (labs, medications,
visits and clinical notes, messages, imaging, bills, insurance, and more), and act on it: message
your care team, download statements, manage family-member records.

It's the same scraper engine behind
[OpenRecord](https://openrecord.fanpierlabs.com)'s Claude Desktop extension and mobile app. It
runs entirely on your machine, and your credentials and medical data never pass through anyone
else's server.

```bash
npm install -g mychart-cli
```

```bash
mychart-cli --host mychart.example.org --action get_lab_results --mode concise
```

## Documentation

| Guide | What's in it |
| --- | --- |
| **[CLI reference](docs/cli.md)** | Every flag, how sign-in works, output formats, family records, files and exit codes |
| **[Library API reference](docs/api.md)** | `MyChartClient`, every method and return type, errors, imaging, raw scrapers, the capability registry |
| **[Capabilities](docs/capabilities.md)** | Every action you can run, with arguments, output modes and how ids chain |
| **[Authentication](docs/authentication.md)** | Passkeys, TOTP, 2FA codes, sessions, and the `signCount` rule |
| **[Recipes](docs/recipes.md)** | Export a chart, read clinical notes, download imaging, message a doctor, run unattended, wire up an AI agent |
| **[Troubleshooting](docs/troubleshooting.md)** | Sign-in failures, refused reads, empty categories |
| **[Changelog](CHANGELOG.md)** | Breaking changes by version |

## Quick start: CLI

Find your health system's MyChart hostname. This needs no account:

```bash
mychart-cli --action search_mycharts --arg query="your health system"
```

Sign in and print your whole chart. You'll be prompted for anything missing, including the 2FA
code:

```bash
mychart-cli --host mychart.example.org
```

Run any single capability:

```bash
mychart-cli --host mychart.example.org --action get_past_visits --mode concise
```

Register a passkey once, and later runs need no password and no 2FA:

```bash
mychart-cli --host mychart.example.org --set-up-passkey
```

See what else it can do:

```bash
mychart-cli --help --show-all
```

The CLI keeps its session, passkey and TOTP secret in `.cookie-cache/`, `.passkey-credentials/`
and `.totp-secrets/` under the current directory. **Add them to `.gitignore`.** Full reference:
**[docs/cli.md](docs/cli.md)**.

## Quick start: library

```bash
npm install mychart-cli
```

```ts
import { MyChartClient } from 'mychart-cli';

const result = await MyChartClient.connect({
  hostname: 'mychart.example.org',
  user: process.env.MYCHART_USER!,
  pass: process.env.MYCHART_PASS!,
});

if (result.state === 'invalid_login' || result.state === 'error') throw new Error(result.error ?? result.state);
const client = result.state === 'connected' ? result.client : await result.complete(await promptForCode());

const { prescriptions } = await client.getMedications();
const { orders } = await client.listLabResults();
const visits = await client.pastVisits();

// Or dispatch any capability by id: the same names the CLI and the AI tools use.
const notes = await client.runCapability('get_visit_notes', { csn: visits!.visits[0]!.Csn });

client.close();
```

Every method is typed; the `.d.ts` covers both ESM and CommonJS. For anything unattended, sign in
with a passkey instead of a password. Read
**[authentication](docs/authentication.md#passkeys)** first, because a passkey must be saved
back after every login. Full reference: **[docs/api.md](docs/api.md)**.

## Try it without a real account

`fake-mychart.fanpierlabs.com` is a sandbox that behaves like MyChart and holds made-up data:

```bash
mychart-cli --host fake-mychart.fanpierlabs.com --user homer --pass donuts123 --2fa 123456 --action get_medications
```

## What it can do

| Area | Capabilities |
| --- | --- |
| Health record | profile, health summary, medications, allergies, health issues, vitals, immunizations, preventive care, medical history, goals |
| Visits | upcoming and past visits, clinical notes, After Visit Summaries |
| Results | lab results with history, imaging reports, imaging downloads decoded to JPEG/PNG |
| Messages | inbox, threads, attachments, recipients; send, reply (with attachments), delete |
| Billing | billing history, statement PDFs, insurance coverage, deductible / out-of-pocket progress |
| Care | care team (with NPIs), referrals, letters, documents and downloads, upcoming orders, questionnaires, and more |
| Family records | list and switch between the account holder's and family members' charts, with every read checking whose chart is active |
| Account | register and remove passkeys; turn authenticator-app 2FA on and off |
| No account needed | find a MyChart portal, look up providers in the NPI Registry, a health system's public directory |

Each one is a single registry entry, so the CLI, the library, the Claude Desktop extension and the
mobile app all have exactly the same set. The full list is in **[docs/capabilities.md](docs/capabilities.md)**.

## Telemetry

The CLI and library send anonymous usage events, which tell us which scrapers are used in the
wild and which ones break. Each event carries:

- the event name (e.g. `scraper_login_started`) and the MyChart **portal** hostname it targeted
- OS platform, architecture and version, and the runtime version (e.g. `node v22.11.0`)
- a random UUID generated once per project install, cached at
  `node_modules/.cache/mychart-cli/anonymous-id`, used only to count unique installs

**Never collected:** your IP address, your machine's hostname, your OS username, git identity, or
anything read from a chart.

The CLI also fetches a small version manifest from `openrecord.fanpierlabs.com` on start to tell
you about new releases. That request reveals your IP address to the CDN, and nothing else.

```bash
export MYCHART_CLI_TELEMETRY_DISABLED=1
```

turns off both.

## Privacy and safety

- Everything runs locally. Requests go straight from your machine to the MyChart portal.
- Chart data is medical information. Treat output files, `.cookie-cache/`, `.passkey-credentials/`
  and `.totp-secrets/` like passwords.
- Capabilities that change something (send, delete, switch the active patient, change sign-in
  settings) are marked as writes, so you can confirm them before an automated caller runs them.
- [Privacy policy](https://openrecord.fanpierlabs.com/privacy.html)

## License

Proprietary source-available license. Personal and educational use only; no commercial use,
redistribution, or SaaS offerings without written permission from Fan Pier Labs. See
[LICENSE](./LICENSE).
