# `list-all-mycharts` — the instance directory, and the probes that sweep it

Every Epic MyChart deployment in the world, from Epic's own picker data — the list a client
searches before it has an account to log into — plus the harnesses that run a scraper
against all ~750 hosts at once.

| | |
| --- | --- |
| **Capabilities** | `search_mycharts` (`kind: 'public'` — no account, no session) |
| **Source** | [`directory.ts`](directory.ts) (Epic fetch, `listMyCharts`, logos) · [`searchDirectory.ts`](searchDirectory.ts) (ranking + the refreshed list) · [`fetch-mychart-instances.ts`](fetch-mychart-instances.ts) (regenerates the generated list) |
| **Probes** | [`probes/`](probes/) — [`probe-mount-discovery.ts`](probes/probe-mount-discovery.ts) · [`probe-open-scheduling.ts`](probes/probe-open-scheduling.ts) · [`probe-open-slots.ts`](probes/probe-open-slots.ts) · [`probe-epic-version.ts`](probes/probe-epic-version.ts) · [`probeRunner.ts`](probes/probeRunner.ts) |
| **Data** | `mychart-instances.json` — generated from Epic on each MCPB release |

## Endpoints

| Request | Purpose |
| --- | --- |
| `GET https://www.mychart.org/cached-api/help/organizations/?locale=en-us&includeOrganizations=1` | the whole directory — ~1,400 organizations |
| `GET https://media.epic.com/mychartdotorg/directus/<subAreaName>/<imageId>/<fileName>` | one organization's logo |
| `GET https://open.epic.com/Endpoints/R4` | Epic's published FHIR endpoints — ~480, one per organization that exposes one (version probe only) |

**`includeOrganizations=1` is required.** Without it the endpoint answers 200 with the
country and state dictionaries and **no `organizations` key at all**.

Each entry carries `slgId`, `name`, `loginUrl`, `aliases`, `states`, `countries`, a logo
record, and `phone` / `email` / `faq` (present on 958 / 390 / 1,271 of 1,414 organizations).

## Notes and research

- **`/LoginSignup` does not contain the list.** mychart.org is a Next.js app whose picker
  fetches `/cached-api/help/organizations/` client-side; the page itself ships **no
  organizations at all**, so the `window.PageContext = { Directory: … }` block it used to
  inline is gone. Parsing the HTML gets an empty list, not an error.
- The payload also carries `countryData` and `stateData` — name/alias/ZIP dictionaries that
  are together the large majority of its ~1.8 MB. Neither says anything about an instance,
  so neither is parsed or stored.
- **Logo fallbacks are not decorative.** Eight organizations have no `logo` record, and
  seven of those are large systems (Mayo, Kaiser, HealthPartners, …) whose logo Epic's own
  picker hand-places by directory id. `logoUrlFor` reimplements the picker's render path in
  its order: the organization's own Directus image → the per-`slgId` override → Epic's
  generic MyChart logo.
- **Every logo is on one host**, so `scraperFetch`'s per-host permit is what paces a bulk
  fetch — pulling all ~1,400 is 1,400 gated round trips. **Fetch the logos you are about to
  show.** Nothing is mirrored, and mirroring them would not help: clients run on other
  people's machines with none of our credentials, so they load logos straight from Epic
  either way.
- **Some `loginUrl`s are wrong at the source.** UCSF (`166`) publishes
  `www.ucsfhealth.org/ucsfmychart/`, which redirects to an information page; the portal
  is `ucsfmychart.ucsfmedicalcenter.org`. A refresh checks every one — see
  [Checking login URLs](#checking-login-urls).
- **A duplicate is the same name *and* the same portal.** Epic lists Cleveland Clinic twice
  (`320` for the US, `320-1` for Canada) and Ziekenhuis Amstelland twice; `mergeDuplicates`
  keeps the shortest `slgId` with every entry's aliases, states and countries. Same name
  alone is not a duplicate — 13 names (Baptist Health, La Clinica, …) are separate systems
  in different states — and nor is same portal alone: 46 portals are shared by affiliates
  that patients search for by their own names.
- **What clients search is the deterministic refresh's output** (Epic's directory, every login
  URL checked): `mychart-instances.json` from the last release until a newer run exists. The
  Claude Desktop extension and the iOS app rerun the same refresh in the background about
  monthly (new health systems come online between releases) and search its result, saying
  `source: 'refreshed'` with its `refreshedAt`. Search itself never makes a request. The CLI is one-shot, so it searches
  the checked-in list. See [`HOW-IT-WORKS.md`](HOW-IT-WORKS.md).
- `SANDBOX_INSTANCE` is the deployed fake-mychart, so anyone can walk the whole connect flow
  against a fictional record without a real Epic account. It is never a default suggestion —
  it appears only when the query matches it — and its "(test)" suffix is there so nobody
  mistakes it for a health system.
- **A search that turns up the sandbox probes it first.** It is one small deployment that
  gets torn down whenever its bill outweighs its use, and clients went on offering it —
  people picked it and hit a login that could never succeed. A sandbox that isn't serving
  comes back with `unavailable` set to `SANDBOX_UNAVAILABLE_NOTE`; clients show the row
  greyed out and unselectable, carrying that text, rather than dropping it. The answer is
  cached for a minute, and no other query pays for the probe.
