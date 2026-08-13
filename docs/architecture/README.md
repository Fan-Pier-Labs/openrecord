# Architecture diagrams

How this codebase is laid out, and why. Start here.

The one-sentence version: **one scraper core, one capability registry, four clients that
only own their own presentation.**

These are the *diagrams*. [`docs/architecture.md`](../architecture.md) is the prose
counterpart — the reasoning behind each invariant in `CLAUDE.md`, which is what you want when
you are about to change one. This directory shows the shapes those invariants produce.

| Doc | Covers |
| --- | --- |
| [01 — Shared core](01-shared-core.md) | `scrapers/`, `shared/` — the HTTP path, sessions, auth, rate limiting |
| [02 — Capability registry](02-capability-registry.md) | `shared/capabilities.ts` and how each client derives its surface from it |
| [03 — Mobile app](03-expo-app.md) | `expo-app/` — Expo/React Native, on-device agent loop |
| [04 — Claude Desktop extension](04-desktop-extension.md) | `claude-desktop-extension/` — the `.mcpb` MCP server |
| [05 — CLI and npm package](05-cli-and-npm-package.md) | `npm-package/` — `mychart-cli` and the importable library |
| [06 — Supporting services](06-supporting-services.md) | `fake-mychart/`, the Lambdas, the splash site and browser demo |

Diagrams are [Mermaid](https://mermaid.js.org/) fenced blocks, which GitHub renders
inline — no image files to regenerate, and a diff to a diagram reads as a diff.

## The big picture

```mermaid
flowchart TB
    subgraph clients["Clients — presentation only"]
        direction LR
        APP["Mobile app<br/><code>expo-app/</code><br/>Expo / React Native"]
        MCPB["Desktop extension<br/><code>claude-desktop-extension/</code><br/>MCP server (.mcpb)"]
        CLI["CLI<br/><code>npm-package/cli/</code><br/>mychart-cli"]
        LIB["npm library<br/><code>npm-package/src/</code><br/>MyChartClient"]
    end

    REG["<b>Capability registry</b><br/><code>shared/capabilities.ts</code><br/>one entry per thing OpenRecord can do"]

    subgraph core["Shared scraper core"]
        direction LR
        SCR["Category scrapers<br/><code>scrapers/myChart/*.ts</code>"]
        AUTH["Auth + session<br/>login · silentLogin · sessionStore<br/>makeAuthenticatedRequest"]
        HTTP["The one outbound path<br/><code>scrapers/http.ts</code><br/>headers · cookie jar · per-host permit"]
    end

    EPIC[("Epic MyChart<br/>~750 instances")]
    EUN[("eUnity imaging<br/>servers")]
    FAKE[("fake-mychart<br/>dev + CI stand-in")]

    APP --> REG
    MCPB --> REG
    CLI --> REG
    LIB --> REG

    REG --> SCR
    SCR --> AUTH
    AUTH --> HTTP
    SCR --> HTTP

    HTTP --> EPIC
    HTTP --> EUN
    HTTP -.dev/CI.-> FAKE
```

## The rules that shape it

Four constraints explain most of the structure. Each is enforced by a test, not by
convention — the build fails if one is broken.

| Rule | Why | Enforced by |
| --- | --- | --- |
| **One capability registry** | Four hand-maintained tool lists drifted to 46 / 43 / 46 / 38 entries, so a patient's answer depended on which client they asked | `shared/__tests__/capability-parity.unit.test.ts` |
| **One outbound HTTP path** | A second raw-`fetch` call site keeps working — it just isn't rate-limited, cookie-jarred, or sending browser headers | `scrapers/myChart/__tests__/http.unit.test.ts` greps `scrapers/` for network calls |
| **One authenticated-request wrapper** | MyChart answers an expired session with a redirect to the login page, which reads as "this patient has no allergies" unless something central catches it | `makeAuthenticatedRequest` is the only post-login transport |
| **Every test file names its suite** | A file without a `*.unit`/`*.integration`/`*.real-mychart` suffix silently never runs, and a suite that never runs looks exactly like one that passes | `tests/suite-naming.unit.test.ts` |

## Where the layers stop

The boundary that matters most: **nothing in `scrapers/` or `shared/` knows about MCP,
React Native, or `argv`.** A capability's `run()` takes a logged-in `MyChartRequest` and
returns JSON-serializable data. Everything above translates that into a tool schema, a
chat bubble, or stdout.

The one deliberate exception is `rendersMedia` — `download_imaging_study` returns raw CLO
bytes because each client encodes them differently: the CLI has `sharp`, while the extension
and the mobile app share the pure-JS exporter (`exporters/to_jpg_purejs.ts`). Clients branch
on that flag, never on the capability id.

```mermaid
flowchart LR
    subgraph L4["Presentation"]
        direction TB
        P1["MCP tool schemas (zod)"]
        P2["Agent prompt + chat UI"]
        P3["argv flags + stdout"]
        P4["Typed methods"]
    end
    subgraph L3["Capability layer"]
        C1["<code>executeCapability(request, id, args, ctx)</code><br/>active-patient guard · fuzzy name resolution"]
    end
    subgraph L2["Domain scrapers"]
        D1["medications · labs · visits · messages · bills · imaging · …"]
    end
    subgraph L1["Transport"]
        T1["<code>MyChartRequest</code> → <code>makeAuthenticatedRequest</code> → <code>scraperFetch</code>"]
    end

    L4 --> L3 --> L2 --> L1
```

## Keeping this current

These docs describe structure, not line numbers, so they only go stale when the structure
changes. **A diagram that has drifted is worse than no diagram — someone will trust it.**

### When a change obliges you to update these

Update the relevant file **in the same PR** as the change. Any of these is a trigger:

- **A new top-level package, or a package's role changes** (a fifth client, a new Lambda, a
  service moving between packages) → the big-picture diagram above, plus a new or revised file.
