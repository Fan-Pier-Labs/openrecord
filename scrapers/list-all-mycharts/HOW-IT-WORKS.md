# How the MyChart list works

Every client searches the same thing: **two lists, merged**.

1. **The refresh's output**: Epic's directory with every login URL checked, produced by
   deterministic code. It's checked in as `mychart-instances.json` at each release, and the
   long-running clients rerun the same code monthly.
2. **`mychart-instances-manual.json`**: entries kept by hand, each with its source.

## The two lists, and who reads them

```mermaid
flowchart LR
    subgraph list1["List 1: the refresh's output"]
        checkedIn["mychart-instances.json<br/>(checked in at release)"]
        saved["a newer monthly run<br/>(extension: ~/.openrecord-mcpb/<br/>app: SQLite)"]
    end
    manual["List 2: mychart-instances-manual.json<br/>(kept by hand)"]

    checkedIn -- "until a newer run exists" --> merge
    saved -- "once one exists" --> merge
    manual --> merge
    merge["withManualEntries<br/>one dictionary keyed by slgId;<br/>a hand entry wins and clears down"]

    merge --> search["search_mycharts<br/>(extension, CLI, library)"]
    merge --> picker["iOS picker"]
    merge --> passwords["password import<br/>(checked-in list only, offline)"]
```

Search never makes a request. The CLI is one-shot, so it searches the checked-in list.

## The refresh: producing list 1

The same code runs at release and monthly. `fetchResolvedMyChartDirectory` in
`refreshDirectory.ts` does this:

```mermaid
flowchart TD
    epic["Epic's directory<br/>GET mychart.org/cached-api/help/organizations/<br/>~1,400 organizations"]
    epic --> parse["parseDirectoryPayload<br/>drop entries with no login URL,<br/>merge same name + same URL"]
    parse --> each["resolveLoginUrl, for every organization<br/>(24 at a time)"]
    each --> retry["retry everything down, once"]
    retry --> out["entries: url, directoryUrl when corrected,<br/>down: true when unconfirmed"]

    out --> release["at release: fetch-mychart-instances.ts<br/>writes mychart-instances.json, sorted by slgId,<br/>re-checks the hand-kept URLs. Commit it."]
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
intermediate certificate. A hand-kept entry clears it.

## Keeping the hand-kept list honest

- Every release refresh re-checks each hand-kept URL and prints the ones that stopped serving a
  login, and any addition Epic now lists itself.
- `directory.unit.test.ts` fails the build in these cases:
  - a hand entry names an `slgId` that doesn't exist
  - an addition's host is one Epic now lists
  - a URL isn't a mount root
  - either file isn't sorted by `slgId` with keys in order
- To add to it, see the `find-missing-mycharts` skill. The research behind the current entries
  is in [`LOGIN-URL-RESEARCH.md`](LOGIN-URL-RESEARCH.md).
