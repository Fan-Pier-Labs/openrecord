/**
 * Tests for the extension's credential store.
 *
 * `./memfs` replaces `fs` with a Map for paths under the store root, so these
 * touch no disk — import it before the store. Permissions and file layout are
 * still asserted, because the shim records them; that is the part of this
 * module's contract worth pinning down.
 *
 * The store keys everything by (hostname, username): one hostname routinely
 * carries several logins (a household sharing a computer), and a passkey or
 * session is an identity — the tests here pin down that no user's login data
 * is ever replaced or inherited by another user on the same hostname.
 */
import { describe, it, expect, beforeEach } from 'bun:test'
import path from 'node:path'
import * as memfs from './memfs'

const store = await import('../credential-store')

beforeEach(() => {
  memfs.reset()
})

const account = (hostname: string, username = 'homer') => ({
  hostname,
  username,
  password: 'donuts123',
})

const passkeyFile = (hostname: string, username: string) =>
  path.join(store._paths.PASSKEYS_DIR, hostname, `${encodeURIComponent(username)}.json`)
const sessionFile = (hostname: string, username: string) =>
  path.join(store._paths.SESSIONS_DIR, hostname, `${encodeURIComponent(username)}.json`)

describe('normalizeHostname', () => {
  it('lowercases and trims', () => {
    expect(store.normalizeHostname('  MyChart.Example.ORG  ')).toBe('mychart.example.org')
  })

  it('strips the protocol', () => {
    expect(store.normalizeHostname('https://mychart.example.org')).toBe('mychart.example.org')
  })

  it('strips a path, keeping only the host', () => {
    expect(store.normalizeHostname('https://mychart.example.org/MyChart/Home')).toBe(
      'mychart.example.org',
    )
  })

  it('keeps an explicit port, since that identifies a different instance', () => {
    expect(store.normalizeHostname('http://localhost:4000')).toBe('localhost:4000')
  })

  it('is idempotent', () => {
    const once = store.normalizeHostname('HTTPS://MyChart.Example.ORG/app')
    expect(store.normalizeHostname(once)).toBe(once)
  })
})

describe('accountId', () => {
  it('is username@hostname with the hostname normalized', () => {
    expect(store.accountId({ hostname: 'HTTPS://MyChart.Example.ORG/x', username: 'homer' })).toBe(
      'homer@mychart.example.org',
    )
  })

  it('keeps the stored username spelling for display', () => {
    expect(store.accountId({ hostname: 'mychart.example.org', username: 'Homer' })).toBe(
      'Homer@mychart.example.org',
    )
  })
})

describe('accounts', () => {
  it('returns an empty list when nothing has been saved', () => {
    expect(store.readAccounts()).toEqual([])
  })

  it('round-trips a saved account', () => {
    store.upsertAccount(account('mychart.example.org'))
    expect(store.readAccounts()).toEqual([
      { hostname: 'mychart.example.org', username: 'homer', password: 'donuts123' },
    ])
  })

  it('normalizes the hostname on the way in', () => {
    store.upsertAccount(account('HTTPS://MyChart.Example.ORG/MyChart'))
    expect(store.readAccounts()[0].hostname).toBe('mychart.example.org')
  })

  it('updates the same login in place rather than duplicating it', () => {
    store.upsertAccount({ ...account('mychart.example.org'), password: 'old' })
    store.upsertAccount({ ...account('https://MyChart.Example.ORG'), password: 'new' })

    const accounts = store.readAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].password).toBe('new')
  })

  it('treats a case-only username difference as the same login', () => {
    // MyChart logins are case-insensitive; "Homer" is not a different patient.
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.upsertAccount(account('mychart.example.org', '  Homer '))
    expect(store.readAccounts()).toHaveLength(1)
  })

  it('keeps a second username on the same hostname as a separate account', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.upsertAccount(account('mychart.example.org', 'marge'))

    const usernames = store.readAccounts().map((a) => a.username)
    expect(usernames.sort()).toEqual(['homer', 'marge'])
  })

  it('keeps separate hosts separate', () => {
    store.upsertAccount(account('a.example.org'))
    store.upsertAccount(account('b.example.org'))
    expect(store.readAccounts()).toHaveLength(2)
  })

  it('finds an account regardless of how the host and username are written', () => {
    store.upsertAccount(account('mychart.example.org'))
    expect(store.findAccount('HTTPS://MyChart.Example.ORG/', ' HOMER ')?.password).toBe('donuts123')
  })

  it('returns undefined for an unknown login', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    expect(store.findAccount('mychart.example.org', 'marge')).toBeUndefined()
  })

  it('removes only the named login', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.upsertAccount(account('mychart.example.org', 'marge'))

    expect(store.removeAccount('mychart.example.org', 'homer')).toBe(true)
    expect(store.removeAccount('mychart.example.org', 'homer')).toBe(false)
    expect(store.readAccounts().map((a) => a.username)).toEqual(['marge'])
  })

  it('survives a corrupt accounts file instead of throwing', () => {
    memfs.put(store._paths.ACCOUNTS_PATH, 'not json at all')
    expect(store.readAccounts()).toEqual([])
  })

  it('ignores an accounts file whose shape is wrong', () => {
    memfs.put(store._paths.ACCOUNTS_PATH, JSON.stringify({ accounts: 'nope' }))
    expect(store.readAccounts()).toEqual([])
  })

  it('writes credentials owner-only', () => {
    store.upsertAccount(account('mychart.example.org'))
    expect(memfs.modeOf(store._paths.ACCOUNTS_PATH)).toBe(0o600)
  })
})

