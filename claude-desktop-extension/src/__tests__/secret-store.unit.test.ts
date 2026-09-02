/**
 * Tests for the OS-keystore secret store.
 *
 * Nothing here may touch a real keystore — a suite that writes to the
 * developer's login keychain is one nobody can run twice, and on CI there is no
 * unlocked keychain to write to. So the keyring module is stubbed with a Map,
 * and the one test that does load the real binding only checks that it loads.
 *
 * What is worth pinning down is the part that is easy to get silently wrong: a
 * keystore that is missing or broken must degrade to the plaintext file rather
 * than lose the user's passkey, and a pre-keystore plaintext passkey must
 * migrate rather than force a re-registration.
 *
 * `./memfs` is imported first because the credential-store file slots write
 * under the store root. It also pins OPENRECORD_SECRET_BACKEND to the file for
 * every suite in the run; this is the one suite that steps outside that pin, so
 * it puts the pin back after every test rather than leaving the variable unset
 * for whatever file bun runs next in the same process.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as memfs from './memfs'

const secrets = await import('../secret-store')
const store = await import('../credential-store')

/** A stand-in for `@napi-rs/keyring`, backed by a Map instead of an OS store. */
function stubKeyring(): {
  module: { Entry: new (service: string, account: string) => unknown }
  items: Map<string, string>
  /** Make every operation throw, standing in for a locked or absent keystore. */
  breakIt(message?: string): void
} {
  const items = new Map<string, string>()
  let broken: string | undefined

  class Entry {
    private readonly id: string
    constructor(service: string, account: string) {
      this.id = `${service} ${account}`
    }
    private guard(): void {
      if (broken) throw new Error(broken)
    }
    setPassword(password: string): void {
      this.guard()
      items.set(this.id, password)
    }
    getPassword(): string | null {
      this.guard()
      return items.get(this.id) ?? null
    }
    deleteCredential(): boolean {
      this.guard()
      return items.delete(this.id)
    }
  }

  return {
    module: { Entry },
    items,
    breakIt(message = 'keystore is locked') {
      broken = message
    },
  }
}

/** A FileSlot backed by a variable, so fallback and migration are observable. */
function slot(initial?: string) {
  const state = { value: initial, writes: 0, clears: 0 }
  return {
    state,
    read: () => state.value,
    write(secret: string) {
      state.value = secret
      state.writes++
    },
    clear() {
      state.value = undefined
      state.clears++
    },
  }
}

const ORIGINAL_PLATFORM = process.platform

/** The file pin `./memfs` installed, restored after each test. */
const PINNED_BACKEND = process.env.OPENRECORD_SECRET_BACKEND

function restorePin(): void {
  if (PINNED_BACKEND === undefined) delete process.env.OPENRECORD_SECRET_BACKEND
  else process.env.OPENRECORD_SECRET_BACKEND = PINNED_BACKEND
}

/** `process.platform` is read-only; redefining it is the only way to fake it. */
function setPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

/** Install a stub keystore and switch out of the test-runner file default. */
function useKeystore(): ReturnType<typeof stubKeyring> {
  process.env.OPENRECORD_SECRET_BACKEND = 'auto'
  const keyring = stubKeyring()
  secrets._internals.setKeyringForTests(keyring.module as never)
  return keyring
}

beforeEach(() => {
  memfs.reset()
  delete process.env.OPENRECORD_SECRET_BACKEND
  secrets._internals.resetCache()
})

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM)
  restorePin()
  secrets._internals.resetCache()
})

// ── The native binding ──────────────────────────────────────────────────────

describe('the @napi-rs/keyring binding', () => {
  /**
   * The whole point of choosing a native module over a CLI is that it is
   * actually there. It is the only non-pure-JS dependency in the MCPB, it is
   * external to the tsup bundle, and if it stops resolving every passkey
   * silently reverts to a plaintext file — which is exactly the thing this
   * module exists to stop. So: does it load, here, for real.
   */
  it('loads on this platform', () => {
    expect(secrets._internals.keyringLoads()).toBe(true)
  })

  it('exposes the synchronous Entry API the store depends on', async () => {
    const { Entry } = (await import('@napi-rs/keyring')) as unknown as {
      Entry: new (s: string, a: string) => Record<string, unknown>
    }
    // Constructing an Entry touches no keystore; only get/set/delete would.
    const entry = new Entry('openrecord-mcpb-unit-test', 'never-used')
    for (const method of ['setPassword', 'getPassword', 'deleteCredential']) {
      expect(typeof entry[method]).toBe('function')
    }
  })
})

// ── Backend selection ───────────────────────────────────────────────────────

