# Task: turn an Epic-encrypted `WP-…` id back into what it names

**Status:** open, unassigned. Nothing in the repo depends on this succeeding — `get_care_team`
already ships the honest answer (`npi: null`) where the value is encrypted. This is about
whether we can do better than null.

## The problem

MyChart's care team returns `NationalProviderID`, and the name is a lie on at least one real
instance: instead of a 10-digit NPI it holds an Epic-encrypted blob, the same envelope `ID`
and `DepartmentID` use. Feeding it to `lookup_npi` fails the check digit, which is how this
was found. Evidence: **1 real instance, 7/7 providers encrypted**; no instance has yet been
observed sending digits.

The escaping is `-24` → `$`, `-2B` → `+`, `-2F` → `/`, `-3D` → `=`. Unescaped, the value is:

```
WP$<base64 of 16 bytes>$<base64 of 32 bytes>
```

Both halves are high-entropy binary — a 16-byte prefix (IV or salt) and 32 bytes of
ciphertext, i.e. two AES blocks, which is already more plaintext than ten digits needs. The
key is Epic's and lives server-side, so **offline decryption is not the expected outcome.**
Treat "prove it cannot be done client-side, and say why in one paragraph" as a perfectly good
result of this task.

A synthetic example of the shape, from `fake-mychart/src/data/homer.ts` (never paste a real
patient's token into this repo, a PR body, or a commit message):

```
WP-24addk7JhW5D2Y7furM-2Fsq6g-3D-3D-24wkEbOpgwj-2BI6yU-2BjOXcb8vmpbfc9gRrDFP8lSGOXeVQ-3D
```

## What is actually worth trying

In rough order of expected value:

1. **Find an endpoint that takes the token and answers with the plaintext.** This is the
   realistic win: the server holds the key, so ask the server. The care-team activity is
   legacy jQuery (`/Clinical/CareTeam`, its JS in `careteam.min.js`) and its providers carry
   `CanViewProviderDetails`, `WebPageUrl` and `InfoBlurbUrl` — find what the "provider
   details" click actually posts, and whether anything in that response is a plain NPI.
   `scrapers/SCRAPING.md` is the method for this.
2. **Establish whether the tokens are even stable.** `fake-mychart/README.md` says `WP-…` ids
   are "meaningless outside the session that produced it" — if that holds here, the token is
   not a durable identifier and option 1 is the only path that ever leads anywhere. Two
   logins, same account, diff the care team.
3. **Check whether any other MyChart surface names a provider's NPI at all** (visit details,
   documents, a CCDA/EHI export). Today no scraper in this repo has ever seen one.

## Constraints — read before touching an account

- **Never take an action that could trigger a 2FA SMS to the user without asking first.**
- **The MCPB's keychain items are the MCPB's.** Reading is fine; do not write them. Note the
  trap that stopped this investigation the first time: using the stored passkey from a probe
  script advances the server's WebAuthn sign count past what the keychain item holds, and the
  extension's next login then fails. Either get the user to hand you credentials for a probe,
  or accept the +1 repair documented in [`../cli.md`](../cli.md#sign-count) with their say-so.
- **No PII in git.** Provider names, tokens, NPIs from a real chart — none of it lands in a
  commit, a doc, or a PR body. Synthesize.

## If it works

Three things change, in one PR:

- `scrapers/myChart/chart/careTeam/careTeam.processor.ts` — `npi` stops being "the value when
  it happens to be an NPI" and starts being the decrypted/looked-up one. The derived-field
  rules are in [`../processor-layer-proposal.md`](../processor-layer-proposal.md).
- `scrapers/myChart/chart/careTeam/README.md` and `scrapers/npi/README.md` — both currently
  state, as fact, that MyChart is not a source for an NPI.
- `fake-mychart` — it serves the encrypted shape because that is the only shape observed. If
  a real instance turns out to serve digits somewhere, the fake follows the capture, not the
  convenience.