describe('lookupAccount', () => {
  beforeEach(() => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.upsertAccount(account('mychart.example.org', 'marge'))
    store.upsertAccount(account('solo.example.org', 'lisa'))
  })

  it('resolves a qualified username@hostname id', () => {
    const result = store.lookupAccount('marge@mychart.example.org')
    expect(result.state).toBe('found')
    expect(result.state === 'found' && result.account.username).toBe('marge')
  })

  it('matches the qualified id case-insensitively', () => {
    const result = store.lookupAccount('MARGE@MyChart.Example.ORG')
    expect(result.state === 'found' && result.account.username).toBe('marge')
  })

  it('splits on the LAST @ so email usernames work', () => {
    store.upsertAccount({ hostname: 'solo.example.org', username: 'lisa@simpsons.com', password: 'x' })
    const result = store.lookupAccount('lisa@simpsons.com@solo.example.org')
    expect(result.state === 'found' && result.account.username).toBe('lisa@simpsons.com')
  })

  it('resolves a bare hostname when only one login is saved for it', () => {
    const result = store.lookupAccount('solo.example.org')
    expect(result.state === 'found' && result.account.username).toBe('lisa')
  })

  it('refuses to guess between several logins on one hostname', () => {
    const result = store.lookupAccount('mychart.example.org')
    expect(result.state).toBe('ambiguous')
    expect(result.state === 'ambiguous' && result.candidates.sort()).toEqual([
      'homer@mychart.example.org',
      'marge@mychart.example.org',
    ])
  })

  it('does NOT fall back to the hostname when a qualified id names an unknown user', () => {
    // "bart@solo.example.org" silently resolving to lisa's account would be the
    // wrong-identity failure the qualified form exists to prevent.
    expect(store.lookupAccount('bart@solo.example.org').state).toBe('not_found')
  })

  it('reports not_found for an unknown hostname and an empty ref', () => {
    expect(store.lookupAccount('nope.example.org').state).toBe('not_found')
    expect(store.lookupAccount('').state).toBe('not_found')
  })
})

