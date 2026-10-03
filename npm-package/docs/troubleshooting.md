# Troubleshooting

## Signing in

**"Could not find credentials for <host>."**
No passkey is saved for that host, and no browser had a saved login for it. Pass
`--user`/`--pass`, or run with no flags to be prompted. Browser lookup only works on macOS and
Windows, and only for hosts confirmed to be MyChart portals.

**"<host> is not supported. central.mychart.org is a portal aggregator."**
`central.mychart.org` only links out to individual portals. Find your health system's own host:
`mychart-cli --action search_mycharts --arg query=<name>`.

**"Login failed: Invalid username or password."**
Check that you can sign in on the portal's website with the same username and password.

**The 2FA code is rejected.**
Use the most recent code MyChart sent. Retrying at the prompt never sends a new one. In a script,
pass `--2fa <code>`, or better, set up a passkey or TOTP so no code is needed.

**"Invalid 2FA code" with `--use-saved-totp`.**
The saved secret doesn't match what MyChart has, or the computer's clock is off. TOTP codes depend
on the current time. If TOTP was reset on the website, run `--set-up-totp` again.

**Passkey login suddenly fails.**
Almost always the counter fell behind, for example because a copy of the passkey was used
elsewhere or a script signed in without saving it. The CLI retries with a raised counter on its
own. If it still fails, open `.passkey-credentials/<host>.json`, raise `signCount` by **exactly
one**, and retry. Don't jump to a round number. If several single steps fail, check the passkey
still exists: `--list-passkeys`. If it was removed on the website, register a new one with
`--set-up-passkey`. The full explanation is in
[authentication](authentication.md#signcount-must-be-saved-after-every-login).

**A macOS prompt asks to access "Chrome Safe Storage" (or similar).**
That's the browser password lookup asking the Keychain for the key that decrypts saved passwords.
It's read-only. Deny it, and the CLI simply won't find browser logins. Pass `--user`/`--pass`
instead.

**Every run asks me to sign in again.**
The session cache lives in `.cookie-cache/` in the **current directory**, so run from the same
directory each time. MyChart also expires idle sessions after roughly 15 minutes. A passkey or
saved TOTP secret makes re-signing silent.

## Reading data

**"Refusing to read: <host> is currently on <someone>, but this command is about <someone else>."**
Your account has proxy access to a family member's chart, and MyChart's active record isn't the
one the command is about. Without `--patient`, a command is about the account holder. Either
switch (`--switch "<name>"`, or `--switch me`), or say whose chart you want
(`--patient "<name>"`). See [family records](cli.md#family-records---patient-and---switch).

**"<host> has access to only one patient record, so --patient cannot be used."**
Drop `--patient`. That account has no proxy access.

**"<capability> has no argument "<name>". It accepts: …"**
A typo, or an argument from a different capability. Names are snake_case. Check
`mychart-cli --list-capabilities --show-all`.

**A category comes back empty.**
Many portals switch features off. Goals, care journeys and education materials are empty on most
charts, which is why `--help` hides them by default. An empty list from a feature the portal
doesn't offer is expected.

**"No request verification token on …"** (`MissingVerificationTokenError`)
The page a scraper needed didn't load properly. Usually the session expired, or the portal doesn't
offer that feature. Retry with `--no-cache`. If it persists on one capability only, that portal
probably doesn't support it.

**`BillingNotFullyLoadedError`**
MyChart held back some charge rows it then wouldn't return. Rather than report a balance that's
too low, the read fails. Retry later.

**`request_refill` says "NOT IMPLEMENTED".**
That's deliberate. The refill request has never been confirmed to reach a real pharmacy, and a
request that silently doesn't arrive is worse than none. Request refills in MyChart directly.

## Output and files

**I can't pipe the output into `jq`.**
The CLI prints banners and progress lines around the JSON on stdout, because it's built for
reading. For machine use, call the [library](api.md), which returns plain objects. Or run one
`--action` and cut everything before the first `{` or `[`.

**Where did my download go?**
Attachments, statements and documents go to `--output <dir>`, or the current directory. Images go
to `--output`, or `./imaging-output/`. The printed JSON includes each file's path.

**`sharp` fails to install or load.**
`sharp` is a native image library used to encode downloaded images. Its prebuilt binaries cover
macOS, Windows and common Linux, but some platforms (Alpine/musl, unusual architectures) need
extra steps; see the [sharp installation guide](https://sharp.pixelplumbing.com/install). The
pure-JS `convertCloToJpgPureJs` avoids it entirely in your own code.

## Still stuck?

Run with the sandbox (`--host fake-mychart.fanpierlabs.com --user homer --pass donuts123 --2fa
123456`) to tell a setup problem apart from a portal-specific one. Then
[open an issue](https://github.com/Fan-Pier-Labs/openrecord/issues). Include the command, the
portal's hostname and the error. **Never paste output that contains your medical data,
passwords, or the contents of `.passkey-credentials/`, `.totp-secrets/` or `.cookie-cache/`.**
