/**
 * Unit tests for setupPasskey / listPasskeys / deletePasskey.
 *
 * fake-mychart answers these endpoints in exactly one shape, so the casing
 * variants and every failure branch are only reachable from here. The
 * end-to-end happy path is covered by
 * `scrapers/myChart/__tests__/fake-mychart/credential-setup.test.ts` and
 * `tests/integration/ci/cli-passkey.test.ts`.
 */

import { describe, it, expect, afterAll, beforeAll } from 'bun:test'
import { setupPasskey, listPasskeys, deletePasskey } from '../setupPasskey'
import { createAssertion, type MyChartCreationOptions } from '../softwareAuthenticator'
import { silenceLogger, resetLogSink } from '../../../shared/logger'
import {
  createMockRequest,
  jsonResponse,
  htmlResponse,
  type RouteHandler,
} from './mockMyChartRequest'

const CSRF = 'csrf-token-for-tests'
const HOSTNAME = 'mychart.example.org'
const ORIGIN = `https://${HOSTNAME}`

beforeAll(silenceLogger)
afterAll(resetLogSink)

/**
 * WebAuthn creation options in the shape MyChart's GenerateCreateRequest
 * returns them. `rp.id` is empty on real instances — the authenticator is
 * expected to derive the relying-party id from the origin.
 */
function creationOptions(overrides: Partial<MyChartCreationOptions> = {}): MyChartCreationOptions {
  return {
    rp: { id: '', name: 'Example Health MyChart' },
    attestation: 'none',
    authenticatorSelection: {
      requireResidentKey: true,
      residentKey: 'required',
      userVerification: 'preferred',
    },
    challenge: Buffer.from('challenge-bytes-32-chars-long!!!').toString('base64'),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    timeout: 60000,
    user: {
      id: Buffer.from('user-handle').toString('base64'),
      name: 'testuser',
      displayName: 'Test User',
    },
    excludeCredentials: [],
    ...overrides,
  }
}

function happyRoutes(overrides: Record<string, RouteHandler> = {}): Record<string, RouteHandler> {
  return {
    '/Home/CSRFToken': () => jsonResponse({ Token: CSRF }),
    '/api/passkey-management/GenerateCreateRequest': () =>
      jsonResponse({ success: true, data: creationOptions() }),
    '/api/passkey-management/CreatePasskey': () =>
      jsonResponse({ success: true, data: { rawId: 'server-side-raw-id', name: 'Passkey 1' } }),
    ...overrides,
  }
}

/** Routes where the CSRF token can never be resolved. */
const noCsrfRoutes: Record<string, RouteHandler> = {
  '/Home/CSRFToken': () => new Response('', { status: 200 }),
  '/Home': () => htmlResponse('<html><body>no token</body></html>'),
}

// ---------------------------------------------------------------------------
// setupPasskey — happy path
// ---------------------------------------------------------------------------

