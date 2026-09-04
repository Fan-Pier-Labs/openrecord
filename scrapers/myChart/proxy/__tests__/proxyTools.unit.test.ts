import { afterAll, beforeAll, describe, it, expect, mock } from 'bun:test'
import { MyChartRequest } from '../../core/myChartRequest'
import {
  assertProxyReadContext,
  runListProxyTargets,
  runSwitchProxyTarget,
} from '../proxyTools'
import type { RequestConfig } from '../../core/types'
import { CAPABILITIES, executeCapability } from '../../../../shared/capabilities'
import { resetLogSink, silenceLogger } from '../../../../shared/logger'

beforeAll(() => {
  silenceLogger()
})

afterAll(() => {
  resetLogSink()
})

// Opaque `WP-…` ids in the shape observed on real instances. Self carries one
// too — see proxyContext.test.ts.
const SELF_ID = 'WP-4KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MT'
const CHILD_ID = 'WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MT'
const SIBLING_ID = 'WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6'

const FAMILY = [
  { id: SELF_ID, displayName: 'Homer Jay Simpson', isSelf: true },
  { id: CHILD_ID, displayName: 'Bart Simpson', isSelf: false },
  { id: SIBLING_ID, displayName: 'Lisa Simpson', isSelf: false },
]

function requestWithMockedResponses(
  handler: (config: RequestConfig) => Response | Promise<Response>,
): MyChartRequest {
  const req = new MyChartRequest('mychart.example.org')
  req.setFirstPathPart('MyChart')
  req.makeRequest = mock(handler) as typeof req.makeRequest
  return req
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function htmlResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } })
}

function profileHtml(name: string, dob = '1/1/2010'): string {
  return `<html><body><div class="printheader">Name: ${name} | DOB: ${dob} | MRN: 12345 | PCP: Example Clinician</div></body></html>`
}

/**
 * A stateful fake portal: `/ProxySwitch` reflects `state.activeId`, switch
 * links flip it, `/Home` serves the active patient's profile. Same choreography
 * as proxyContext.test.ts's familyRequest.
 */
function familyRequest(activeId: string) {
  const state = { activeId }
  const req = requestWithMockedResponses((config) => {
    if (config.path?.startsWith('/ProxySwitch')) {
      return jsonResponse({
        ProxySubjectList: FAMILY.map((t) => ({
          Id: t.id,
          DisplayName: t.displayName,
          LinkUrl: t.isSelf ? 'inside.asp' : `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${t.id}`,
          IsSelected: t.id === state.activeId,
          IsSelf: t.isSelf,
        })),
      })
    }
    if (config.url?.includes('switchcontext')) {
      state.activeId = decodeURIComponent(config.url.split('eid=')[1]!)
      return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
    }
    if (config.url?.endsWith('/MyChart/inside.asp')) {
      state.activeId = SELF_ID
      return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
    }
    if (config.url?.endsWith('/MyChart/Home')) return htmlResponse('ok')
    if (config.path === '/Home') {
      const name = FAMILY.find((t) => t.id === state.activeId)!.displayName
      return htmlResponse(profileHtml(name))
    }
    throw new Error(`Unexpected request ${JSON.stringify(config)}`)
  })
  return { req, state }
}

function soloRequest() {
  return requestWithMockedResponses((config) => {
    if (config.path?.startsWith('/ProxySwitch')) return jsonResponse({ ProxySubjectList: [] })
    if (config.path === '/Home') return htmlResponse(profileHtml('Solo Patient'))
    throw new Error(`Unexpected request ${JSON.stringify(config)}`)
  })
}

function mockCalls(req: MyChartRequest): string {
  const calls = (req.makeRequest as unknown as { mock: { calls: unknown[][] } }).mock.calls
  return JSON.stringify(calls)
}

describe('runListProxyTargets', () => {
  it('lists every record with self and active flags', async () => {
    const { req } = familyRequest(SELF_ID)

    const result = await runListProxyTargets(req)

    expect(result.count).toBe(3)
    expect(result.patients).toEqual([
      { id: SELF_ID, name: 'Homer Jay Simpson', is_self: true, is_active: true },
      { id: CHILD_ID, name: 'Bart Simpson', is_self: false, is_active: false },
      { id: SIBLING_ID, name: 'Lisa Simpson', is_self: false, is_active: false },
    ])
    expect(result.active_patient).toBe('Homer Jay Simpson')
    expect(result.profile_name).toBe('Homer Jay Simpson')
    expect(result.message).toContain('switch_proxy_target')
  })

  it('reports a proxy record as the active one when the portal is switched', async () => {
    const { req } = familyRequest(CHILD_ID)

    const result = await runListProxyTargets(req)

    expect(result.active_patient).toBe('Bart Simpson')
    expect(result.patients.find((p) => p.id === CHILD_ID)!.is_active).toBe(true)
  })

  it('reports an account with no proxy access as single-record', async () => {
    const result = await runListProxyTargets(soloRequest())

    expect(result.count).toBe(0)
    expect(result.patients).toEqual([])
    expect(result.active_patient).toBeNull()
    expect(result.message).toContain('only its own record')
  })

  it('infers the active record from the profile when the portal reports no selection', async () => {
    // The script-block surface lists records but never flags a selection.
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) return new Response('nope', { status: 404 })
      if (config.path === '/Home') {
        return htmlResponse(`
          ${profileHtml('Bartholomew JoJo Simpson')}
          <script>
            EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Homer Jay Simpson",id:{type:"INTERNAL",value:"${SELF_ID}"},isSelf:!0});
            EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Bart Simpson",id:{type:"INTERNAL",value:"${CHILD_ID}"}});
          </script>
        `)
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await runListProxyTargets(req)

    // is_active is honestly null per record (selection unknown), but the
    // profile name pins down which record the portal is actually serving.
    expect(result.patients.every((p) => p.is_active === null)).toBe(true)
    expect(result.active_patient).toBe('Bart Simpson')
  })
})