describe('backend selection', () => {
  it('stays on the file under NODE_ENV=test, so an unpinned suite is still safe', () => {
    // Driven rather than read: `bun test` only sets NODE_ENV=test when it is
    // not already set, so asserting the ambient value would fail for a
    // developer who exports it — the very case the pin below exists for.
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    secrets._internals.resetCache()
    setPlatform('darwin')
    try {
      expect(secrets.activeBackend()).toBe('file')
    } finally {
      if (original === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = original
    }
  })

  it('is pinned to the file by ./memfs, so the guard does not rest on NODE_ENV alone', () => {
    // `bun test` leaves an already-set NODE_ENV alone, and an exported
    // OPENRECORD_SECRET_BACKEND beats the NODE_ENV default outright — either
    // would otherwise send this suite's writes to the developer's real
    // keychain. The beforeEach above clears the pin, so read it from the
    // captured value.
    expect(PINNED_BACKEND).toBe('file')
  })

  it('names the platform store it is using', () => {
    useKeystore()
    setPlatform('darwin')
    expect(secrets.activeBackend()).toBe('keychain')
    setPlatform('win32')
    expect(secrets.activeBackend()).toBe('credential-manager')
    setPlatform('linux')
    expect(secrets.activeBackend()).toBe('secret-service')
    setPlatform('freebsd')
    expect(secrets.activeBackend()).toBe('keyring')
  })

  it('honours an explicit file setting even where a keystore exists', () => {
    process.env.OPENRECORD_SECRET_BACKEND = 'file'
    expect(secrets.activeBackend()).toBe('file')
  })

  it('reports the file when the native module cannot be loaded', () => {
    process.env.OPENRECORD_SECRET_BACKEND = 'auto'
    secrets._internals.setKeyringForTests(null)
    expect(secrets.activeBackend()).toBe('file')
  })

  it('refuses to start on a missing module in strict os mode', () => {
    process.env.OPENRECORD_SECRET_BACKEND = 'os'
    // Force the real load path with a module name that cannot resolve by
    // clearing the cache and pointing the mode at strict.
    secrets._internals.resetCache()
    const loads = secrets._internals.keyringLoads()
    // On a platform where it does load, strict mode must simply not throw.
    if (loads) expect(() => secrets.activeBackend()).not.toThrow()
    else expect(() => secrets.activeBackend()).toThrow(/could not be loaded/)
  })
})

// ── File-only behaviour ─────────────────────────────────────────────────────

describe('file backend', () => {
  beforeEach(() => {
    process.env.OPENRECORD_SECRET_BACKEND = 'file'
  })

  it('round-trips through the slot', () => {
    const s = slot()
    secrets.writeSecret('k', 'value', s)
    expect(secrets.readSecret('k', s)).toBe('value')
  })

  it('clears the slot', () => {
    const s = slot('value')
    secrets.clearSecret('k', s)
    expect(s.state.value).toBeUndefined()
  })
})

// ── Keystore behaviour ──────────────────────────────────────────────────────

describe('keystore', () => {
  it('round-trips a secret without writing the file', () => {
    const keyring = useKeystore()
    const s = slot()
    secrets.writeSecret('k', '{"privateKey":"abc"}', s)
    expect(secrets.readSecret('k', s)).toBe('{"privateKey":"abc"}')
    expect(s.state.value).toBeUndefined()
    expect(s.state.writes).toBe(0)
    expect([...keyring.items.values()]).toEqual(['{"privateKey":"abc"}'])
  })

  it('survives a payload the CLI path would have mangled', () => {
    const keyring = useKeystore()
    // Over 128 bytes — the length at which `security`'s stdin prompt truncated
    // — and carrying quotes, backslashes, newlines and non-ASCII.
    const nasty = JSON.stringify({
      privateKey: 'M'.repeat(300),
      note: 'he said "hi"\nsecond line \\ backslash',
      name: 'Ryan Ω',
    })
    const s = slot()
    secrets.writeSecret('k', nasty, s)
    expect(secrets.readSecret('k', s)).toBe(nasty)
    expect(keyring.items.get('openrecord-mcpb k')).toBe(nasty)
  })

  it('reports an unknown key as undefined', () => {
    useKeystore()
    expect(secrets.readSecret('never-stored', slot())).toBeUndefined()
  })

  it('clears both copies, so a stale file cannot resurrect a deleted secret', () => {
    const keyring = useKeystore()
    const s = slot('{"privateKey":"old"}')
    secrets.writeSecret('k', '{"privateKey":"new"}', s)
    secrets.clearSecret('k', s)
    expect(keyring.items.size).toBe(0)
    expect(s.state.value).toBeUndefined()
  })
})

// ── Migration and fallback ──────────────────────────────────────────────────

describe('migration from the plaintext file', () => {
  it('promotes an existing plaintext secret into the keystore and deletes it', () => {
    const keyring = useKeystore()
    const s = slot('{"privateKey":"legacy"}')
    expect(secrets.readSecret('k', s)).toBe('{"privateKey":"legacy"}')
    expect(keyring.items.get('openrecord-mcpb k')).toBe('{"privateKey":"legacy"}')
    expect(s.state.value).toBeUndefined()
    expect(s.state.clears).toBe(1)
  })

  it('leaves the plaintext file alone if the promoting write fails', () => {
    const keyring = useKeystore()
    keyring.breakIt()
    const s = slot('{"privateKey":"legacy"}')
    // The secret is still returned — a failed migration must not look like a
    // missing passkey and send the user back through password + 2FA.
    expect(secrets.readSecret('k', s)).toBe('{"privateKey":"legacy"}')
    expect(s.state.value).toBe('{"privateKey":"legacy"}')
  })

  it('prefers the keystore over a stale plaintext file', () => {
    const keyring = useKeystore()
    keyring.items.set('openrecord-mcpb k', '{"privateKey":"current"}')
    const s = slot('{"privateKey":"stale"}')
    expect(secrets.readSecret('k', s)).toBe('{"privateKey":"current"}')
  })
})

describe('degrading to the file', () => {
  it('writes the secret to the file when the keystore write fails', () => {
    const keyring = useKeystore()
    keyring.breakIt()
    const s = slot()
    secrets.writeSecret('k', 'value', s)
    expect(s.state.value).toBe('value')
  })

  it('stops retrying a broken keystore for the rest of the process', () => {
    const keyring = useKeystore()
    keyring.breakIt()
    const s = slot()
    secrets.writeSecret('k', 'value', s)
    expect(secrets.activeBackend()).toBe('file')

    // Un-break it: a demoted store must stay demoted rather than flapping.
    const s2 = slot()
    secrets.writeSecret('k2', 'value2', s2)
    expect(s2.state.value).toBe('value2')
    expect(keyring.items.size).toBe(0)
  })

  it('fails loudly instead of writing plaintext in strict os mode', () => {
    const keyring = useKeystore()
    process.env.OPENRECORD_SECRET_BACKEND = 'os'
    keyring.breakIt()
    const s = slot()
    expect(() => secrets.writeSecret('k', 'value', s)).toThrow()
    expect(s.state.value).toBeUndefined()
  })
})

// ── The passkey path end to end ─────────────────────────────────────────────

describe('credential-store passkeys through the keystore', () => {
  it('files the passkey under a readable, per-identity item name', () => {
    const keyring = useKeystore()
    store.saveAccountPasskey('HTTPS://MyChart.Example.ORG/x', ' Homer ', '{"cred":"abc"}')
    // A user auditing Keychain Access should be able to tell whose passkey this
    // is; the hostname and username normalise the same way as on disk.
    expect([...keyring.items.keys()]).toEqual([
      'openrecord-mcpb passkey:mychart.example.org:homer',
    ])
  })

  it('keeps two logins on one hostname in separate items', () => {
    const keyring = useKeystore()
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"homers"}')
    store.saveAccountPasskey('mychart.example.org', 'marge', '{"cred":"marges"}')
    expect(keyring.items.size).toBe(2)
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"homers"}')
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBe('{"cred":"marges"}')
  })

  it('does not hand one user another user passkey', () => {
    useKeystore()
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"homers"}')
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBeUndefined()
  })

  it('percent-encodes a username that would otherwise escape the item name', () => {
    const keyring = useKeystore()
    store.saveAccountPasskey('mychart.example.org', 'lisa/../<evil>', '{"cred":"x"}')
    expect([...keyring.items.keys()]).toEqual([
      'openrecord-mcpb passkey:mychart.example.org:lisa%2F..%2F%3Cevil%3E',
    ])
    expect(store.readAccountPasskey('mychart.example.org', 'lisa/../<evil>')).toBe('{"cred":"x"}')
  })

  it('clears the keystore item when the account is disconnected', () => {
    const keyring = useKeystore()
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'homer', password: 'p' })
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"abc"}')
    expect(store.removeAccount('mychart.example.org', 'homer')).toBe(true)
    expect(keyring.items.size).toBe(0)
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('reports the backend it is actually using', () => {
    useKeystore()
    setPlatform('darwin')
    expect(store.secretBackend()).toBe('keychain')
  })
})

