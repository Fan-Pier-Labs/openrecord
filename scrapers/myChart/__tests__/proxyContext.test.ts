import { afterAll, beforeAll, describe, it, expect, mock } from 'bun:test'
import { MyChartRequest } from '../myChartRequest'
import {
  compareProfileNames,
  discoverProxyTargets,
  switchProxyTarget,
  verifyActiveProxyTarget,
  type ProxyTarget,
} from '../proxyContext'
import type { RequestConfig } from '../types'
import { resetLogSink, silenceLogger } from '../../../shared/logger'

beforeAll(() => {
  silenceLogger()
})

afterAll(() => {
  resetLogSink()
})

// Opaque `WP-…` ids in the shape observed on UCSF, Renown and Carson Tahoe.
// The account holder's record carries one of these too — it is NOT blank, and
// nothing may key off the id to find it.
const SELF_ID = 'WP-4KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MT'
const CHILD_ID = 'WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MT'
const SIBLING_ID = 'WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6'

function requestWithMockedResponses(
  handler: (config: RequestConfig) => Response | Promise<Response>,
  firstPathPart: string | null = 'MyChart',
): MyChartRequest {
  const req = new MyChartRequest('mychart.example.org')
  req.setFirstPathPart(firstPathPart)
  req.makeRequest = mock(handler) as typeof req.makeRequest
  return req
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function htmlResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
    ...init,
  })
}

function profileHtml(name = 'Alex Patient', dob = '1/2/2000'): string {
  return `<html><body><div class="printheader">Name: ${name} | DOB: ${dob} | MRN: 12345 | PCP: Example Clinician</div></body></html>`
}

/**
 * A `/ProxySwitch` payload in the real observed shape: every record has an
 * opaque id, self is flagged with `IsSelf`, and `LinkUrl` is relative and
 * un-prefixed — a bare `inside.asp` for the account holder, a switchcontext
 * query for proxies.
 */
function proxySwitchPayload(activeId: string = SELF_ID) {
  return {
    ProxySubjectList: [
      {
        Id: SELF_ID,
        IdEmpty: false,
        IdPrefix: 'WP-',
        DisplayName: 'Account Holder',
        LinkUrl: 'inside.asp',
        IsSelected: activeId === SELF_ID,
        IsSelf: true,
      },
      {
        Id: CHILD_ID,
        IdEmpty: false,
        IdPrefix: 'WP-',
        DisplayName: 'Casey Patient',
        LinkUrl: `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`,
        IsSelected: activeId === CHILD_ID,
        IsSelf: false,
      },
    ],
  }
}

