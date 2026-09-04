# `scrapers/` — the shared scraper core

Every client — the Claude Desktop extension, the Expo iOS app, the `mychart-cli` package and
its importable library — calls into this directory. Nothing below it knows which client is
asking.

**Each scraper's documentation is the `README.md` in its own folder**, next to the code it
describes: what it scrapes, the exact endpoints and request bodies, the behaviours that bite,
the research behind them, and the per-mode field contract. Start from the map below.

| Path | What it is |
| --- | --- |
| [`http.ts`](http.ts) | the single outbound HTTP path — see below |
| [`myChart/`](myChart/) | the Epic MyChart scrapers ([map](myChart/README.md)) |
| [`npi/`](npi/) | the NPI Registry — public, no account ([README](npi/README.md)) |
| [`list-all-mycharts/`](list-all-mycharts/) | Epic's instance directory, and the probes that sweep all ~750 hosts ([README](list-all-mycharts/README.md)) |
| [`SCRAPING.md`](SCRAPING.md) | how to reverse-engineer a new endpoint: finding the request the web UI sends, and the traps |

## One way out to the network

**Every outbound request leaves through `scraperFetch`** ([`http.ts`](http.ts)), because
four things have to be true of all of them and none survives being reimplemented at a call
site:

- **The browser header block.** MyChart and the eUnity image servers answer a request that
  looks like Chrome; a bare `fetch` gets a login wall or a 403.
- **The cookie jar.** Session, load-balancer and bot-check cookies are set mid-redirect-chain
  and expected back on the very next hop.
- **The per-host permit.** At most 10 in-flight requests per host, process-wide
  ([`shared/hostConcurrency.ts`](../shared/hostConcurrency.ts)) — a full 30-category scrape
  otherwise arrives at one hospital as ~60 simultaneous requests, which is how an instance
  ends up on a blocklist. The permit wraps the individual fetch only, never the redirect
  recursion.
- **The 2-minute deadline.** A host that accepts the connection and never answers hangs the
  scrape forever, holding a permit the whole time.

A second raw-fetch path is exactly how the cap silently stops applying — it keeps working,
so nobody notices. So there isn't one, and `http.unit.test.ts` fails the build if one
appears. **There is no injectable `fetchFn`**: the platform picks the transport, and tests
use `setTestTransport` / `req.transport`, which sit below the headers, the jar, the permit
and the deadline.

## The shape every read scraper has

```
chart/<category>/
  <category>.ts            fetch…Raw — records every request into a RawResponse, edits nothing
  <category>.processor.ts  builds the standard object; projects it to concise
  README.md                what it scrapes, its endpoints, its research, its field contract
  __tests__/               beside the code it tests
```

**A read scraper returns the raw MyChart response; its processor decides what a caller
sees.** `mode` picks `raw` / `standard` / `concise` / `json`. The machinery and the rules are
[`myChart/processors/`](myChart/processors/).

## Where the rest of it is documented

- **[`shared/capabilities/`](../shared/capabilities/)** is the single source of truth for
  what the product can do. Every client derives its surface from it; none hand-maintains a
  list. Add an entry and it ships everywhere.
- **[`docs/architecture.md`](../docs/architecture.md)** — the invariants, with the reasoning.
- **[`docs/processor-layer-proposal.md`](../docs/processor-layer-proposal.md)** — the
  numbered processor rules every `.processor.ts` follows.
- **[`fake-mychart/`](../fake-mychart/)** — the stand-in every integration test runs against.
  It must behave *exactly* like real MyChart: response shapes, field casing, pagination
  sizes, status codes, server-side enforcement. Never simplify a contract to make a test
  easier.
