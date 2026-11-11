# Login modes: machine vs human

Every sign-in with stored credentials goes through one of two functions in
[`scrapers/myChart/auth/loginModes.ts`](../scrapers/myChart/auth/loginModes.ts):

| | `machineLogin` | `humanLogin` |
| --- | --- | --- |
| Who asked | Nobody — a renewal, a background job | A person, directly or through Claude |
| Can make MyChart text/email a code | **Never** | Yes, when nothing stored gets past 2FA |
| Outcomes | `logged_in` · `needs_human` · `failed` | `logged_in` · `need_2fa` (+ pending login) · `invalid_login` · `failed` |

**The rule:** a code may only be sent by a caller that keeps the pending login and can accept the
code afterwards. A renewal hook can't: it runs inside a request, with no way to ask anyone for a
code, so a code it sent could never be used. It would also send a fresh one on every expiry.

They are two functions rather than a flag, so a background caller can't pick the wrong mode by
accident.

## Who triggers what

A tool call is **human-triggered**: the user asked Claude, and Claude called the tool. Claude can
relay the code back through `complete_2fa`. Mid-request renewal is **machine** even inside a
human-triggered tool call, because nothing can collect a code there.

```mermaid
flowchart LR
  subgraph Human["Human-triggered: may send a code"]
    direction TB
    H1["MCPB data tool call<br/>(user asked Claude)"]
    H2["MCPB setup_account /<br/>connect_imported_account"]
    H3["CLI login<br/>(user ran the command)"]
    H4["iOS app sign-in screen<br/>(onboarding)"]
    H5["npm MyChartClient.connect<br/>(library caller decides)"]
  end
  subgraph Machine["Machine-triggered: never sends a code"]
    direction TB
    M1["Session renewal mid-request<br/>(makeAuthenticatedRequest → reauthenticate)<br/>— every client"]
    M2["iOS app chat tools, alerts,<br/>memory builder (connectAll)"]
    M3["Keepalive heartbeat<br/>(never logs in at all)"]
  end
  Human --> HL["humanLogin()<br/>or the raw login + complete2faFlow"]
  M1 --> ML["machineLogin()"]
  M2 --> ML
  M3 -. "marks session expired only" .-> X(("no login"))
```

The iOS app's chat is human-triggered by the definition above. It uses machine mode only because
the app has nowhere outside onboarding to type a code. A code sent from chat would be one nobody
could enter.

## The shared ladder

Both modes climb the same ladder. They differ at one step: what happens at a 2FA wall when no TOTP
secret is stored.

```mermaid
flowchart TD
  start(["machineLogin / humanLogin"]) --> pk{"Passkey saved?"}
  pk -- yes --> pkl["Passkey login<br/>(with signature-counter retry)"]
  pkl -- logged in --> ok(["logged_in"])
  pkl -- "rejected → onPasskeyInvalid<br/>or network error → keep passkey" --> pw
  pk -- no --> pw{"Username + password saved?"}
  pw -- no --> fail1(["failed: no stored credentials"])
  pw -- yes --> dologin["DoLogin with password<br/>SendCode skipped if machine mode or TOTP saved"]
  dologin -- home page --> ok
  dologin -- login failed --> bad(["human: invalid_login<br/>machine: failed"])
  dologin -- "2FA page" --> totp{"TOTP secret saved?"}
  totp -- yes --> gen["Generate code locally,<br/>complete2faFlow"]
  gen -- accepted --> ok
  gen -- rejected --> fail2(["failed: TOTP code rejected"])
  totp -- no --> mode{"Which mode?"}
  mode -- machine --> nh(["needs_human<br/>no code was sent"])
  mode -- human --> sent(["need_2fa + pending login<br/>MyChart texted/emailed a code"])

  classDef human fill:#fde68a,stroke:#b45309,color:#000;
  classDef machine fill:#bfdbfe,stroke:#1d4ed8,color:#000;
  class sent human;
  class nh machine;
```

## Desktop extension (MCPB): a data tool call

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Claude
  participant T as Data tool (get_medications…)
  participant S as session-manager
  participant M as MyChart

  U->>C: "What meds am I on?"
  C->>T: get_medications(account)
  T->>S: resolveSession(account)
  alt live in-memory session or valid cookie cache
    S-->>T: session
  else pending login already waiting on a code
    S-->>T: NeedsTwoFactorError (same pending_id, nothing sent)
  else
    S->>M: humanLogin: passkey → password → TOTP
    alt signed in
      M-->>S: home page
      S-->>T: session
    else 2FA wall, no TOTP
      S->>M: SendCode
      M-->>U: SMS / email with code
      S-->>T: NeedsTwoFactorError(pending_id)
    end
  end
  T-->>C: {state: need_2fa, pending_id}
  C->>U: "MyChart sent you a code — what is it?"
  U->>C: 123456
  C->>T: complete_2fa(pending_id, code)
  T->>M: Validate code
  M-->>T: signed in → session adopted
  C->>T: get_medications(account) again
```

Concurrent tool calls share one sign-in (the per-account login lock), and while a pending login
is unexpired (10 minutes) every call hands back its `pending_id` instead of sending another code.

## Session expiry in the middle of a call

```mermaid
sequenceDiagram
  autonumber
  participant T as Data tool
  participant R as makeAuthenticatedRequest
  participant H as reauthenticate hook
  participant M as MyChart

  T->>R: request
  R->>M: GET …
  M-->>R: bounced to /Authentication/Login
  R->>H: renew (single-flight per session)
  H->>M: machineLogin: passkey → password → TOTP
  alt renewed
    H-->>R: true (state adopted onto the same request object)
    R->>M: retry once, restore active proxy patient first
    M-->>T: data
  else needs_human / failed (no code sent)
    H-->>R: false
    R-->>T: SessionExpiredError
    Note over T: MCPB drops the session and tells Claude to call again.<br/>The next call signs in through humanLogin, as above.
  end
```

## What each client does

| Client | Human path | Machine path |
| --- | --- | --- |
| Desktop extension | `setup_account`, `connect_imported_account`, and the lazy sign-in behind every data tool (`humanLogin`) → `complete_2fa` | `reauthenticate` hook → `machineLogin` |
| CLI | `login()` in `npm-package/cli/cli.ts`: prompts for the code (or `--2fa`, or a saved TOTP) | `wireCliSessionRenewal` → `machineLogin` |
| iOS app | `connectAccount` (onboarding) → `humanLogin` → twofa step → `complete2fa` | `connectAll` / `requireSession` (chat, alerts, memory) and the `reauthenticate` hook → `machineLogin` |
| npm library | `MyChartClient.connect` returns `need_2fa` with `complete(code)`; `skipSendCode` is the caller's choice | `wireSilentReauthentication` → `machineLogin` |

## Unverified

The design assumes MyChart sends a code only when `SendCode` is called. The 2FA page offers
"email me" / "text me" buttons, which suggests it does, but it has not been confirmed on a real
account. To check: sign in with `machineLogin` to an account that has 2FA and no TOTP, and confirm
that no text or email arrives.
