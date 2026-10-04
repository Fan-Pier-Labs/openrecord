# How the MyChart list works

Every client searches the output of one piece of deterministic code: Epic's directory with every
login URL checked. It's checked in as `mychart-instances.json` at each release, and the
long-running clients rerun the same code monthly.

## Which run a client searches

```mermaid
flowchart LR
    checkedIn["mychart-instances.json<br/>(checked in at release)"]
    saved["a newer monthly run<br/>(extension: ~/.openrecord-mcpb/<br/>app: SQLite)"]

    checkedIn -- "until a newer run exists" --> search["search_mycharts<br/>(extension, CLI, library)"]
    saved -- "once one exists" --> search
    checkedIn --> picker["iOS picker"]
    saved --> picker
```

Search never makes a request. The CLI is one-shot, so it searches the checked-in list.

## The refresh

The same code runs at release and monthly. `fetchResolvedMyChartDirectory` in
`refreshDirectory.ts` does this:

```mermaid
flowchart TD
    epic["Epic's directory<br/>GET mychart.org/cached-api/help/organizations/<br/>~1,400 organizations"]
    epic --> parse["parseDirectoryPayload<br/>drop entries with no login URL,<br/>merge same name + same URL"]
    parse --> each["resolveLoginUrl, for every organization<br/>(24 at a time)"]
    each --> retry["retry everything down, once"]
    retry --> out["entries: url, directoryUrl when corrected,<br/>down: true when unconfirmed"]

    out --> release["at release: fetch-mychart-instances.ts<br/>writes mychart-instances.json, sorted by slgId.<br/>Commit it."]
    out --> monthly["monthly in the extension and the app:<br/>saved, then searched"]
    out --> cli["mychart-cli --action list-mycharts<br/>prints it"]
```

## Checking one login URL

What `resolveLoginUrl` decides for each organization:

```mermaid
flowchart TD
    start["Epic's loginUrl"] --> follow["follow redirects (up to 5)"]
    follow --> reached{"got a page?"}
    reached -- "no answer, TLS error, 4xx/5xx,<br/>or 60 s timeout" --> down["down<br/>keep Epic's URL, mark down: true"]
    reached -- yes --> isLogin{"MyChart login page?"}
    isLogin -- yes --> login["up<br/>keep Epic's URL"]
    isLogin -- no --> links["MyChart links on that page<br/>(5 by rank, then 5 that read like a portal)"]
    links --> linkLogin{"one serves a<br/>MyChart login page?"}
    linkLogin -- yes --> linked["up<br/>url = that portal,<br/>directoryUrl = Epic's"]
    linkLogin -- no --> down
```

`down` means "we couldn't confirm it was up when we checked". That includes portals that work
fine for patients but not for us: custom sign-in pages (Kaiser, UPMC), sites that block traffic
from outside their country (several Dutch hospitals, an NHS trust), and servers missing an
intermediate certificate.
