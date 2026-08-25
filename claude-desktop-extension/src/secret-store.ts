/**
 * OS-keystore storage for the MCPB's secrets — passwords, TOTP secrets, passkeys.
 *
 * All three are credentials to a medical record, and a passkey is the sharpest
 * of them: a raw ECDSA P-256 private key that logs in without a password and
 * without 2FA. In plaintext files under the home directory they ride along into
 * Time Machine snapshots, cloud-synced home directories and any backup tarball,
 * and macOS grants no TCC protection to `~/.openrecord-mcpb`. Handing them to
 * the OS keystore encrypts them at rest and scopes them to the logged-in user.
 *
 * **What this does not buy.** On every platform the keystore is unlocked
 * whenever the user is logged in, and the item is readable by anything running
 * as that user. This is protection for data at rest and against other users on
 * the box — not against local code running as you.
 *
 * `@napi-rs/keyring` is the binding (the maintained successor to keytar), so
 * each platform goes through its real API — Keychain Services, Windows
 * Credential Manager, or the Secret Service — rather than a CLI. That matters
 * beyond tidiness: shelling out to `security(1)` silently truncates any secret
 * over 128 bytes at its stdin prompt, and pops a modal offering to reset the
 * user's keychain search list when no keychain resolves. Neither failure mode
 * exists here.
 *
 * **The file is still the fallback.** The native module may not load (an
 * unsupported platform, a stripped install), and the keystore may be unusable
 * (a locked keychain, a headless Linux box with no Secret Service). Neither may
 * cost the user their saved login, so the secret lands in the 0600 file
 * instead — exactly where it lived before this module existed.
 */

/** The keychain service / credential target all our items are filed under. */
const SERVICE = 'openrecord-mcpb';

export type BackendName =
  | 'keychain'
  | 'credential-manager'
  | 'secret-service'
  | 'keyring'
  | 'file';

/**
 * The plaintext file a secret used to live in, supplied by the caller so this
 * module never learns any caller's file layout. Reading it is also how
 * migration works: the first keystore read that misses looks here.
 */
export interface FileSlot {
  read(): string | undefined;
  write(secret: string): void;
  clear(): void;
}

/** The slice of `@napi-rs/keyring` we use — all synchronous. */
interface KeyringEntry {
  setPassword(password: string): void;
  getPassword(): string | null;
  deleteCredential(): boolean;
}
interface KeyringModule {
  Entry: new (service: string, account: string) => KeyringEntry;
}

/** What the platform's credential store is actually called, for diagnostics. */
const DISPLAY_NAME: Record<string, BackendName> = {
  darwin: 'keychain',
  win32: 'credential-manager',
  linux: 'secret-service',
};

// ── Loading the native module ───────────────────────────────────────────────

/**
 * Loaded lazily and defensively. This is the one dependency in the MCPB that is
 * not pure JS, so it is also the one that can fail to load — a platform with no
 * prebuilt binary, or a package that got stripped on the way into the bundle.
 * A health-records server must not fail to start over where it files a secret,
 * so a load failure degrades to the file rather than throwing.
 *
 * `require` rather than a static import: the module is external to the tsup
 * bundle and resolves at runtime, and a static import would make a load failure
 * unrecoverable — the server would not start at all.
 */
function loadKeyring(): KeyringModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@napi-rs/keyring') as KeyringModule;
  } catch {
    return null;
  }
}

/**
 * `OPENRECORD_SECRET_BACKEND`:
 *   auto (default) — use the OS keystore, fall back to the file on any failure
 *   os | keychain  — use the OS keystore and fail loudly rather than write plaintext
 *   file           — plaintext file only, the pre-keystore behaviour
 */
type Mode = 'auto' | 'os' | 'file';

function mode(): Mode {
  const raw = (process.env.OPENRECORD_SECRET_BACKEND ?? '').trim().toLowerCase();
  if (raw === 'file') return 'file';
  if (raw === 'os' || raw === 'keychain') return 'os';
  if (raw === 'auto') return 'auto';
  // Unset. Under a test runner that means the file: otherwise every suite
  // touching the store would write items into the developer's own login
  // keychain, which is not something a suite may do — and on CI it would fail
  // outright. Setting the variable explicitly still opts back in, so the
  // keystore stays exercisable.
  return process.env.NODE_ENV === 'test' ? 'file' : 'auto';
}