describe('setupPasskey — successful registration', () => {
  it('returns a credential and submits the attestation to CreatePasskey', async () => {
    const { req, calls, callTo } = createMockRequest(happyRoutes(), { hostname: HOSTNAME })

    const credential = await setupPasskey(req)

    expect(credential).not.toBeNull()
    expect(calls.map(c => c.path)).toEqual([
      '/MyChart/Home/CSRFToken',
      '/MyChart/api/passkey-management/GenerateCreateRequest',
      '/MyChart/api/passkey-management/CreatePasskey',
    ])

    const submitted = callTo('/api/passkey-management/CreatePasskey').json<{
      rawId: string
      attestationData: string
      clientDataJSON: string
      indexForDefaultName: number
    }>()
    // The credential handed back to the caller must be the same one the server
    // was told about, or every later login signs with the wrong key.
    expect(submitted.rawId).toBe(credential!.credentialId)
    expect(submitted.attestationData.length).toBeGreaterThan(0)
    expect(submitted.clientDataJSON.length).toBeGreaterThan(0)
  })

  it('produces a credential that can actually sign an assertion', async () => {
    // A registration that returns an unusable private key would pass every
    // shape assertion above and still fail at the first login.
    const { req } = createMockRequest(happyRoutes(), { hostname: HOSTNAME })

    const credential = await setupPasskey(req)
    expect(credential).not.toBeNull()

    const assertion = createAssertion(
      credential!,
      Buffer.from('login-challenge').toString('base64'),
      ORIGIN,
    )
    expect(assertion.rawId).toBe(credential!.credentialId)
    expect(assertion.authenticatorAssertion.signature.length).toBeGreaterThan(0)
    expect(credential!.signCount).toBe(1)
  })

  it('derives the relying-party id from the origin when the server sends an empty rp.id', async () => {
    const { req } = createMockRequest(happyRoutes(), { hostname: HOSTNAME })
    const credential = await setupPasskey(req)
    expect(credential!.rpId).toBe(HOSTNAME)
  })

  it('honours an explicit rp.id when the server sends one', async () => {
    const { req } = createMockRequest(
      happyRoutes({
        '/api/passkey-management/GenerateCreateRequest': () =>
          jsonResponse({ success: true, data: creationOptions({ rp: { id: 'example.org', name: 'Example' } }) }),
      }),
      { hostname: HOSTNAME },
    )
    const credential = await setupPasskey(req)
    expect(credential!.rpId).toBe('example.org')
  })

  it('names the new passkey one past the existing ones', async () => {
    // MyChart labels the passkey "Passkey <n>"; n comes from the count of
    // credentials the server already excluded.
    const { req, callTo } = createMockRequest(
      happyRoutes({
        '/api/passkey-management/GenerateCreateRequest': () =>
          jsonResponse({
            success: true,
            data: creationOptions({
              excludeCredentials: [
                { id: 'existing-one', type: 'public-key' },
                { id: 'existing-two', type: 'public-key' },
              ],
            }),
          }),
      }),
      { hostname: HOSTNAME },
    )

    await setupPasskey(req)

    expect(callTo('/api/passkey-management/CreatePasskey').json<{ indexForDefaultName: number }>()
      .indexForDefaultName).toBe(3)
  })

  it('sends the CSRF token and the CORS-shaped headers MyChart requires', async () => {
    const { req, calls } = createMockRequest(happyRoutes(), { hostname: HOSTNAME })
    await setupPasskey(req)

    const apiCalls = calls.filter(c => c.path.includes('passkey-management'))
    expect(apiCalls.length).toBe(2)
    for (const call of apiCalls) {
      expect(call.method).toBe('POST')
      expect(call.headers['__RequestVerificationToken']).toBe(CSRF)
      expect(call.headers['X-Requested-With']).toBe('XMLHttpRequest')
      expect(call.headers['origin']).toBe(ORIGIN)
      // The scraper must override the navigation defaults makeRequest applies,
      // or the endpoint rejects the request as a cross-document navigation.
      expect(call.headers['Sec-Fetch-Dest']).toBe('empty')
      expect(call.headers['Sec-Fetch-Mode']).toBe('cors')
    }
  })

  it('builds the origin from the request protocol, not a hardcoded https', async () => {
    const { req, calls } = createMockRequest(happyRoutes(), { hostname: 'localhost:4000' })
    req.protocol = 'http'

    await setupPasskey(req)

    expect(calls.find(c => c.path.includes('GenerateCreateRequest'))!.headers['origin'])
      .toBe('http://localhost:4000')
  })

  // The server's answer to GenerateCreateRequest / CreatePasskey is Pascal-cased
  // on some instances and camel-cased on others.
  it('accepts a Pascal-cased Success/Data envelope', async () => {
    const { req } = createMockRequest(
      happyRoutes({
        '/api/passkey-management/GenerateCreateRequest': () =>
          jsonResponse({ Success: true, Data: creationOptions() }),
        '/api/passkey-management/CreatePasskey': () => jsonResponse({ Success: true }),
      }),
      { hostname: HOSTNAME },
    )
    expect(await setupPasskey(req)).not.toBeNull()
  })

  for (const body of [
    { label: 'rawId', value: { rawId: 'abc' } },
    { label: 'RawId', value: { RawId: 'abc' } },
    { label: 'success', value: { success: true } },
    { label: 'Success', value: { Success: true } },
    { label: 'name', value: { name: 'Passkey 1' } },
    { label: 'Name', value: { Name: 'Passkey 1' } },
  ]) {
    it(`treats a CreatePasskey response keyed on "${body.label}" as success`, async () => {
      const { req } = createMockRequest(
        happyRoutes({ '/api/passkey-management/CreatePasskey': () => jsonResponse(body.value) }),
        { hostname: HOSTNAME },
      )
      expect(await setupPasskey(req)).not.toBeNull()
    })
  }

  it('still returns the credential when CreatePasskey answers 200 with an unfamiliar shape', async () => {
    // Documented fallback: a 200 means the server took it, so hand back the
    // credential rather than throwing away a passkey that may well be live.
    const { req } = createMockRequest(
      happyRoutes({ '/api/passkey-management/CreatePasskey': () => jsonResponse({ unexpected: 'shape' }) }),
      { hostname: HOSTNAME },
    )
    expect(await setupPasskey(req)).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// setupPasskey — failure paths
// ---------------------------------------------------------------------------

describe('setupPasskey — failure paths', () => {
  it('returns null without generating a key when there is no CSRF token', async () => {
    const { req, calls } = createMockRequest({ ...happyRoutes(), ...noCsrfRoutes }, { hostname: HOSTNAME })

    expect(await setupPasskey(req)).toBeNull()
    expect(calls.some(c => c.path.includes('passkey-management'))).toBe(false)
  })

  it('returns null when GenerateCreateRequest errors', async () => {
    const { req, callsTo } = createMockRequest(
      happyRoutes({ '/api/passkey-management/GenerateCreateRequest': () => jsonResponse({}, 500) }),
      { hostname: HOSTNAME },
    )

    expect(await setupPasskey(req)).toBeNull()
    expect(callsTo('/api/passkey-management/CreatePasskey').length).toBe(0)
  })

  it('returns null when the server answers 200 but reports failure', async () => {
    const { req, callsTo } = createMockRequest(
      happyRoutes({
        '/api/passkey-management/GenerateCreateRequest': () =>
          jsonResponse({ success: false, errors: ['Passkeys are disabled for this account'] }),
      }),
      { hostname: HOSTNAME },
    )

    expect(await setupPasskey(req)).toBeNull()
    expect(callsTo('/api/passkey-management/CreatePasskey').length).toBe(0)
  })

  it('returns null when the creation options are missing', async () => {
    const { req } = createMockRequest(
      happyRoutes({ '/api/passkey-management/GenerateCreateRequest': () => jsonResponse({ success: true }) }),
      { hostname: HOSTNAME },
    )
    expect(await setupPasskey(req)).toBeNull()
  })

  it('returns null when the creation options carry no challenge', async () => {
    // Signing an empty challenge would produce an assertion the server can
    // never match, so this has to fail rather than register a dud.
    const { req, callsTo } = createMockRequest(
      happyRoutes({
        '/api/passkey-management/GenerateCreateRequest': () =>
          jsonResponse({ success: true, data: { ...creationOptions(), challenge: '' } }),
      }),
      { hostname: HOSTNAME },
    )

    expect(await setupPasskey(req)).toBeNull()
    expect(callsTo('/api/passkey-management/CreatePasskey').length).toBe(0)
  })

  it('returns null when CreatePasskey errors', async () => {
    const { req } = createMockRequest(
      happyRoutes({
        '/api/passkey-management/CreatePasskey': () =>
          jsonResponse({ success: false, errors: ['Not logged in'] }, 401),
      }),
      { hostname: HOSTNAME },
    )
    expect(await setupPasskey(req)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// listPasskeys
// ---------------------------------------------------------------------------

describe('listPasskeys', () => {
  const passkeys = [{ rawId: 'a', name: 'Passkey 1' }, { rawId: 'b', name: 'Passkey 2' }]

  function listRoutes(handler: RouteHandler): Record<string, RouteHandler> {
    return {
      '/Home/CSRFToken': () => jsonResponse({ Token: CSRF }),
      '/api/passkey-management/LoadPasskeyInfo': handler,
    }
  }

  it('returns the passkeys from a camel-cased response', async () => {
    const { req, callTo } = createMockRequest(listRoutes(() => jsonResponse({ passkeys })), { hostname: HOSTNAME })

    expect(await listPasskeys(req)).toEqual(passkeys)
    expect(callTo('/api/passkey-management/LoadPasskeyInfo').json()).toEqual({ hostname: HOSTNAME })
  })

  it('returns the passkeys from a Pascal-cased response', async () => {
    const { req } = createMockRequest(listRoutes(() => jsonResponse({ Passkeys: passkeys })), { hostname: HOSTNAME })
    expect(await listPasskeys(req)).toEqual(passkeys)
  })

  it('returns an empty list — not null — when the account has no passkeys', async () => {
    // Callers distinguish "none registered" from "could not ask"; collapsing
    // the two would make an error look like an empty account.
    const { req } = createMockRequest(listRoutes(() => jsonResponse({ lastAuthentication: null })), { hostname: HOSTNAME })
    expect(await listPasskeys(req)).toEqual([])
  })

  it('returns null when the endpoint errors', async () => {
    const { req } = createMockRequest(listRoutes(() => jsonResponse({}, 500)), { hostname: HOSTNAME })
    expect(await listPasskeys(req)).toBeNull()
  })

  it('returns null when there is no CSRF token', async () => {
    const { req, calls } = createMockRequest(
      { ...listRoutes(() => jsonResponse({ passkeys })), ...noCsrfRoutes },
      { hostname: HOSTNAME },
    )
    expect(await listPasskeys(req)).toBeNull()
    expect(calls.some(c => c.path.includes('LoadPasskeyInfo'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// deletePasskey
// ---------------------------------------------------------------------------

describe('deletePasskey', () => {
  function deleteRoutes(handler: RouteHandler): Record<string, RouteHandler> {
    return {
      '/Home/CSRFToken': () => jsonResponse({ Token: CSRF }),
      '/api/passkey-management/DeletePasskey': handler,
    }
  }

  it('posts the rawId and reports success', async () => {
    const { req, callTo } = createMockRequest(
      deleteRoutes(() => jsonResponse({ success: true })),
      { hostname: HOSTNAME },
    )

    expect(await deletePasskey(req, 'raw-id-to-delete')).toBe(true)
    expect(callTo('/api/passkey-management/DeletePasskey').json()).toEqual({ rawId: 'raw-id-to-delete' })
  })

  it('reports failure when the endpoint errors', async () => {
    const { req } = createMockRequest(deleteRoutes(() => jsonResponse({ success: false }, 400)), { hostname: HOSTNAME })
    expect(await deletePasskey(req, 'raw-id-to-delete')).toBe(false)
  })

  it('reports failure without calling the endpoint when there is no CSRF token', async () => {
    const { req, calls } = createMockRequest(
      { ...deleteRoutes(() => jsonResponse({ success: true })), ...noCsrfRoutes },
      { hostname: HOSTNAME },
    )
    expect(await deletePasskey(req, 'raw-id-to-delete')).toBe(false)
    expect(calls.some(c => c.path.includes('DeletePasskey'))).toBe(false)
  })
})