describe('passkeys', () => {
  it('round-trips a serialized passkey', () => {
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"abc"}')
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"abc"}')
  })

  it('keys on the normalized hostname and username', () => {
    store.saveAccountPasskey('HTTPS://MyChart.Example.ORG/x', ' Homer ', '{"cred":"abc"}')
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"abc"}')
  })

  it('keeps each username\'s passkey separate on one hostname', () => {
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"homers"}')
    store.saveAccountPasskey('mychart.example.org', 'marge', '{"cred":"marges"}')

    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"homers"}')
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBe('{"cred":"marges"}')
  })

  it('never hands one user another user\'s passkey', () => {
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"homers"}')
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBeUndefined()
  })

  it('encodes a username that is not filesystem-safe', () => {
    // Slashes are percent-encoded, so the file cannot escape the hostname's
    // directory no matter what the username contains.
    store.saveAccountPasskey('mychart.example.org', 'lisa/../<evil>', '{"cred":"x"}')
    const written = memfs.writtenPaths().find((p) => p.includes('lisa'))
    expect(written).toBeDefined()
    expect(path.dirname(written!)).toBe(path.join(store._paths.PASSKEYS_DIR, 'mychart.example.org'))
    expect(store.readAccountPasskey('mychart.example.org', 'lisa/../<evil>')).toBe('{"cred":"x"}')
  })

  it('returns undefined when none is stored', () => {
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('returns undefined for a corrupt passkey file', () => {
    store.saveAccountPasskey('mychart.example.org', 'homer', 'x')
    memfs.put(passkeyFile('mychart.example.org', 'homer'), '{{{')
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('clears without complaining when nothing is there', () => {
    expect(() => store.clearAccountPasskey('mychart.example.org', 'homer')).not.toThrow()
  })

  it('writes passkeys owner-only', () => {
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"abc"}')
    expect(memfs.modeOf(passkeyFile('mychart.example.org', 'homer'))).toBe(0o600)
  })
})

describe('sessions', () => {
  it('round-trips serialized session state', () => {
    store.saveAccountSession('mychart.example.org', 'homer', 'cookie-blob')
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBe('cookie-blob')
  })

  it('keeps each username\'s session separate on one hostname', () => {
    store.saveAccountSession('mychart.example.org', 'homer', 'homers-cookies')
    store.saveAccountSession('mychart.example.org', 'marge', 'marges-cookies')

    expect(store.readAccountSession('mychart.example.org', 'homer')).toBe('homers-cookies')
    expect(store.readAccountSession('mychart.example.org', 'marge')).toBe('marges-cookies')
  })

  it('returns undefined when no session is stored', () => {
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('clears a stored session', () => {
    store.saveAccountSession('mychart.example.org', 'homer', 'cookie-blob')
    store.clearAccountSession('mychart.example.org', 'homer')
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('writes sessions owner-only', () => {
    store.saveAccountSession('mychart.example.org', 'homer', 'cookie-blob')
    expect(memfs.modeOf(sessionFile('mychart.example.org', 'homer'))).toBe(0o600)
  })
})

describe('a second login never disturbs the first', () => {
  // The old store keyed passkeys and sessions by hostname alone, so setting up
  // marge on homer's hostname inherited homer's WebAuthn credential — and the
  // silent-login ladder then authenticated as homer while accounts.json said
  // marge: the wrong-patient failure class. Now nothing is shared or deleted.
  it('keeps both logins, both passkeys and both sessions', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"homers"}')
    store.saveAccountSession('mychart.example.org', 'homer', 'homers-cookies')

    store.upsertAccount(account('mychart.example.org', 'marge'))

    expect(store.readAccounts()).toHaveLength(2)
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"homers"}')
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBe('homers-cookies')
    // Marge starts fresh: no inherited passkey means auto-registration mints
    // her own instead of short-circuiting on `already_saved`.
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBeUndefined()
    expect(store.readAccountSession('mychart.example.org', 'marge')).toBeUndefined()
  })

  it('re-registering the same username keeps its passkey and session', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"homers"}')
    store.saveAccountSession('mychart.example.org', 'homer', 'homers-cookies')

    store.upsertAccount({ ...account('mychart.example.org', 'Homer'), password: 'newpass' })

    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"homers"}')
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBe('homers-cookies')
    expect(store.readAccounts()).toHaveLength(1)
  })
})

describe('legacy flat-file migration', () => {
  // Older versions stored one account per hostname with flat
  // passkeys/<hostname>.json files. Those must keep working — a passkey is the
  // user's ticket past 2FA — and get attributed to the hostname's single
  // pre-existing account, which is the only account the old format could hold.
  const legacyPasskey = path.join(store._paths.PASSKEYS_DIR, 'mychart.example.org.json')
  const legacySession = path.join(store._paths.SESSIONS_DIR, 'mychart.example.org.json')

  const seedLegacy = () => {
    memfs.put(store._paths.ACCOUNTS_PATH, JSON.stringify({
      accounts: [{ hostname: 'mychart.example.org', username: 'homer', password: 'donuts123' }],
    }))
    memfs.put(legacyPasskey, JSON.stringify({ passkey: '{"cred":"legacy"}' }))
    memfs.put(legacySession, 'legacy-cookies')
  }

  it('serves and moves a legacy passkey for the hostname\'s one account', () => {
    seedLegacy()
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"legacy"}')
    expect(memfs.exists(legacyPasskey)).toBe(false)
    expect(memfs.read(passkeyFile('mychart.example.org', 'homer'))).toContain('legacy')
  })

  it('serves and moves a legacy session the same way', () => {
    seedLegacy()
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBe('legacy-cookies')
    expect(memfs.exists(legacySession)).toBe(false)
  })

  it('migrates before a second account appears, so attribution stays unambiguous', () => {
    seedLegacy()
    store.upsertAccount(account('mychart.example.org', 'marge'))

    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"legacy"}')
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBeUndefined()
    expect(memfs.exists(legacyPasskey)).toBe(false)
  })

  it('never hands a legacy file to a different username', () => {
    seedLegacy()
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBeUndefined()
    // Homer's legacy passkey was migrated to HIS path, not marge's.
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"legacy"}')
  })

  it('does not let a stale legacy file overwrite a newer per-user file', () => {
    // A per-user file can only have been written by this version, so it is
    // newer than any flat file — overwriting it would roll a re-saved
    // passkey's WebAuthn signature counter back.
    seedLegacy()
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"fresh"}')
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBe('{"cred":"fresh"}')
    expect(memfs.exists(legacyPasskey)).toBe(false)
  })

  it('clearing takes an unmigrated legacy file with it', () => {
    // onPasskeyInvalid clears the passkey; a surviving legacy copy would be
    // re-adopted by the next read and retried forever.
    seedLegacy()
    store.clearAccountPasskey('mychart.example.org', 'homer')
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBeUndefined()
    expect(memfs.exists(legacyPasskey)).toBe(false)
  })

  it('leaves a legacy file alone when no account claims the hostname', () => {
    memfs.put(legacyPasskey, JSON.stringify({ passkey: '{"cred":"orphan"}' }))
    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBeUndefined()
    expect(memfs.exists(legacyPasskey)).toBe(true)
  })
})