describe('runSwitchProxyTarget', () => {
  it('switches by partial name and verifies against the profile', async () => {
    const { req, state } = familyRequest(SELF_ID)

    const result = await runSwitchProxyTarget(req, 'bart')

    expect(state.activeId).toBe(CHILD_ID)
    expect(result.switched_to).toBe('Bart Simpson')
    expect(result.is_self).toBe(false)
    expect(result.verified_profile_name).toBe('Bart Simpson')
    expect(result.message).toContain("Bart Simpson's record")
  })

  it('returns to the account holder with "me"', async () => {
    const { req, state } = familyRequest(CHILD_ID)

    const result = await runSwitchProxyTarget(req, 'me')

    expect(state.activeId).toBe(SELF_ID)
    expect(result.is_self).toBe(true)
  })

  it('refuses an ambiguous name, listing the candidates', async () => {
    const { req, state } = familyRequest(SELF_ID)

    await expect(runSwitchProxyTarget(req, 'Simpson')).rejects.toThrow(/matches 3 patient records/)
    expect(state.activeId).toBe(SELF_ID)
  })

  it('refuses an empty patient', async () => {
    const { req } = familyRequest(SELF_ID)
    await expect(runSwitchProxyTarget(req, '  ')).rejects.toThrow(/Pass the patient to switch to/)
  })

  it('errors on an account with no proxy access', async () => {
    await expect(runSwitchProxyTarget(soloRequest(), 'Bart')).rejects.toThrow(/nothing to switch/)
  })
})