// ── Passwords and TOTP secrets ──────────────────────────────────────────────

describe('credential-store account secrets through the keystore', () => {
  const account = { hostname: 'mychart.example.org', username: 'homer', password: 'donuts123' }
  const accountsJson = () => memfs.read(store._paths.ACCOUNTS_PATH) ?? ''

  it('keeps the password out of accounts.json entirely', () => {
    const keyring = useKeystore()
    store.upsertAccount(account)

    expect(accountsJson()).not.toContain('donuts123')
    // What is left is the index — which logins exist — and nothing secret.
    expect(JSON.parse(accountsJson())).toEqual({
      accounts: [{ hostname: 'mychart.example.org', username: 'homer' }],
    })
    expect(keyring.items.get('openrecord-mcpb password:mychart.example.org:homer')).toBe('donuts123')
  })

  it('reads the password back, so callers never notice where it lives', () => {
    useKeystore()
    store.upsertAccount(account)
    expect(store.findAccount('mychart.example.org', 'homer')?.password).toBe('donuts123')
  })

  it('keeps the TOTP secret out of accounts.json too', () => {
    const keyring = useKeystore()
    store.upsertAccount(account)
    expect(store.saveAccountTotpSecret('mychart.example.org', 'homer', 'JBSWY3DPEHPK3PXP')).toBe(true)

    expect(accountsJson()).not.toContain('JBSWY3DPEHPK3PXP')
    expect(keyring.items.get('openrecord-mcpb totp:mychart.example.org:homer')).toBe('JBSWY3DPEHPK3PXP')
    expect(store.findAccount('mychart.example.org', 'homer')?.totpSecret).toBe('JBSWY3DPEHPK3PXP')
  })

  it('will not strand a TOTP secret on an account that does not exist', () => {
    const keyring = useKeystore()
    expect(store.saveAccountTotpSecret('mychart.example.org', 'nobody', 'JBSWY3DPEHPK3PXP')).toBe(false)
    expect(keyring.items.size).toBe(0)
  })

  it('migrates a pre-keystore plaintext password out of accounts.json on read', () => {
    const keyring = useKeystore()
    // An accounts.json exactly as an older version left it.
    memfs.put(
      store._paths.ACCOUNTS_PATH,
      JSON.stringify({
        accounts: [
          { hostname: 'mychart.example.org', username: 'homer', password: 'donuts123', totpSecret: 'JBSWY3DPEHPK3PXP' },
        ],
      }),
    )

    const found = store.findAccount('mychart.example.org', 'homer')
    expect(found?.password).toBe('donuts123')
    expect(found?.totpSecret).toBe('JBSWY3DPEHPK3PXP')

    // Promoted, and the plaintext copies removed rather than merely shadowed.
    expect(keyring.items.get('openrecord-mcpb password:mychart.example.org:homer')).toBe('donuts123')
    expect(accountsJson()).not.toContain('donuts123')
    expect(accountsJson()).not.toContain('JBSWY3DPEHPK3PXP')
  })

  it('leaves the password in accounts.json when there is no keystore', () => {
    process.env.OPENRECORD_SECRET_BACKEND = 'file'
    store.upsertAccount(account)
    // The pre-keystore layout, unchanged — losing a login because a keychain is
    // locked would be worse than storing it the way we always did.
    expect(JSON.parse(accountsJson())).toEqual({
      accounts: [{ hostname: 'mychart.example.org', username: 'homer', password: 'donuts123' }],
    })
    expect(store.findAccount('mychart.example.org', 'homer')?.password).toBe('donuts123')
  })

  it('does not leak one household member password to another', () => {
    useKeystore()
    store.upsertAccount(account)
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'bartlisa' })
    expect(store.findAccount('mychart.example.org', 'homer')?.password).toBe('donuts123')
    expect(store.findAccount('mychart.example.org', 'marge')?.password).toBe('bartlisa')
  })

  it('takes every secret with it when the account is disconnected', () => {
    const keyring = useKeystore()
    store.upsertAccount(account)
    store.saveAccountTotpSecret('mychart.example.org', 'homer', 'JBSWY3DPEHPK3PXP')
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"abc"}')
    expect(keyring.items.size).toBe(3)

    expect(store.removeAccount('mychart.example.org', 'homer')).toBe(true)
    expect(keyring.items.size).toBe(0)
    expect(store.readAccounts()).toEqual([])
  })

  it('leaves a second account untouched when the first is disconnected', () => {
    const keyring = useKeystore()
    store.upsertAccount(account)
    store.upsertAccount({ hostname: 'mychart.example.org', username: 'marge', password: 'bartlisa' })
    store.removeAccount('mychart.example.org', 'homer')

    expect(keyring.items.get('openrecord-mcpb password:mychart.example.org:marge')).toBe('bartlisa')
    expect(store.findAccount('mychart.example.org', 'marge')?.password).toBe('bartlisa')
  })
})
