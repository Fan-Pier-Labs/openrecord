# Authentication

MyChart has no public API and no OAuth for patients, so `mychart-cli` signs in the way a person
does: username, password, and a second factor. This page explains the options, which one to pick,
and the two rules that keep unattended sign-in working.

## Pick a method

| Method | Human needed per login? | Best for | Set up with |
| --- | --- | --- | --- |
| **Passkey** | No, and no 2FA at all | Scripts, cron jobs, servers, AI agents | `mychart-cli --host <host> --set-up-passkey` |
| **Password + TOTP secret** | No | Unattended use when you'd rather not use a passkey | `mychart-cli --host <host> --set-up-totp` |
| **Password + emailed/texted code** | Yes, every time a session can't be resumed | Interactive use | nothing |
| **Saved session** | No, until it expires (~15 min idle) | Handing a session between processes | `client.serialize()` |

All of them run on your machine. Passkeys and TOTP secrets are **added to your MyChart account**.
They show up in MyChart's security settings, and you can remove them there or with
`--delete-passkey` / `--disable-totp`.

## Passkeys

A passkey is a WebAuthn credential, the same mechanism MyChart's own app uses for "sign in with
Face ID". `mychart-cli` holds it in software as a private key in a JSON file. When MyChart issues
a challenge, the CLI or library signs it, and MyChart lets you in without a password or 2FA.

### Set one up

The CLI does it in one interactive run. You sign in with your password and 2FA code once, and the
passkey is registered and saved:

```bash
mychart-cli --host mychart.example.org --set-up-passkey
```

```
./.passkey-credentials/mychart.example.org.json
```

From then on, `mychart-cli --host mychart.example.org` finds the file and signs in with no
prompts. Add `.passkey-credentials/` to `.gitignore` right away, because the file holds a private
key.

From code, register one on a client you already connected:

```ts
import { serializeCredential } from 'mychart-cli';

const credential = await client.setupPasskey();          // null if MyChart refused
if (credential) await fs.writeFile(file, serializeCredential(credential));
```

### Sign in with it

```ts
import { MyChartClient, deserializeCredential, serializeCredential } from 'mychart-cli';

const credential = deserializeCredential(await fs.readFile(file, 'utf8'));
const result = await MyChartClient.connectWithPasskey({ hostname, credential });
await fs.writeFile(file, serializeCredential(credential));   // ← required, see below
```

### `signCount` must be saved after every login

> [!IMPORTANT]
> A passkey is **not a static key**. It carries a counter, `signCount`, that goes up by one every
> time it signs in. MyChart remembers the last value it accepted, and it **rejects any login whose
> counter isn't higher**, because that's how WebAuthn detects a cloned authenticator.
>
> So: **load → sign in → save**, every time. The library advances `credential.signCount` in place.
> Writing the object back is your job. A silent re-login during the session advances it again, so
> save once more before you exit.
>
> Don't bake a passkey into a Docker image, an environment variable, or anything else you can't
> write back to. Don't copy one file to two machines either. Treat it like a rotating token.

**If a passkey login fails unexpectedly**, the local counter has probably fallen behind the
server's. For example, a copy was used elsewhere, or a script signed in without saving. Fix it by
raising `signCount` in the JSON file by **exactly one** and trying again. The file should hold the
count MyChart last accepted, and the next login adds one before signing. Don't jump to a round
number like 100. That works once and leaves the file just as wrong, so the same failure comes
back later looking new. If several single steps in a row fail, the counter isn't the problem.
Check that the passkey still exists with `--list-passkeys`.

The CLI does all of this for you. It saves the counter after every login, and when a passkey
login is rejected it retries with the counter raised one step at a time, up to 10 times. The
library leaves both to you.

### Manage passkeys

| Task | CLI | Library |
| --- | --- | --- |
| List | `--list-passkeys` | `client.listPasskeys()` |
| Remove one | `--action delete_passkey --arg raw_id=<rawId>` | `client.deletePasskey(rawId)` |
| Remove all | `--delete-passkey` | — |

## TOTP (authenticator app)

If MyChart allows authenticator apps, `mychart-cli` can enroll one and keep the secret. It then
generates 6-digit codes itself, with no email or text.

