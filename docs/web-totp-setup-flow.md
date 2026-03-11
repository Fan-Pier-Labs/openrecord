# Web App: Automatic TOTP Setup Flow

When a user adds a MyChart account through the web app, we set up TOTP after their first successful email 2FA so that all future logins are fully autonomous (no email codes needed). The user is shown a confirmation step before we enable TOTP on their MyChart account.

## Current Flow (Broken)

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant W as Web App
    participant DB as PostgreSQL
    participant MC as MyChart Portal

    U->>W: Add Account (hostname, user, pass)
    W->>DB: Store encrypted credentials (no TOTP)
    W-->>U: Account added

    U->>W: Click "Connect"
    W->>MC: Login (user/pass)
    MC-->>W: need_2fa
    Note over W: No TOTP secret stored!
    W->>MC: SendCode (triggers email)
    W-->>U: Enter 2FA code
    U->>W: Submit email code
    W->>MC: Validate(code)
    MC-->>W: logged_in
    Note over W: Session active, but next<br/>login will need email 2FA again
```

## Proposed Flow (TOTP Setup with User Confirmation)

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant W as Web App
    participant DB as PostgreSQL
    participant MC as MyChart Portal

    U->>W: Add Account (hostname, user, pass)
    W->>DB: Store encrypted credentials
    W->>MC: Login (user/pass)
    MC-->>W: need_2fa

    rect rgb(255, 245, 230)
        Note over U,W: First-time email 2FA (one last time)
        W->>MC: SendCode (triggers email)
        W-->>U: Enter 2FA code
        U->>W: Submit email code
        W->>MC: Validate(code)
        MC-->>W: logged_in
    end

    rect rgb(230, 240, 255)
        Note over U,W: User confirmation step
        W-->>U: Show TOTP setup prompt:<br/>"Enable automatic sign-in?<br/>To access your MyChart account on your<br/>behalf, the AI agent needs to sign in<br/>automatically. We'll set up a TOTP<br/>authenticator so the agent can log in<br/>without requiring email codes each time."<br/>[Enable] [Skip]
        alt User clicks "Enable"
            U->>W: Confirm TOTP setup
        else User clicks "Skip"
            U->>W: Skip TOTP setup
            W-->>U: Show warning:<br/>"2FA not configured. Your session<br/>will expire in a few hours and require<br/>email verification to reconnect."<br/>[Retry] [Continue anyway]
            alt User clicks "Retry"
                U->>W: Retry TOTP setup
                Note over U,W: Return to TOTP setup prompt
            else User clicks "Continue anyway"
                W-->>U: Connected (no TOTP, limited session)
            end
        end
    end

    rect rgb(230, 255, 230)
        Note over W,MC: TOTP Setup (after user confirms)
        W->>MC: GET /Home/CSRFToken
        MC-->>W: CSRF token
        W->>MC: POST GetTwoFactorInfo
        MC-->>W: {isTotpEnabled: false}
        W->>MC: POST VerifyPasswordAndUpdateContact
        MC-->>W: {isPasswordValid: true}
        W->>MC: POST TotpQrCode
        MC-->>W: {encodedSecretKey: "BASE32SECRET..."}
        Note over W: Generate TOTP code from secret
        W->>MC: POST VerifyCode(generated code)
        MC-->>W: 200 OK
        W->>MC: POST UpdateTwoFactorTotpOptInStatus
        MC-->>W: 200 OK (TOTP enabled)
    end

    alt TOTP setup succeeds
        W->>DB: Store encrypted TOTP secret
        W-->>U: Connected + TOTP enabled
    else TOTP setup fails
        W-->>U: Show warning:<br/>"2FA not configured. Session will<br/>expire in a few hours."<br/>[Retry] [Continue anyway]
        alt User clicks "Retry"
            Note over U,W: Return to TOTP setup
        else User clicks "Continue anyway"
            W-->>U: Connected (limited session)
        end
    end

    Note over U,MC: All future logins use TOTP automatically

    U->>W: Click "Connect" (later)
    W->>MC: Login (user/pass)
    MC-->>W: need_2fa
    Note over W: Has TOTP secret!
    W->>MC: Validate(generated TOTP code)
    MC-->>W: logged_in
    W-->>U: Connected (no email needed)
```

## UI States

```mermaid
stateDiagram-v2
    [*] --> AddAccount: User submits credentials

    AddAccount --> LoggingIn: Credentials stored in DB
    LoggingIn --> Need2FA: MyChart requires 2FA
    LoggingIn --> Connected: No 2FA needed (rare)
    LoggingIn --> InvalidLogin: Bad credentials

    Need2FA --> WaitingForEmailCode: No TOTP secret
    WaitingForEmailCode --> EmailCodeSubmitted: User enters code
    EmailCodeSubmitted --> Authenticated: Code valid
    EmailCodeSubmitted --> WaitingForEmailCode: Code invalid

    Authenticated --> TOTPPrompt: Show confirmation UI

    TOTPPrompt --> SettingUpTOTP: User clicks "Enable"
    TOTPPrompt --> SessionWarning: User clicks "Skip"

    SessionWarning --> TOTPPrompt: User clicks "Retry"
    SessionWarning --> Connected: User clicks "Continue anyway"

    SettingUpTOTP --> TOTPReady: Secret obtained + verified
    SettingUpTOTP --> SessionWarning: Setup failed

    TOTPReady --> StoringSecret: Save encrypted secret to DB
    StoringSecret --> Connected: Done

    InvalidLogin --> [*]: Show error
    Connected --> [*]: Account ready
```

