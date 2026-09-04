# 03 — Mobile app (`expo-app/`)

An Expo / React Native iOS app that runs the scrapers **on device** and drives them with an
agent loop. Nothing about the patient's chart leaves the phone except what the user's chosen
model provider sees.

Build: `bunx expo run:ios`.

## Layout

```
expo-app/src/
  app/                          expo-router routes
    onboarding/steps/           welcome → google → picker → mychart → twofa → passkey
    (auth)/
      index.tsx                 home: alerts, insights, chat list
      chat/[id].tsx             a conversation
      insights.tsx
      settings/                 index.tsx, ai.tsx
  components/                   AlertsCard, ChatBubble, ChatInput, InsightCard,
                                LeftDrawer, MemorySummaryCard, SkillsSheet
  lib/
    ai/
      claude-client.ts          the agent loop
      tool-catalog.ts           tools, derived from the capability registry
      tool-call-parser.ts       extracts {"tool":…,"args":…} from model output
      tool-executor.ts          confirmation gating, then dispatch
      title-generator.ts
    scrapers/session-manager.ts connect / 2FA / passkey / dispatch every capability
      tool-executor.ts          confirmation gating, then dispatch
    scrapers/session-manager.ts connect / 2FA / passkey / dispatch every capability
    storage/
      schema.ts                 SCHEMA_SQL — the whole DDL, in its own module so the
                                schema test can run it against bun:sqlite
      database.ts               opens openrecord.db and execs SCHEMA_SQL; query helpers
      secure-store.ts           MyChart accounts, API keys, model + provider choice
    backend/                    Google sign-in, backend session, AI Lambda client
    memory/                     builder.ts, chat-extractor.ts — background digest
    alerts/generator.ts         background alert generator
    imaging/                    CLO → JPEG on device, attachment store
    skills/                     skill playbooks
expo-app/shims/                 fs-empty.js, zlib-pako.js, telemetry-noop.ts
expo-app/metro.config.js        where Node builtins actually get resolved
```

Tables in `schema.ts`: `chats`, `messages`, `alerts`, `memory_summary`, `insights`,
`memory_sync_state`. Every statement is `CREATE TABLE IF NOT EXISTS` on purpose — `alerts`
was once a `DROP TABLE` + bare `CREATE`, which wiped `dismissed_at` on every launch.

## Runtime shape

```mermaid
flowchart TB
    subgraph device["iPhone"]
        UI["expo-router screens<br/>chat · home · insights · settings"]
        AGENT["<code>claude-client.ts</code><br/>agent loop"]
        CAT["<code>tool-catalog.ts</code><br/>derived from CAPABILITIES"]
        EXECU["<code>tool-executor.ts</code><br/>write ⇒ native confirm dialog"]
        SM["<code>session-manager.ts</code><br/>one MyChartRequest per account"]
        CORE["shared scraper core<br/>+ <code>executeCapability</code>"]
        SHIM["<code>metro.config.js</code> resolution<br/>real polyfills for crypto · path · os · zlib<br/>empty shim for fs · child_process · net"]
        DB[("SQLite<br/>chats · messages · alerts<br/>insights · memory")]
        SEC[("SecureStore<br/>credentials · passkeys<br/>TOTP secrets · API keys")]
        JOBS["background jobs<br/>memory builder · alert generator"]
    end

    LAMBDA["OpenRecord AI Lambda<br/>free tier, Google-token gated"]
    BYO["OpenAI / Anthropic / Gemini<br/>BYO key, direct"]
    MYC[("MyChart instance")]

    UI --> AGENT
    CAT --> AGENT
    AGENT -->|free tier| LAMBDA
    AGENT -->|BYO key| BYO
    AGENT --> EXECU --> SM --> CORE --> SHIM --> MYC
    SM --> SEC
    UI --> DB
    JOBS --> SM
    JOBS --> DB
    EXECU -.write tools.-> UI
```

**Running unmodified scraper code under Hermes is a Metro-config problem, not a source-tree
one** — there is deliberately no shim layer inside `src/`. `metro.config.js` does all of it:
`resolverMainFields` / `unstable_conditionNames` make packages like cheerio pick their browser
build, and `resolver.extraNodeModules` maps each Node builtin either to a real polyfill
(`crypto` → `react-native-quick-crypto`, `path` → `path-browserify`, `os` →
`os-browserify/browser`, `stream` → `readable-stream`, `zlib` → the pako-backed
`shims/zlib-pako.js` the CLO parser needs) or, for the ones no code path actually calls at
runtime (`fs`, `net`, `tls`, `child_process`, …), to the empty `shims/fs-empty.js`. A custom
`resolveRequest` strips the `node:` prefix and swaps `shared/telemetry` for
`shims/telemetry-noop.ts`, which is server-only. `tough-cookie` and `expo-sqlite` are ordinary
dependencies — neither is shimmed.