describe('removeAccount cascade', () => {
  it('takes the passkey and session with it', () => {
    // Leaving either behind would let a "removed" account silently auto-login.
    store.upsertAccount(account('mychart.example.org'))
    store.saveAccountPasskey('mychart.example.org', 'homer', '{"cred":"abc"}')
    store.saveAccountSession('mychart.example.org', 'homer', 'cookie-blob')

    store.removeAccount('mychart.example.org', 'homer')

    expect(store.readAccountPasskey('mychart.example.org', 'homer')).toBeUndefined()
    expect(store.readAccountSession('mychart.example.org', 'homer')).toBeUndefined()
  })

  it('leaves the other logins on the hostname untouched', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.upsertAccount(account('mychart.example.org', 'marge'))
    store.saveAccountPasskey('mychart.example.org', 'marge', '{"cred":"marges"}')
    store.saveAccountSession('mychart.example.org', 'marge', 'keep-me')

    store.removeAccount('mychart.example.org', 'homer')

    expect(store.findAccount('mychart.example.org', 'marge')).toBeDefined()
    expect(store.readAccountPasskey('mychart.example.org', 'marge')).toBe('{"cred":"marges"}')
    expect(store.readAccountSession('mychart.example.org', 'marge')).toBe('keep-me')
  })

  it('leaves another account untouched', () => {
    store.upsertAccount(account('a.example.org'))
    store.upsertAccount(account('b.example.org'))
    store.saveAccountSession('b.example.org', 'homer', 'keep-me')

    store.removeAccount('a.example.org', 'homer')

    expect(store.readAccountSession('b.example.org', 'homer')).toBe('keep-me')
    expect(store.readAccounts().map((a) => a.hostname)).toEqual(['b.example.org'])
  })
})

describe('store location', () => {
  it('keeps everything under ~/.openrecord-mcpb', () => {
    expect(path.basename(store._paths.ROOT)).toBe('.openrecord-mcpb')
    for (const p of [store._paths.ACCOUNTS_PATH, store._paths.PASSKEYS_DIR, store._paths.SESSIONS_DIR]) {
      expect(p.startsWith(store._paths.ROOT)).toBe(true)
    }
  })

  it('does not create anything until something is saved', () => {
    expect(memfs.writtenPaths()).toEqual([])
    store.upsertAccount(account('mychart.example.org'))
    expect(memfs.exists(store._paths.ACCOUNTS_PATH)).toBe(true)
  })

  it('stores the totp secret when one is supplied', () => {
    store.upsertAccount({ ...account('mychart.example.org'), totpSecret: 'SEED' })
    expect(store.findAccount('mychart.example.org', 'homer')?.totpSecret).toBe('SEED')
    expect(JSON.parse(memfs.read(store._paths.ACCOUNTS_PATH)!).accounts[0].totpSecret).toBe('SEED')
  })

  it('saveAccountTotpSecret targets one login, not the hostname', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.upsertAccount(account('mychart.example.org', 'marge'))

    expect(store.saveAccountTotpSecret('mychart.example.org', 'marge', 'MARGESEED')).toBe(true)

    expect(store.findAccount('mychart.example.org', 'marge')?.totpSecret).toBe('MARGESEED')
    expect(store.findAccount('mychart.example.org', 'homer')?.totpSecret).toBeUndefined()
  })

  it('saveAccountTotpSecret refuses to invent an account row', () => {
    expect(store.saveAccountTotpSecret('mychart.example.org', 'nobody', 'SEED')).toBe(false)
    expect(store.readAccounts()).toEqual([])
  })
})