/** undefined = not yet probed, null = deliberately none (file only). */
let cached: KeyringModule | null | undefined;

function keyring(): KeyringModule | null {
  if (cached !== undefined) return cached;
  const m = mode();
  if (m === 'file') {
    cached = null;
    return cached;
  }
  cached = loadKeyring();
  if (!cached) {
    if (m === 'os') {
      throw new Error('@napi-rs/keyring could not be loaded and no OS keystore is available');
    }
    console.error(
      '[openrecord] @napi-rs/keyring could not be loaded; ' +
        'storing passkeys in ~/.openrecord-mcpb instead',
    );
  }
  return cached;
}

/**
 * Take the keystore out of play for the rest of the process. Called after an
 * operation fails in `auto` mode: a locked keychain or an absent Secret Service
 * will still be locked or absent on the next call, and retrying it on every
 * passkey read just pays the same error twice.
 */
function demote(op: string, err: unknown): void {
  cached = null;
  console.error(
    `[openrecord] OS keystore unavailable (${op}: ${(err as Error).message}); ` +
      'falling back to file storage under ~/.openrecord-mcpb',
  );
}

/** Which backend secrets are actually going to right now, for diagnostics. */
export function activeBackend(): BackendName {
  if (!keyring()) return 'file';
  return DISPLAY_NAME[process.platform] ?? 'keyring';
}

function entryFor(key: string, mod: KeyringModule): KeyringEntry {
  return new mod.Entry(SERVICE, key);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Read a secret, preferring the keystore and migrating on the way.
 *
 * A hit in the plaintext file when the keystore has nothing is an install that
 * predates this module: the secret is promoted into the keystore and the
 * plaintext copy deleted, so a user upgrades without re-registering a passkey
 * and without leaving the old copy behind.
 */
export function readSecret(key: string, slot: FileSlot): string | undefined {
  const mod = keyring();
  if (mod) {
    try {
      const found = entryFor(key, mod).getPassword();
      if (found !== null) return found;
    } catch (err) {
      if (mode() === 'os') throw err;
      demote('read', err);
    }
  }

  const fromFile = slot.read();
  if (fromFile === undefined) return undefined;

  const target = keyring();
  if (target) {
    try {
      entryFor(key, target).setPassword(fromFile);
      slot.clear();
    } catch (err) {
      // A failed promotion still returns the secret: it must not look like a
      // missing passkey and send the user back through password + 2FA.
      if (mode() === 'os') throw err;
      demote('migrate', err);
    }
  }
  return fromFile;
}

/**
 * Write a secret to the keystore, or to the file if there isn't one. A
 * successful keystore write clears any plaintext copy, so the two can never
 * disagree about which one is current.
 */
export function writeSecret(key: string, secret: string, slot: FileSlot): void {
  const mod = keyring();
  if (mod) {
    try {
      entryFor(key, mod).setPassword(secret);
      slot.clear();
      return;
    } catch (err) {
      if (mode() === 'os') throw err;
      demote('write', err);
    }
  }
  slot.write(secret);
}

/** Clear both copies — a stale plaintext file would resurrect a deleted secret. */
export function clearSecret(key: string, slot: FileSlot): void {
  const mod = keyring();
  if (mod) {
    try {
      entryFor(key, mod).deleteCredential();
    } catch (err) {
      // Deleting something that was never there is not a failure worth
      // reporting, but a locked keystore is.
      if (mode() === 'os') throw err;
      demote('clear', err);
    }
  }
  slot.clear();
}

// ── Diagnostics / tests ─────────────────────────────────────────────────────

export const _internals = {
  SERVICE,
  /** Forget the loaded module, so a test can change platform or env. */
  resetCache(): void {
    cached = undefined;
  },
  /** True when the native binding is present — asserted by the packaging test. */
  keyringLoads(): boolean {
    return loadKeyring() !== null;
  },
  /** Swap in a stub module, so backend behaviour is testable without a keystore. */
  setKeyringForTests(mod: KeyringModule | null): void {
    cached = mod;
  },
};
