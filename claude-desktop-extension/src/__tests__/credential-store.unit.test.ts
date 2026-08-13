/**
 * Tests for the extension's credential store.
 *
 * `./memfs` replaces `fs` with a Map for paths under the store root, so these
 * touch no disk — import it before the store. Permissions and file layout are
 * still asserted, because the shim records them; that is the part of this
 * module's contract worth pinning down.
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

  it('updates in place rather than duplicating a host', () => {
    store.upsertAccount(account('mychart.example.org', 'homer'))
    store.upsertAccount(account('https://MyChart.Example.ORG', 'marge'))

    const accounts = store.readAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].username).toBe('marge')
  })

  it('keeps separate hosts separate', () => {
    store.upsertAccount(account('a.example.org'))
    store.upsertAccount(account('b.example.org'))
    expect(store.readAccounts()).toHaveLength(2)
  })

  it('finds an account regardless of how the host is written', () => {
    store.upsertAccount(account('mychart.example.org'))
    expect(store.findAccount('HTTPS://MyChart.Example.ORG/')?.username).toBe('homer')
  })

  it('returns undefined for an unknown host', () => {
    expect(store.findAccount('nope.example.org')).toBeUndefined()
  })

  it('reports whether a removal happened', () => {
    store.upsertAccount(account('mychart.example.org'))
    expect(store.removeAccount('mychart.example.org')).toBe(true)
    expect(store.removeAccount('mychart.example.org')).toBe(false)
    expect(store.readAccounts()).toEqual([])
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

describe('passkeys', () => {
  it('round-trips a serialized passkey', () => {
    store.saveAccountPasskey('mychart.example.org', '{"cred":"abc"}')
    expect(store.readAccountPasskey('mychart.example.org')).toBe('{"cred":"abc"}')
  })

  it('keys on the normalized hostname', () => {
    store.saveAccountPasskey('HTTPS://MyChart.Example.ORG/x', '{"cred":"abc"}')
    expect(store.readAccountPasskey('mychart.example.org')).toBe('{"cred":"abc"}')
  })

  it('returns undefined when none is stored', () => {
    expect(store.readAccountPasskey('mychart.example.org')).toBeUndefined()
  })

  it('returns undefined for a corrupt passkey file', () => {
    store.saveAccountPasskey('mychart.example.org', 'x')
    memfs.put(path.join(store._paths.PASSKEYS_DIR, 'mychart.example.org.json'), '{{{')
    expect(store.readAccountPasskey('mychart.example.org')).toBeUndefined()
  })

  it('clears without complaining when nothing is there', () => {
    expect(() => store.clearAccountPasskey('mychart.example.org')).not.toThrow()
  })

  it('writes passkeys owner-only', () => {
    store.saveAccountPasskey('mychart.example.org', '{"cred":"abc"}')
    const p = path.join(store._paths.PASSKEYS_DIR, 'mychart.example.org.json')
    expect(memfs.modeOf(p)).toBe(0o600)
  })
})

describe('sessions', () => {
  it('round-trips serialized session state', () => {
    store.saveAccountSession('mychart.example.org', 'cookie-blob')
    expect(store.readAccountSession('mychart.example.org')).toBe('cookie-blob')
  })

  it('returns undefined when no session is stored', () => {
    expect(store.readAccountSession('mychart.example.org')).toBeUndefined()
  })

  it('clears a stored session', () => {
    store.saveAccountSession('mychart.example.org', 'cookie-blob')
    store.clearAccountSession('mychart.example.org')
    expect(store.readAccountSession('mychart.example.org')).toBeUndefined()
  })

  it('writes sessions owner-only', () => {
    store.saveAccountSession('mychart.example.org', 'cookie-blob')
    const p = path.join(store._paths.SESSIONS_DIR, 'mychart.example.org.json')
    expect(memfs.modeOf(p)).toBe(0o600)
  })
})

describe('upsertAccount identity change cascade', () => {
  // Passkeys and sessions are keyed by hostname alone. If setting up a NEW
  // username on an existing hostname left the old user's files behind, the
  // silent-login ladder would try the saved passkey first and authenticate as
  // the PREVIOUS user while accounts.json names the new one — the wrong-patient
  // failure class. A leftover passkey also makes auto-registration return
  // `already_saved`, so the new user would never get a passkey of their own.
  const seed = (username: string) => {
    store.upsertAccount(account('mychart.example.org', username))
    store.saveAccountPasskey('mychart.example.org', `{"cred":"${username}"}`)
    store.saveAccountSession('mychart.example.org', `cookies-${username}`)
  }

  it('keeps the passkey and session when the same username re-registers', () => {
    seed('homer')
    store.upsertAccount(account('mychart.example.org', 'homer'))

    expect(store.readAccountPasskey('mychart.example.org')).toBe('{"cred":"homer"}')
    expect(store.readAccountSession('mychart.example.org')).toBe('cookies-homer')
  })

  it('treats a case-only username difference as the same user', () => {
    // MyChart logins are case-insensitive; "Homer" is not a different patient.
    seed('homer')
    store.upsertAccount(account('mychart.example.org', '  Homer '))

    expect(store.readAccountPasskey('mychart.example.org')).toBe('{"cred":"homer"}')
    expect(store.readAccountSession('mychart.example.org')).toBe('cookies-homer')
  })

  it('clears the passkey and session when a different username takes over the hostname', () => {
    seed('homer')
    store.upsertAccount(account('mychart.example.org', 'marge'))

    const accounts = store.readAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].username).toBe('marge')
    // No passkey left means tryAutoRegisterPasskey's `already_saved` gate does
    // not fire, so the new user gets a fresh registration on this login.
    expect(store.readAccountPasskey('mychart.example.org')).toBeUndefined()
    expect(store.readAccountSession('mychart.example.org')).toBeUndefined()
  })

  it('leaves another hostname\'s passkey and session alone', () => {
    seed('homer')
    store.upsertAccount(account('other.example.org', 'homer'))
    store.saveAccountPasskey('other.example.org', '{"cred":"other"}')
    store.saveAccountSession('other.example.org', 'cookies-other')

    store.upsertAccount(account('mychart.example.org', 'marge'))

    expect(store.readAccountPasskey('other.example.org')).toBe('{"cred":"other"}')
    expect(store.readAccountSession('other.example.org')).toBe('cookies-other')
  })

  it('cascades however the hostname is spelled', () => {
    seed('homer')
    store.upsertAccount(account('HTTPS://MyChart.Example.ORG/MyChart', 'marge'))

    expect(store.readAccountPasskey('mychart.example.org')).toBeUndefined()
    expect(store.readAccountSession('mychart.example.org')).toBeUndefined()
  })
})

describe('removeAccount cascade', () => {
  it('takes the passkey and session with it', () => {
    // Leaving either behind would let a "removed" account silently auto-login.
    store.upsertAccount(account('mychart.example.org'))
    store.saveAccountPasskey('mychart.example.org', '{"cred":"abc"}')
    store.saveAccountSession('mychart.example.org', 'cookie-blob')

    store.removeAccount('mychart.example.org')

    expect(store.readAccountPasskey('mychart.example.org')).toBeUndefined()
    expect(store.readAccountSession('mychart.example.org')).toBeUndefined()
  })

  it('leaves another account untouched', () => {
    store.upsertAccount(account('a.example.org'))
    store.upsertAccount(account('b.example.org'))
    store.saveAccountSession('b.example.org', 'keep-me')

    store.removeAccount('a.example.org')

    expect(store.readAccountSession('b.example.org')).toBe('keep-me')
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
    expect(store.findAccount('mychart.example.org')?.totpSecret).toBe('SEED')
    expect(JSON.parse(memfs.read(store._paths.ACCOUNTS_PATH)!).accounts[0].totpSecret).toBe('SEED')
  })
})