- **A new layer or hop in the request path** — anything sitting between a capability's `run()`
  and the network, or a change to `resolveTransport`'s branches → `01-shared-core.md`.
- **A change to how sessions are established, renewed, kept alive, or expire** — the
  silent-login ladder, the keepalive cadence, `adoptStateFrom`, `SessionExpiredError` →
  `01-shared-core.md`, plus the client file if that client wires it differently.
- **A change to the capability contract** — a new field on `Capability`, a new `kind`, a new
  registry-owned convention (`ACCOUNT_PARAM`, `rendersMedia`), or a change to what
  `executeCapability` does before `run()` → `02-capability-registry.md`.
- **A change to how a client derives its surface** from the registry, or a new hand-written
  tool/command that is *not* registry-derived → that client's file. Adding an ordinary
  capability entry does **not** require a doc change — that is the whole point of the registry.
- **A change to the proxy / active-patient model** — where the guard runs, what it caches,
  what a mismatch does → `01-shared-core.md` and `05-cli-and-npm-package.md` (the CLI defines
  the semantics the others follow).
- **A change to the test-suite taxonomy, the CI job layout, or the coverage gate** →
  `06-supporting-services.md`.
- **A new fake-mychart mode knob**, or a change to what the existing knobs simulate →
  `06-supporting-services.md`.
- **A directory listing here goes stale** — files in a `Layout` block were added or removed.

If a change touches none of the above, leave these alone. Routine feature work usually should
not need to.

### Writing rules

- **Describe structure, not line numbers.** No `file.ts:142` references — they rot on the next
  edit. Name the module and the exported symbol.
- **Say why, not just what.** Every constraint here exists because something broke. The diagram
  shows the shape; the prose next to it should say what failure the shape prevents.
- **Don't duplicate `CLAUDE.md` or `docs/architecture.md`.** Where a rule is already stated at
  length there, state it briefly and let the diagram carry the weight.
- **Counts and inventories go stale — mark them.** Give the command that regenerates the number
  (`bun run cli --list-capabilities`) rather than presenting the count as fact.
- **Mermaid fenced blocks only**, so GitHub renders them inline and a diff to a diagram reads as
  a diff. No image files, no `.drawio` sources, nothing that needs regenerating.
- **No PII, ever**, including in example data — same rule as everywhere else in the repo.