describe('proxyContext', () => {
  it('discovers proxy targets from ProxySwitch JSON', async () => {
    const req = requestWithMockedResponses((config) => {
      expect(config.path).toStartWith('/ProxySwitch?noCache=')
      expect(config.headers['X-Requested-With']).toBe('XMLHttpRequest')
      return jsonResponse(proxySwitchPayload())
    })

    const targets = await discoverProxyTargets(req)

    expect(targets).toEqual([
      {
        id: SELF_ID,
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: true,
        selectionKnown: true,
        // Relative LinkUrls get the deployment prefix put back on.
        linkUrl: '/MyChart/inside.asp',
        source: 'proxy-switch-json',
      },
      {
        id: CHILD_ID,
        displayName: 'Casey Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        linkUrl: `/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`,
        source: 'proxy-switch-json',
      },
    ])
  })

  it('does not treat the account holder as the record with a blank id', async () => {
    // Regression guard for the assumption this code shipped with. Three live
    // instances give self a real opaque id; only IsSelf identifies it.
    const req = requestWithMockedResponses(() => jsonResponse(proxySwitchPayload()))
    const targets = await discoverProxyTargets(req)

    expect(targets.every(t => t.id.startsWith('WP-'))).toBe(true)
    expect(targets.filter(t => t.isSelf)).toHaveLength(1)
    expect(targets.find(t => t.isSelf)!.id).toBe(SELF_ID)
  })

  it('builds switch links without a prefix on root-mounted instances', async () => {
    const req = requestWithMockedResponses(() => jsonResponse({
      ProxySubjectList: [
        { Id: SELF_ID, DisplayName: 'Account Holder', LinkUrl: 'inside.asp', IsSelected: true, IsSelf: true },
        { Id: CHILD_ID, DisplayName: 'Sam Patient', LinkUrl: '', IsSelected: false, IsSelf: false },
      ],
    }), null)

    const targets = await discoverProxyTargets(req)

    // firstPathPart is null for instances mounted at the domain root. A naive
    // template would emit '/null/inside.asp'.
    expect(targets[0].linkUrl).toBe('/inside.asp')
    expect(targets[1].linkUrl).toBe(`/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`)
  })

  it('falls back to Home HTML proxy links when ProxySwitch JSON is unavailable', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return new Response('not found', { status: 404 })
      }
      if (config.path === '/Home') {
        return htmlResponse(`
          <a class="proxySubjectLink currentContext" data-id="${SELF_ID}" href="/MyChart/inside.asp" aria-label="access your record">
            <span class="proxySelectorDropDownNameEllipsis">Account Holder</span>
          </a>
          <a class="proxySubjectLink" data-id="${CHILD_ID}" href="/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}">
            <span class="proxySelectorDropDownNameEllipsis">Jordan Patient</span>
          </a>
        `)
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const targets = await discoverProxyTargets(req)

    expect(targets.map((target) => ({
      id: target.id,
      displayName: target.displayName,
      isSelf: target.isSelf,
      isSelected: target.isSelected,
      selectionKnown: target.selectionKnown,
      source: target.source,
    }))).toEqual([
      {
        id: SELF_ID,
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: true,
        selectionKnown: true,
        source: 'home-html',
      },
      {
        id: CHILD_ID,
        displayName: 'Jordan Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        source: 'home-html',
      },
    ])
  })

  it('identifies self in HTML by link shape, not by a missing data-id', async () => {
    // Self carries a data-id like everyone else. What sets it apart is that its
    // link has no switchcontext query.
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) return new Response('nope', { status: 404 })
      if (config.path === '/Home') {
        return htmlResponse(`
          <a class="proxySubjectLink" data-id="${SELF_ID}" href="/MyChart/inside.asp">
            <span class="proxySelectorDropDownNameEllipsis">Account Holder</span>
          </a>
          <a class="proxySubjectLink currentContext" data-id="${CHILD_ID}" href="/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}">
            <span class="proxySelectorDropDownNameEllipsis">Jordan Patient</span>
          </a>
        `)
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const targets = await discoverProxyTargets(req)

    expect(targets.find(t => t.displayName === 'Account Holder')!.isSelf).toBe(true)
    expect(targets.find(t => t.displayName === 'Jordan Patient')!.isSelf).toBe(false)
  })

  it('discovers proxy targets from Home personalization script data', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse({ ProxySubjectList: [] })
      }
      if (config.path === '/Home') {
        return htmlResponse(`
          <script>
            EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Account Holder",id:{type:"INTERNAL",value:"${SELF_ID}"},isSelf:!0});
            EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Taylor Patient",id:{type:"INTERNAL",value:"${CHILD_ID}"}});
          </script>
        `)
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const targets = await discoverProxyTargets(req)

    expect(targets).toEqual([
      {
        id: SELF_ID,
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: false,
        selectionKnown: false,
        linkUrl: '/MyChart/inside.asp?mode=self',
        source: 'home-html',
      },
      {
        id: CHILD_ID,
        displayName: 'Taylor Patient',
        isSelf: false,
        isSelected: false,
        // The script payload carries no selection flag at all, so isSelected
        // is a default rather than a fact.
        selectionKnown: false,
        linkUrl: `/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`,
        source: 'home-html',
      },
    ])
  })

  it('reads the explicit isSelf flag in script data rather than inferring from a missing id', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) return jsonResponse({ ProxySubjectList: [] })
      if (config.path === '/Home') {
        return htmlResponse(
          `<script>EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Account Holder",id:{type:"INTERNAL",value:"${SELF_ID}"},isSelf:!0});</script>`)
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const targets = await discoverProxyTargets(req)
    expect(targets[0].isSelf).toBe(true)
    expect(targets[0].id).toBe(SELF_ID)
  })

  it('switches proxy context and verifies the selected target', async () => {
    let activeId = SELF_ID
    const requestedUrls: string[] = []
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload(activeId))
      }

      if (config.url?.includes('switchcontext')) {
        requestedUrls.push(config.url)
        activeId = CHILD_ID
        return new Response('', {
          status: 302,
          headers: { Location: '/MyChart/Home' },
        })
      }

      if (config.url?.endsWith('/MyChart/Home')) {
        requestedUrls.push(config.url)
        return htmlResponse('ok')
      }

      if (config.path === '/Home') {
        return htmlResponse(profileHtml('Casey Patient', '3/4/2010'))
      }

      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await switchProxyTarget(req, { id: CHILD_ID })

    expect(result.target.displayName).toBe('Casey Patient')
    expect(result.target.isSelected).toBe(true)
    expect(result.verifiedProfileName).toBe('Casey Patient')
    expect(result.verifiedDob).toBe('3/4/2010')
    expect(requestedUrls[0]).toBe(`https://mychart.example.org/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`)
  })

  it('switches back to the account holder with { self: true }, without knowing its id', async () => {
    // The portable way home. Proxy ids differ per organization, so a caller
    // must never have to look one up just to undo a switch.
    let activeId = CHILD_ID
    const requestedUrls: string[] = []
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload(activeId))
      }
      if (config.url?.endsWith('/MyChart/inside.asp')) {
        requestedUrls.push(config.url)
        activeId = SELF_ID
        return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
      }
      if (config.url?.endsWith('/MyChart/Home')) {
        return htmlResponse('ok')
      }
      if (config.path === '/Home') {
        return htmlResponse(profileHtml('Account Holder', '1/1/1980'))
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await switchProxyTarget(req, { self: true })

    expect(result.target.isSelf).toBe(true)
    expect(result.target.id).toBe(SELF_ID)
    // Followed the account holder's bare LinkUrl, exactly as served.
    expect(requestedUrls[0]).toBe('https://mychart.example.org/MyChart/inside.asp')
  })

  it('accepts id:"" as a spelling of "the account holder"', async () => {
    // Kept working because no observed instance issues a blank id, so it can't
    // collide with a real record.
    let activeId = CHILD_ID
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) return jsonResponse(proxySwitchPayload(activeId))
      if (config.url?.endsWith('/MyChart/inside.asp')) {
        activeId = SELF_ID
        return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
      }
      if (config.url?.endsWith('/MyChart/Home')) return htmlResponse('ok')
      if (config.path === '/Home') return htmlResponse(profileHtml('Account Holder', '1/1/1980'))
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await switchProxyTarget(req, { id: '' })
    expect(result.target.isSelf).toBe(true)
    expect(result.target.id).toBe(SELF_ID)
  })

  it('switches back to the account holder by its real id too', async () => {
    let activeId = CHILD_ID
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) return jsonResponse(proxySwitchPayload(activeId))
      if (config.url?.endsWith('/MyChart/inside.asp')) {
        activeId = SELF_ID
        return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
      }
      if (config.url?.endsWith('/MyChart/Home')) return htmlResponse('ok')
      if (config.path === '/Home') return htmlResponse(profileHtml('Account Holder', '1/1/1980'))
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await switchProxyTarget(req, { id: SELF_ID })
    expect(result.target.isSelf).toBe(true)
  })

  it('still refuses an implicit switch to self', async () => {
    const req = requestWithMockedResponses(() => jsonResponse(proxySwitchPayload(CHILD_ID)))

    // Nothing in the request names the account holder, so resolving to self
    // here would mean silently leaving the proxy record the caller asked about.
    await expect(switchProxyTarget(req, {})).rejects.toThrow('Proxy target must include self, id or displayName.')
  })

  it('confirms a switch by profile identity when the portal reports no selection', async () => {
    // The script-block fallback never marks a record as selected, so
    // confirmation has to fall back to who the profile page says we are.
    let switched = false
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return new Response('not found', { status: 404 })
      }

      if (config.url?.includes('switchcontext')) {
        switched = true
        return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
      }

      if (config.url?.endsWith('/MyChart/Home')) {
        return htmlResponse('ok')
      }

      if (config.path === '/Home') {
        const name = switched ? 'Taylor Ann Patient' : 'Account Holder'
        return htmlResponse(`
          ${profileHtml(name, '7/8/2011')}
          <script>EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Taylor Patient",id:{type:"INTERNAL",value:"${CHILD_ID}"}});</script>
        `)
      }

      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await switchProxyTarget(req, { id: CHILD_ID })

    expect(result.target.id).toBe(CHILD_ID)
    expect(result.target.isSelected).toBe(true)
    expect(result.verifiedProfileName).toBe('Taylor Ann Patient')
  })

  it('rejects a switch that lands on a different patient', async () => {
    let activeId = SELF_ID
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload(activeId))
      }
      if (config.url?.includes('switchcontext')) {
        activeId = CHILD_ID
        return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
      }
      if (config.url?.endsWith('/MyChart/Home')) {
        return htmlResponse('ok')
      }
      if (config.path === '/Home') {
        // Portal says the switch worked, but is serving someone else's chart.
        return htmlResponse(profileHtml('Morgan Different', '9/9/1999'))
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    await expect(switchProxyTarget(req, { id: CHILD_ID }))
      .rejects.toThrow("Proxy switch landed on the wrong patient: asked for 'Casey Patient', portal reports 'Morgan Different'.")
  })

  it('rejects a switch that lands on a sibling sharing the surname', async () => {
    // The dangerous near-miss: same family, wrong chart. A surname comparison
    // waves this through, so confirmation has to notice that the profile we
    // landed on matches a *different* record in the list.
    const siblings = {
      ProxySubjectList: [
        { Id: SELF_ID, DisplayName: 'Homer Simpson', LinkUrl: 'inside.asp', IsSelected: false, IsSelf: true },
        { Id: CHILD_ID, DisplayName: 'Bart Simpson', LinkUrl: `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`, IsSelected: false, IsSelf: false },
        { Id: SIBLING_ID, DisplayName: 'Lisa Simpson', LinkUrl: `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${SIBLING_ID}`, IsSelected: true, IsSelf: false },
      ],
    }
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) return jsonResponse(siblings)
      if (config.url?.includes('switchcontext')) {
        return new Response('', { status: 302, headers: { Location: '/MyChart/Home' } })
      }
      if (config.url?.endsWith('/MyChart/Home')) return htmlResponse('ok')
      if (config.path === '/Home') return htmlResponse(profileHtml('Lisa Marie Simpson', '5/9/2016'))
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    await expect(switchProxyTarget(req, { id: CHILD_ID }))
      .rejects.toThrow("portal is showing 'Lisa Marie Simpson' (Lisa Simpson)")
  })

  it('errors instead of falling through when the redirect chain will not settle', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload())
      }
      if (config.url) {
        // Endless redirect loop.
        return new Response('', { status: 302, headers: { Location: `/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}` } })
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    await expect(switchProxyTarget(req, { id: CHILD_ID }))
      .rejects.toThrow(/redirect chain exceeded 5 hops/)
  })

  it('rejects ambiguous display names', async () => {
    const targets: ProxyTarget[] = [
      {
        id: CHILD_ID,
        displayName: 'Morgan Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        linkUrl: `/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`,
        source: 'proxy-switch-json',
      },
      {
        id: SIBLING_ID,
        displayName: 'Morgan Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        linkUrl: `/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${SIBLING_ID}`,
        source: 'proxy-switch-json',
      },
    ]
    const req = requestWithMockedResponses(() => {
      throw new Error('should not make a network request')
    })

    await expect(switchProxyTarget(req, { displayName: 'Morgan Patient' }, { discoveredTargets: targets }))
      .rejects.toThrow("Ambiguous proxy target displayName 'Morgan Patient'.")
  })

  it('reports clearly when no discovered record is flagged as self', async () => {
    const targets: ProxyTarget[] = [
      {
        id: CHILD_ID,
        displayName: 'Casey Patient',
        isSelf: false,
        isSelected: true,
        selectionKnown: true,
        linkUrl: '/MyChart/inside.asp',
        source: 'proxy-switch-json',
      },
    ]
    const req = requestWithMockedResponses(() => {
      throw new Error('should not make a network request')
    })

    await expect(switchProxyTarget(req, { self: true }, { discoveredTargets: targets }))
      .rejects.toThrow(/Could not resolve the account holder's own record: 0 of 1/)
  })

  it('verifies the active proxy target against profile data', async () => {
    const proxyTargets: ProxyTarget[] = [
      {
        id: SELF_ID,
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: false,
        selectionKnown: true,
        linkUrl: '/MyChart/inside.asp',
        source: 'home-html',
      },
      {
        id: CHILD_ID,
        displayName: 'Riley Patient',
        isSelf: false,
        isSelected: true,
        selectionKnown: true,
        linkUrl: `/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${CHILD_ID}`,
        source: 'home-html',
      },
    ]
    const req = requestWithMockedResponses((config) => {
      if (config.path === '/Home') {
        return htmlResponse(profileHtml('Riley Patient', '5/6/2012'))
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await verifyActiveProxyTarget(req, { proxyTargets })

    expect(result.profileName).toBe('Riley Patient')
    expect(result.profileDob).toBe('5/6/2012')
    expect(result.selectedTarget?.id).toBe(CHILD_ID)
    expect(result.selectionKnown).toBe(true)
  })

  it('reports selectionKnown false when no source could tell which record is active', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return new Response('not found', { status: 404 })
      }
      if (config.path === '/Home') {
        return htmlResponse(`
          ${profileHtml('Taylor Patient', '7/8/2011')}
          <script>EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Taylor Patient",id:{type:"INTERNAL",value:"${CHILD_ID}"}});</script>
        `)
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await verifyActiveProxyTarget(req)

    expect(result.selectionKnown).toBe(false)
    expect(result.selectedTarget).toBeNull()
  })
})

describe('compareProfileNames', () => {
  it('accepts the same person written with more or fewer name parts', () => {
    expect(compareProfileNames('Homer Simpson', 'Homer Jay Simpson')).toBe('match')
    expect(compareProfileNames('Homer J. Simpson', 'Homer Simpson')).toBe('match')
    expect(compareProfileNames('Homer Simpson Jr.', 'Homer Simpson')).toBe('match')
    expect(compareProfileNames('Simpson, Homer Jay', 'Homer Jay Simpson')).toBe('match')
  })

  it('accepts a short form of the given name', () => {
    // The proxy list says "Bart Simpson"; the profile page says the legal name.
    expect(compareProfileNames('Bart Simpson', 'Bartholomew JoJo Simpson')).toBe('match')
    expect(compareProfileNames('Dan Patient', 'Daniel Patient')).toBe('match')
  })

  it('flags a genuinely different person', () => {
    expect(compareProfileNames('Casey Patient', 'Morgan Different')).toBe('mismatch')
    expect(compareProfileNames('Bart Simpson', 'Homer Flanders')).toBe('mismatch')
  })

  it('withholds judgement between relatives sharing a surname', () => {
    // Could be a sibling, could be a nickname this function can't expand.
    // switchProxyTarget resolves it by checking the other known records.
    expect(compareProfileNames('Bart Simpson', 'Lisa Simpson')).toBe('unknown')
    expect(compareProfileNames('Peggy Patient', 'Margaret Patient')).toBe('unknown')
  })

  it('has no opinion when a name is missing or is a generic self label', () => {
    expect(compareProfileNames('', 'Homer Simpson')).toBe('unknown')
    expect(compareProfileNames('Homer Simpson', '')).toBe('unknown')
    expect(compareProfileNames('Me', 'Homer Simpson')).toBe('unknown')
    expect(compareProfileNames('Myself', 'Homer Simpson')).toBe('unknown')
  })
})
