# MyChart TOTP (Authenticator App) 2FA

## Summary

MyChart supports TOTP (Time-based One-Time Password) authenticator apps as a 2FA method alongside email and SMS. This enables fully autonomous login — no email access required.

## How It Works

When TOTP is enabled, MyChart presents the authenticator app as a 2FA option during login. The same 6-digit code format is used regardless of delivery method (email, SMS, or TOTP). The `/Authentication/SecondaryValidation/Validate` endpoint accepts TOTP codes identically to email/SMS codes.

**Key insight:** When using TOTP, the `SendCode` API call (which triggers email/SMS delivery) can be skipped entirely. The code is generated locally from the stored secret.

## 2FA Method Behavior

MyChart's 2FA supports multiple methods simultaneously. From a MyChart security settings page:

- **"Verify with email or text message"** — can be On/Off independently
- **"Verify with authenticator app"** — can be On/Off independently

The page states: *"One or more of these methods is required."*

When both methods are enabled, the 2FA page during login lets you choose which method to use. When only TOTP is enabled, it defaults to TOTP. When only email/SMS is enabled, it defaults to email/SMS.

**TL;DR:** You can enable TOTP alongside email — it's OR, not AND. You choose one method per login attempt.

## Portal Confirmation

Verified inside a MyChart portal at:
- **Security settings URL:** `https://mychart.example.org/MyChart/app/security-settings`
- **TOTP setup URL:** `https://mychart.example.org/MyChart/app/two-factor-authentication/totp-opt-in`
- **QR code page:** `https://mychart.example.org/MyChart/app/two-factor-authentication/qr-code`

The TOTP setup flow:
1. Navigate to Account Settings > Two-step verification > "Verify with authenticator app"
2. Enter password to verify identity
3. QR code is displayed with a "Show secret key" button
4. Secret key is a Base32-encoded string (e.g., 32 characters)
5. Enter a code from the authenticator app to verify setup

## API Endpoints (Discovered)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/secondary-validation/GetTwoFactorInfo` | POST | Check current 2FA settings (is TOTP enabled?) |
| `/api/secondary-validation/VerifyPasswordAndUpdateContact` | POST | Verify password before TOTP setup |
| `/api/secondary-validation/TotpQrCode` | POST | Get QR code data containing the TOTP secret |
| `/api/secondary-validation/VerifyCode` | POST | Verify TOTP code during setup |
| `/api/secondary-validation/UpdateTwoFactorTotpOptInStatus` | POST | Finalize TOTP opt-in after verification |
| `/Authentication/SecondaryValidation/Validate` | POST | Submit 2FA code during login (works for TOTP, email, and SMS codes) |

## CLI Usage

### Set up TOTP on a MyChart account

```bash
# First login (uses email 2FA), then sets up TOTP and saves the secret
NODE_ENV=development bun run cli mychart --host mychart.example.org --read-login-from-browser --set-up-totp
```

This will:
1. Log in with username/password
2. Complete email-based 2FA (one last time)
3. Navigate to security settings via API
4. Enable TOTP authenticator app
5. Save the secret to `.totp-secrets/<hostname>.txt` (gitignored)

### Use saved TOTP for login

```bash
# Uses the saved TOTP secret — no email code needed
NODE_ENV=development bun run cli mychart --host mychart.example.org --read-login-from-browser --use-saved-totp --action get-health-summary
```

This will:
1. Load the TOTP secret from `.totp-secrets/<hostname>.txt`
2. Log in with username/password
3. Skip the `SendCode` call (no email triggered)
4. Generate a TOTP code locally using `otplib`
5. Submit the code to complete 2FA
6. Proceed with the requested action

## Technical Details

### TOTP Specification
- **Algorithm:** HMAC-SHA1 (standard TOTP)
- **Digits:** 6
- **Period:** 30 seconds
- **Secret encoding:** Base32

### Library
Uses `otplib` (v13.x) for TOTP code generation. Single function:
```typescript
import { authenticator } from 'otplib';
const code = authenticator.generate(base32Secret);
```

### Secret Storage
- **CLI:** Plain text in `.totp-secrets/<hostname>.txt` (gitignored)
- **Web/MCP:** Should use `web/src/lib/mcp/encryption.ts` (AES-256-GCM) for encrypted storage

### Trust Device Cookie
MyChart's "Trust this device" checkbox (sent as `RememberMe=checked` in the Validate request) stores a cookie that skips 2FA for 30-90 days depending on the MyChart instance. Combined with TOTP, this means:
- First login: TOTP code needed
- Subsequent logins (within 30-90 days): No 2FA at all (cookie trusted)
- After cookie expires: TOTP code auto-generated, transparent to user

## Supported MyChart Instances

| Instance | TOTP Supported | Verified |
|---|---|---|
| Example Health (`mychart.example.org`) | Yes | Confirmed in-portal |
| Example Health System (`mychart.example.org`) | Unknown | Need to check in-portal |
| UCLA Health | Unknown | Need to check in-portal |

This is an Epic MyChart feature, so it's likely available across most modern MyChart deployments.