## TOTP Confirmation UI

After the email 2FA code is accepted, show a modal/card:

```
┌─────────────────────────────────────────────────┐
│  Enable automatic sign-in?                      │
│                                                 │
│  To access your MyChart account on your behalf, │
│  the AI agent needs to sign in automatically.   │
│  We'll set up a TOTP authenticator so the agent │
│  can log in without requiring email codes each  │
│  time.                                          │
│                                                 │
│  This adds an authenticator app to your MyChart │
│  security settings. You can disable it anytime  │
│  from your MyChart account.                     │
│                                                 │
│            [ Skip ]    [ Enable ]               │
└─────────────────────────────────────────────────┘
```

While TOTP setup is running (after user confirms):

```
┌─────────────────────────────────────────────────┐
│  Setting up automatic sign-in...                │
│                                                 │
│  ◠  Configuring your MyChart account            │
│                                                 │
│  This only takes a few seconds.                 │
└─────────────────────────────────────────────────┘
```

If user clicks "Skip" or TOTP setup fails, show a warning:

```
┌─────────────────────────────────────────────────┐
│  ⚠ 2FA not configured                          │
│                                                 │
│  Without automatic sign-in, your session will   │
│  only last a few hours. Once it expires, you'll │
│  need to log in again with email verification.  │
│                                                 │
│  The AI agent won't be able to reconnect to     │
│  your MyChart account automatically.            │
│                                                 │
│      [ Retry ]    [ Continue anyway ]           │
└─────────────────────────────────────────────────┘
```

## Connect Endpoint Changes

```mermaid
flowchart TD
    A[POST /connect] --> B{Session exists?}
    B -->|Yes| C[Return logged_in]
    B -->|No| D[Login with user/pass]

    D --> E{Login result?}
    E -->|logged_in| F[Store session, return]
    E -->|invalid_login| G[Return error]
    E -->|need_2fa| H{Has TOTP secret?}

    H -->|Yes| I[Generate TOTP code]
    I --> J[Submit TOTP code]
    J --> K{2FA success?}
    K -->|Yes| F
    K -->|No| L[Return error]

    H -->|No| M[Send email code]
    M --> N[Return need_2fa to client]
```

```mermaid
flowchart TD
    A[POST /twofa - user submits email code] --> B{Code valid?}
    B -->|No| C[Return invalid_2fa]
    B -->|Yes| D[Return logged_in + offer_totp_setup: true]

    D --> E[Client shows TOTP confirmation UI]
    E --> F{User choice?}
    F -->|Enable| H[POST /setup-totp]
    F -->|Skip| W[Show session warning]

    H --> I[Run setupTotp on active session]
    I --> J{Setup success?}
    J -->|Yes| K[Store TOTP secret in DB]
    K --> L[Return success]
    J -->|No| W

    W --> X{User choice?}
    X -->|Retry| E
    X -->|Continue anyway| G[Connected without TOTP - limited session]
```

## Implementation Plan

### 1. Modify `POST /api/twofa` response
- After successful email 2FA, include `offer_totp_setup: true` in response (when instance has no TOTP secret)
- Client uses this flag to show the confirmation UI

### 2. New API endpoint: `POST /api/mychart-instances/:id/setup-totp`
- Called when user clicks "Enable" in the confirmation UI
- Uses the active MyChart session to run `setupTotp(mychartRequest, password)`
- Stores the encrypted TOTP secret in the DB via `updateMyChartInstance()`
- Returns success/failure

### 3. Client-side UI changes (`home/page.tsx`)
- New state: `showTotpPrompt` (shown after email 2FA succeeds with `offer_totp_setup`)
- Confirmation card with "Enable" / "Skip" buttons
- Loading state while TOTP setup runs
- On success: refresh instances list (now shows TOTP indicator)
- On skip/failure: show session warning with Retry / Continue anyway options
- "Continue anyway" proceeds as connected but with limited session lifetime

### 4. Connect endpoint
- Already handles TOTP correctly (line 42-57 in current code)
- No changes needed -- just needs a TOTP secret in the DB

### Key files to modify
- `web/src/app/api/twofa/route.ts` -- add `offer_totp_setup` to response
- `web/src/app/api/mychart-instances/[id]/setup-totp/route.ts` -- new endpoint
- `web/src/app/home/page.tsx` -- TOTP confirmation UI
- `web/src/lib/db.ts` -- may need `updateTotpSecret()` helper (or use existing `updateMyChartInstance`)
