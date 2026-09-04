# `list-all-mycharts` — the instance directory, and the probes that sweep it

Every Epic MyChart deployment in the world, from Epic's own picker data — the list a client
searches before it has an account to log into — plus the harnesses that run a scraper
against all ~750 hosts at once.

| | |
| --- | --- |
| **Capabilities** | `search_mycharts` (`kind: 'public'` — no account, no session) |
| **Source** | [`directory.ts`](directory.ts) (fetch + logos) · [`searchDirectory.ts`](searchDirectory.ts) (ranking + cache) · [`fetch-mychart-instances.ts`](fetch-mychart-instances.ts) (regenerates the seed) |
| **Probes** | [`probe-mount-discovery.ts`](probe-mount-discovery.ts) · [`probe-open-scheduling.ts`](probe-open-scheduling.ts) · [`probe-open-slots.ts`](probe-open-slots.ts) · [`probeRunner.ts`](probeRunner.ts) |
| **Seed** | `mychart-instances.json` — the checked-in offline snapshot |

## Endpoints

| Request | Purpose |
| --- | --- |
| `GET https://www.mychart.org/cached-api/help/organizations/?locale=en-us&includeOrganizations=1` | the whole directory — ~1,400 organizations |
| `GET https://media.epic.com/mychartdotorg/directus/<subAreaName>/<imageId>/<fileName>` | one organization's logo |

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
- **Live first, seed second.** A search fetches Epic's directory, caches it, and searches
  that — new health systems come online between releases, and a patient whose provider is
  missing from a months-old snapshot has no way to connect. When the fetch fails (offline,
  corporate proxy, Epic down) the checked-in `mychart-instances.json` answers instead, and
  the result says `source: 'bundled'` rather than pretending the live list was consulted.
- `SANDBOX_INSTANCE` is the deployed fake-mychart, so anyone can walk the whole connect flow
  against a fictional record without a real Epic account. It is never a default suggestion —
  it appears only when the query matches it — and its "(test)" suffix is there so nobody
  mistakes it for a health system.
- fake-mychart serves **both halves** (`/cached-api/help/organizations/` and the mirrored
  media path), so neither the tests nor the mobile app's first-boot refresh has to reach
  Epic.

## The probes

MyChart's deployment shapes vary far more than any fixture set captures. These harnesses
answer "does this still work everywhere?" by asking every host in the directory.
**Nothing here submits a credential** — every request is one an unauthenticated browser
makes by opening the portal's front door. [`probeRunner.ts`](probeRunner.ts) holds the parts
they share: argument parsing, a bounded worker pool, JSONL output and progress.

| Probe | Question it answers |
| --- | --- |
| `probe-mount-discovery.ts` | Does the discovered mount actually serve a MyChart login page, and does it agree with the directory's own URL? |
| `probe-open-scheduling.ts` | Which organizations expose the anonymous "Find a Doctor" workflow, and how big a directory do they publish? |
| `probe-open-slots.ts` | Does the real `fetchOpenSlots` get slots back, or does the instance refuse the search? |

```bash
bun scrapers/list-all-mycharts/probe-mount-discovery.ts
```

Run the mount probe after touching discovery. Deployment shapes vary far more than any
fixture set captures — see [`../myChart/auth/`](../myChart/auth/) for what the sweep turned
up — and this is the only way to know the long tail still works.

The scheduling probe deliberately **does not** crawl a specialty: the question is who offers
the workflow, not what is in it, and 750 hosts × 20 specialties would be tens of gigabytes.
The slot probe calls the real `fetchOpenSlots`, so what it reports is what a library caller
gets — which matters because a payload verified on one host is not evidence of portability:
two of the next three instances tried refused the same one.