describe('assertProxyReadContext', () => {
  it('passes silently when the portal is on the account holder and no patient was named', async () => {
    const { req } = familyRequest(SELF_ID)
    await expect(assertProxyReadContext(req)).resolves.toBeUndefined()
  })

  it('passes when the portal is on the named patient', async () => {
    const { req } = familyRequest(CHILD_ID)
    await expect(assertProxyReadContext(req, 'Bart')).resolves.toBeUndefined()
  })

  it('refuses when the portal is on someone else, naming the fix', async () => {
    const { req } = familyRequest(SELF_ID)

    await expect(assertProxyReadContext(req, 'Bart')).rejects.toThrow(
      /currently on 'Homer Jay Simpson'.*about 'Bart Simpson'.*switch_proxy_target.*"Bart Simpson"/s,
    )
    // Read-only: the refusal never followed a switch link.
    expect(mockCalls(req)).not.toContain('switchcontext')
  })

  it('refuses a default (account holder) read while switched to a proxy', async () => {
    // The stale-context hazard: a previous invocation left the session on a
    // child. An unqualified read must not silently return the child's chart.
    const { req } = familyRequest(CHILD_ID)

    await expect(assertProxyReadContext(req)).rejects.toThrow(/currently on 'Bart Simpson'/)
  })

  it('passes on a single-record account', async () => {
    await expect(assertProxyReadContext(soloRequest())).resolves.toBeUndefined()
  })

  it('rejects a patient on a single-record account', async () => {
    await expect(assertProxyReadContext(soloRequest(), 'Bart')).rejects.toThrow(
      /only one patient record/,
    )
  })

  it('tolerates a discovery failure when no patient was named', async () => {
    // Most accounts have no proxy access, and two of the three discovery
    // surfaces are inferred — a parsing miss must not break ordinary reads.
    const req = requestWithMockedResponses(() => {
      throw new Error('network down')
    })

    await expect(assertProxyReadContext(req)).resolves.toBeUndefined()
  })

  it('refuses on a discovery failure when a patient WAS named', async () => {
    const req = requestWithMockedResponses(() => {
      throw new Error('network down')
    })

    await expect(assertProxyReadContext(req, 'Bart')).rejects.toThrow(
      /Could not verify which patient record is active/,
    )
  })

  it('retries discovery on the next call after a failure', async () => {
    let calls = 0
    const req = requestWithMockedResponses((config) => {
      calls += 1
      if (calls === 1) throw new Error('flaky network')
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse({
          ProxySubjectList: FAMILY.map((t) => ({
            Id: t.id,
            DisplayName: t.displayName,
            LinkUrl: t.isSelf ? 'inside.asp' : `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${t.id}`,
            IsSelected: t.id === CHILD_ID,
            IsSelf: t.isSelf,
          })),
        })
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    await expect(assertProxyReadContext(req, 'Bart')).rejects.toThrow(/Could not verify/)
    // The failed discovery was evicted, so this one re-runs and succeeds.
    await expect(assertProxyReadContext(req, 'Bart')).resolves.toBeUndefined()
  })

  it('runs discovery once per session, even across parallel calls', async () => {
    let discoveries = 0
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        discoveries += 1
        return jsonResponse({
          ProxySubjectList: FAMILY.map((t) => ({
            Id: t.id,
            DisplayName: t.displayName,
            LinkUrl: t.isSelf ? 'inside.asp' : `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${t.id}`,
            IsSelected: t.isSelf,
            IsSelf: t.isSelf,
          })),
        })
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    // The mobile app fires its memory categories in one parallel burst.
    await Promise.all([
      assertProxyReadContext(req),
      assertProxyReadContext(req),
      assertProxyReadContext(req),
    ])
    await assertProxyReadContext(req)

    expect(discoveries).toBe(1)
  })

  it('sees fresh selection state after a switch invalidates the cache', async () => {
    const { req } = familyRequest(SELF_ID)

    await assertProxyReadContext(req) // primes the cache on self
    await runSwitchProxyTarget(req, 'Bart')

    // The guard must now see Bart as active, not the cached self selection.
    await expect(assertProxyReadContext(req, 'Bart')).resolves.toBeUndefined()
    await expect(assertProxyReadContext(req)).rejects.toThrow(/currently on 'Bart Simpson'/)
  })

  it('is not fooled by a stale cache from before an external context change', async () => {
    // A fresh MyChartRequest (new login) gets a fresh cache entry by
    // construction — the WeakMap is keyed on the request object. Two requests
    // never share state.
    const a = familyRequest(SELF_ID)
    const b = familyRequest(CHILD_ID)

    await expect(assertProxyReadContext(a.req)).resolves.toBeUndefined()
    await expect(assertProxyReadContext(b.req)).rejects.toThrow(/currently on 'Bart Simpson'/)
  })
})

/**
 * The guard is only worth anything if every capability goes through it. The
 * media capability is the one that historically didn't: two clients branched
 * on `rendersMedia` before dispatching and called `capability.run` directly.
 */
describe('executeCapability applies the guard to every capability', () => {
  // Everything the guard has to cover: chart reads and writes. The `Patients`
  // group is exempt by design, `account` acts on the login rather than a
  // chart, and `public` has no session to assert against at all.
  const CHART_CAPABILITIES = CAPABILITIES.filter(
    (c) =>
      c.group !== 'Patients' &&
      c.kind !== 'account' &&
      c.kind !== 'public' &&
      // A capability with no scraper never reaches the guard, because it never
      // reaches a chart — see the test below, which asserts exactly that.
      !c.notImplemented,
  )

  it('covers the media capability, not just the JSON ones', () => {
    // If this ever stops holding, the loop below is testing nothing.
    expect(CHART_CAPABILITIES.some((c) => c.rendersMedia)).toBe(true)
  })

  it('refuses download_imaging_study while the portal is on another patient', async () => {
    const { req } = familyRequest(CHILD_ID)

    // Args are deliberately empty: the refusal has to come from the guard,
    // before `run` gets far enough to complain about a missing image_id.
    await expect(executeCapability(req, 'download_imaging_study', {})).rejects.toThrow(
      /Refusing to read: MyChart is currently on 'Bart Simpson'/,
    )
  })

  it('refuses every chart-touching capability the same way', async () => {
    for (const capability of CHART_CAPABILITIES) {
      const { req } = familyRequest(CHILD_ID)
      await expect(executeCapability(req, capability.id, {})).rejects.toThrow(
        /Refusing to read: MyChart is currently on 'Bart Simpson'/,
      )
    }
  })

  it('answers an unimplemented capability without ever consulting the chart', async () => {
    // The guard's job is to refuse a read of the wrong patient's record. A
    // capability that ships no scraper reads nobody's record, so it returns its
    // notice rather than the refusal — and, more to the point, it must do so
    // without spending a request finding out which patient is active.
    for (const capability of CAPABILITIES.filter((c) => c.notImplemented)) {
      const { req } = familyRequest(CHILD_ID)
      const result = await executeCapability(req, capability.id, {})
      expect(result).toContain(`${capability.id} is not implemented`)
      // Not one request: no /ProxySwitch to discover the active patient, and
      // certainly nothing to the capability's own endpoint.
      expect((req.makeRequest as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0)
    }
  })

  it('lets the media capability through once the portal is on the named patient', async () => {
    const { req } = familyRequest(CHILD_ID)

    // Past the guard, so the failure is now the capability's own — proof the
    // assertion ran and passed rather than never having been reached.
    const error = await executeCapability(req, 'download_imaging_study', { patient: 'Bart' })
      .then(() => null, (err: unknown) => err as Error)

    expect(error).toBeInstanceOf(Error)
    expect(error!.message).not.toContain('Refusing to read')
    expect(error!.message).toMatch(/image_id|imaging_index|study/i)
  })
})
