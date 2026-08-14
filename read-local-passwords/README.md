# read-local-passwords

Reads the MyChart logins a user already has saved in their browser, so setup can offer to reuse one
instead of asking them to type a password — the way a browser offers to import from another browser.

**Read-only, and local.** Nothing here writes to a browser store, to the OS keychain, or to the
network with a credential attached. Decrypted passwords never leave the process: the MCPB's
`import_browser_passwords` returns an opaque `import_id` and holds the credential in memory for ten
minutes, because tool results are sent to the model.

Consent is the OS prompt. On macOS the master key lives in the login Keychain, so the first scan
raises *"…wants to access your keychain"*. That prompt is deliberately not suppressed.

Only accounts that can be **confirmed** are returned; see below.

Supported on **macOS and Windows**. Linux returns nothing (Chromium there uses kwallet/gnome-keyring
or an unencrypted fallback, and Claude Desktop does not ship on Linux).

## What it reads

| Browser | Store | Master key |
| --- | --- | --- |
| Chrome, Arc, Brave, Edge, Vivaldi, Opera | `Login Data` (SQLite), `logins` table | macOS: PBKDF2-SHA1(`<Browser> Safe Storage` from the Keychain, salt `saltysalt`, 1003 iterations, 16 bytes). Windows: DPAPI-unwrapped `os_crypt.encrypted_key` from `Local State` |
| Firefox | `logins.json` + `key4.db` | NSS: the wrapped keys in `nssPrivate`, unlocked with the (empty) primary password |

Up to five profile directories per Chromium browser (`Default`, `Profile 1`…`Profile 4`).

## Things that are easy to get wrong

Each of these was found by running against a real profile, not by reading the format.

**Firefox uses AES-256-CBC, not 3DES.** The cipher is named per field in the login's ASN.1, so it
has to be dispatched on. A decryptor that hardcodes 3DES — as most published examples do — fails on
every login in a current profile.

**The NSS PBES2 IV is stored as 14 bytes.** The real AES IV is `04 0e` followed by those 14: NSS
stores the OCTET STRING contents and reconstructs the two-byte DER header. Passing the raw 14 bytes
fails outright.

**`nssPrivate` holds several keys sharing one CKA_ID.** A long-lived profile has both a 24-byte
legacy 3DES key and a 32-byte AES key under `f800…0001`, so the id cannot discriminate between them.
Keys are selected by the length the field's cipher needs.

**Chromium `v20` blobs cannot be decrypted.** Chrome 127+ on Windows uses app-bound encryption, which
ties the key to the Chrome executable by design. Those rows are reported with a reason rather than
counted as corrupt.

**The database is always copied before reading.** The browser may be running and holding locks, with
`-wal`/`-journal` siblings. The copy goes to a fresh temp directory and is removed in a `finally`.

## Deciding what is actually MyChart

`myChartFilter.ts` combines two checks as a union:

1. **Directory match** — the hostname is one of the ~1300 known instances in
   `scrapers/list-all-mycharts/mychart-instances.json`. Offline and exact, so it runs against every
   entry and short-circuits the network for most real hits.
2. **Redirect probe** — for hosts the directory does not know, follow the saved URL's redirects
   (through `scraperFetch`, one permit per hop) and look for Epic's login markup.

The probe is what handles a renamed or merged health system: the browser holds the password against
the *old* domain, and the 302 chain lands on the new one, which the directory does know. That
outcome is recorded as a directory match, and results are deduped on the **resolved** hostname so an
old domain and its successor collapse into one account.

Anything that passes neither is dropped. A host we cannot reach is a host we cannot log into, so
offering it would buy the user a failed login rather than an account — and there is always
`setup_account` for anything this misses, plus a later re-run for a portal that happened to be down.

A URL only qualifies for probing if it looks like a patient portal. A naive `epic` substring search
pulls in a games storefront and a ski pass from a real password store; both are dropped outright.

## Dependencies

`node-sqlite3-wasm` — SQLite compiled to WebAssembly. Deliberately not a native module: the MCPB
bundles to a single `dist/server.cjs` and a `.node` binary cannot be inlined. `node:sqlite` is not an
option either, since tsup targets node20 and that module needs Node 22.5+. The build copies
`node-sqlite3-wasm.wasm` next to the bundle, because the package resolves it from `__dirname`. It is
imported lazily so nothing pays to instantiate a 1.2 MB WASM module unless a scan actually runs.

All cryptography is `node:crypto`.

The Chromium extraction derives from [bojangabric/browser-password-extractor](https://github.com/bojangabric/browser-password-extractor)
(MIT). The Firefox path has been substantially rewritten for the three issues above.