```bash
mychart-cli --host mychart.example.org --set-up-totp
```

```bash
mychart-cli --host mychart.example.org --use-saved-totp
```

The secret is saved to `./.totp-secrets/<host>.txt`. The CLI also offers TOTP setup after any
successful login that used an emailed or texted code.

From code:

```ts
const { secret, error } = await client.setupTotp(password);        // persist `secret` yourself

const result = await MyChartClient.connect({ hostname, user, pass, totpSecret: secret, skipSendCode: true });
const client =
  result.state === 'connected' ? result.client
  : result.state === 'need_2fa' ? await result.complete(await MyChartClient.totpCode(secret), { isTOTP: true })
  : null;
```

Passing `totpSecret` to `connect` also lets a mid-session silent re-login answer 2FA by itself.
`parseTotpUri('otpauth://…')` extracts the secret from an authenticator QR code's URI, and
`generateTotpCode(secret)` derives a code without a client.

To turn it off, use `--disable-totp` or `client.disableTotp(password, secret)`. Both need the
password and the saved secret.

## Password and 2FA code

```ts
const result = await MyChartClient.connect({ hostname, user, pass });
switch (result.state) {
  case 'connected':     return result.client;                    // no 2FA on this account
  case 'need_2fa':      return result.complete(await prompt(`Code sent to ${result.delivery?.contact}`));
  case 'invalid_login': throw new Error('Wrong username or password');
  case 'error':         throw new Error(result.error);
}
```

- `delivery` says whether the code went by `email` or `sms`, and to which masked address.
- `complete()` throws on a wrong code. You can call it again with a corrected one. That never
  asks MyChart to send another code.
- `skipSendCode: true` stops MyChart from sending an email or text at all. Use it when you'll
  answer with a TOTP code.

> [!WARNING]
> Each `connect()` that reaches the 2FA step makes MyChart **send a code to the patient's phone or
> email**. Don't call it in a loop or a retry handler. Resume a saved session, or use a passkey.

## Sessions

Once signed in, a client keeps its session alive with a keepalive ping every 30 seconds. If MyChart
expires it anyway, the client signs in again silently with the credentials it connected with,
restores the active family-member record, and retries the call once. Set `autoRenew: false` to get
a `SessionExpiredError` instead.

To hand a session to another process:

```ts
const json = await client.serialize();            // contains live session cookies — keep it private
const restored = await MyChartClient.fromSerialized(json);
if (restored && await restored.isSessionValid()) { /* use it */ }
```

A restored client has no credentials, so it can't renew. When the session lapses, connect again.
The CLI does the same thing automatically with `.cookie-cache/<host>.json`.

## Family records

MyChart lets some accounts open other people's charts, for example a parent's account opening a
child's. Which chart is open is **state on MyChart's server**, attached to the session, and every
read returns whatever that state says. There's no per-request patient parameter.

That creates a real risk: a session resumed from a cache, or shared between calls, can still be
pointed at the child from an earlier run, and a plain "get medications" would quietly return the
child's list. So OpenRecord never reads a chart without checking whose it is:

- Every chart read via the CLI or `runCapability` asserts the record first. With no `patient`
  given, it asserts **the account holder**.
- A mismatch is a refusal that names the fix (`--switch "<name>"` / `switchToPatient(name)`),
  never a silent switch.
- Switching is its own explicit command, and it is verified against the profile page before it
  reports success.

The typed `MyChartClient` methods and raw scrapers **don't** run this check. Call
`client.assertProxyReadContext(patient?)` yourself when an account has proxy access. The
[API reference](api.md#family-records) shows the calls.

## Where credentials live

| Client | Location |
| --- | --- |
| CLI | `./.cookie-cache/`, `./.passkey-credentials/`, `./.totp-secrets/` in the current directory. Move them with `MYCHART_PASSKEY_DIR` / `MYCHART_TOTP_DIR` |
| Library | Nowhere. You decide where to persist the passkey, TOTP secret or serialized session |
| Claude Desktop extension | `~/.openrecord-mcpb/`, with secrets in the OS keychain under the `openrecord-mcpb` service |
| Mobile app | The device keychain (expo-secure-store) |

None of these leave your machine. Credentials are never sent to Fan Pier Labs or to an AI
provider.