`http.ts`'s `PLATFORM_OWNS_COOKIES` check (two signals: `navigator.product` and whether
`expo/fetch` resolved) is the other half of that story; getting it wrong on device is a
silently broken session, not a crash.

## The agent loop

`claude-client.ts` is the reference implementation of the loop — the browser demo in
`openrecord-splash/demo/src/agent.ts` is a faithful port of it, deliberately kept in step.

```mermaid
sequenceDiagram
    participant U as User
    participant A as claude-client
    participant M as Model
    participant E as tool-executor
    participant S as session-manager

    U->>A: message
    A->>M: system prompt + tool list + memory digest + history
    M-->>A: {"tool": "get_medications", "args": {...}}
    Note over A: read tools batch — several may<br/>be issued in one turn
    A->>E: execute
    E->>S: executeScraperTool(...)
    S->>S: executeCapability(request, id, args, ctx)
    S-->>E: JSON
    E-->>A: result
    A->>M: results appended
    M-->>A: {"tool": "request_refill", "args": {...}}
    Note over E: write tool — exclusive, cannot batch
    E->>U: native confirmation dialog
    U-->>E: confirm
    E->>S: execute
    S-->>A: result
    A->>M: result
    M-->>A: {"tool": "respond", ...}
    A-->>U: reply (terminator)
```

Protocol details worth knowing: tool calls are JSON objects in the model's text output
(`tool-call-parser.ts` extracts them), `respond` is the terminator, read tools batch and
write tools are exclusive, and `isExclusiveTool` is the gate.

## AI providers and the free tier

**AI requires Google sign-in — all providers, BYO keys included.** Signing in is what
unlocks the $50/month included credit.

```mermaid
flowchart LR
    APP["mobile app"]
    G["Google sign-in<br/><code>getFreshIdToken()</code><br/>tokens live ~1h, silently refreshed"]
    L["<code>openrecord-demo-ai</code> Lambda"]
    V["verify ID token against<br/>Google's JWKS, server-side"]
    D[("<code>openrecord-ai-spend</code><br/>DynamoDB — per account × month")]
    GEM["Gemini"]
    K["BYO key → OpenAI / Anthropic / Gemini"]

    APP --> G
    APP -->|"Authorization: Bearer &lt;id token&gt;"| L --> V --> D
    L --> GEM
    APP -->|provider = openai/anthropic/gemini| K
```

The client is never trusted about identity — the Lambda verifies the token itself
(signature, issuer, audience, expiry). A 401 means the app silently re-signs-in and
retries; over the spend cap returns 402. Endpoint is `backendUrl` in
`expo-app/app.config.ts`, override with `EXPO_PUBLIC_BACKEND_URL`.

Everything else — the chart data, the scraping, the SQLite database, the credentials —
lives on device.

## Background jobs

```mermaid
flowchart LR
    subgraph jobs["run through the same proxy guard as chat"]
        MB["<code>memory/builder.ts</code><br/>buildInitialMemory · refreshMemory"]
        AG["<code>alerts/generator.ts</code><br/>regenerateAlerts"]
    end
    SM["session-manager"]
    DB[("memory_summary<br/>memory_sync_state<br/>alerts · insights")]
    HOME["home screen<br/>AlertsCard · MemorySummaryCard · InsightCard"]

    MB --> SM
    AG --> SM
    MB --> DB
    AG --> DB
    DB --> HOME
```

Because these run through `assertProxyReadContext` like everything else, they fail safe
rather than mixing a family member's data into the account holder's caches.

## Testability

Every interactive element carries a `testID` (and an `accessibilityLabel`), enforced in CI
by `expo-app/src/__tests__/testids.unit.test.ts`, which scans every `.tsx` under
`src/app` and `src/components`. `tool-catalog.ts` is deliberately kept free of React Native
imports so the parity and catalog tests can import it in plain Bun.

UI automation goes through `maestro-cli` against a session-dedicated simulator — see
[`docs/ios-simulator.md`](../ios-simulator.md) for the recipe. CI additionally smokes the
Android build; see [06](06-supporting-services.md).