- fake-mychart serves **both halves** (`/cached-api/help/organizations/` and the mirrored
  media path), so neither the tests nor the mobile app's refresh has to reach Epic.

## Checking login URLs

[`resolveLoginUrl.ts`](resolveLoginUrl.ts) follows each `loginUrl`. If it lands on a MyChart
login page it stands. If not, the MyChart links on the page it landed on are tried, and the
first that itself serves a login page replaces it. Otherwise it's `down`: we couldn't confirm
it was up when we checked — a dead host, a custom sign-in page, a bot wall, or a portal that
blocks traffic from outside its own country (six Dutch hospitals and an NHS trust, from the
US). It keeps Epic's URL.

[`refreshDirectory.ts`](refreshDirectory.ts) runs that over the whole directory, retrying
anything down once at the end. It backs `mychart-cli --action list-mycharts` and
`fetch-mychart-instances.ts`, which the MCPB's `pack:signed` runs before every release,
leaving the refreshed file to commit. Both JSON files are written sorted by `slgId`, keys in
order (`toSortedJson`), so a diff shows only what changed.

The generated file records the result: **`directoryUrl`** on a corrected entry (Epic's URL,
with `url` holding ours) and **`down: true`** on one we couldn't confirm. `down` is a snapshot
from release time; nothing shows it yet.

**The FAQ link is not a fallback.** In October 2026, of 1,159 working entries with a MyChart
FAQ link, 314 put it on a different host — 56 on a visibly different portal (an affiliate's
parent: My Sanford Chart, MyLVHN). On the 13 entries that needed a correction it agreed with
the page's own link 6 times, and pointed at a stale or different system on 5.

**What the first sweep found (October 2026, 1,416 organizations, run from the US).** 1,332
login URLs are right as published — the same 1,332 an independent scan found. 18 were
corrected; 17 are confirmed by the page's own sign-in link or the portal's branding, and
`mychart.bswhealth.com/fa/` (Baylor Scott & White, whose real sign-in is a custom page)
serves a MyBSWHealth login no one has signed in to. Mount discovery succeeds on every
corrected host. 66–134 were `down`, the swing between runs being timeouts; 8 of them are
broken for anyone (three hostnames gone, three TLS failures, an expired certificate, a 503).

## The probes

MyChart's deployment shapes vary far more than any fixture set captures. These harnesses
answer "does this still work everywhere?" by asking every host in the directory.
**Nothing here submits a credential** — every request is one an unauthenticated browser
makes by opening the portal's front door. [`probeRunner.ts`](probes/probeRunner.ts) holds the parts
they share: argument parsing, a bounded worker pool, JSONL output and progress.

| Probe | Question it answers |
| --- | --- |
| `probe-mount-discovery.ts` | Does the discovered mount actually serve a MyChart login page, and does it agree with the directory's own URL? |
| `probe-open-scheduling.ts` | Which organizations expose the anonymous "Find a Doctor" workflow, and how big a directory do they publish? |
| `probe-open-slots.ts` | Does the real `fetchOpenSlots` get slots back, or does the instance refuse the search? |
| `probe-epic-version.ts` | Which Epic release is each instance running? |

```bash
bun scrapers/list-all-mycharts/probes/probe-mount-discovery.ts
```

Run the mount probe after touching discovery. Deployment shapes vary far more than any
fixture set captures — see [`../myChart/auth/`](../myChart/auth/) for what the sweep turned
up — and this is the only way to know the long tail still works.

### What the version probe found (September 2026)

Ten Epic releases are live. Of 715 classified hosts: November 2025 43%, February 2026 36%,
May 2026 10%, August 2025 8.5%, February 2025 2%, and a tail back to May 2022. The
**web build does not track the FHIR release**: the three sampled organizations reporting
"August 2025" over FHIR all serve the same MyChart web bundles as the November 2025 hosts.
What differs is the web build, and across five distinct builds (May 2025 → May 2026, 16 hosts,
bundles read anonymously) every `/api/*` endpoint the scrapers call is still named, with the
same request keys; changes are additive (`GetSuggestedActionUpdate`, `GetBedsideProviderInfoFull`).
The failure shape is per web build too — a POST with no antiforgery token gets the
`/Home/FiveHundred` redirect dance on every 2025+ build sampled (11 hosts) and a bare 500 on
the older ones (4 hosts, February 2025 and earlier, plus one August 2025 instance still on its
older build). The login form is identical on all 20 hosts from February 2024 to May 2026.
Post-login, the same 30 read capabilities answer with byte-compatible shapes on real accounts
on the November 2025 (3) and August 2025 (1) builds; nothing has been run against a
February 2026 or May 2026 account.

The scheduling probe deliberately **does not** crawl a specialty: the question is who offers
the workflow, not what is in it, and 750 hosts × 20 specialties would be tens of gigabytes.
The slot probe calls the real `fetchOpenSlots`, so what it reports is what a library caller
gets — which matters because a payload verified on one host is not evidence of portability:
two of the next three instances tried refused the same one.
