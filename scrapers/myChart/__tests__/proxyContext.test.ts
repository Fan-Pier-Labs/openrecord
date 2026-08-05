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
 * A ProxySwitch payload whose selection follows an in-memory "active id", so a
 * test can switch context and have discovery report the new state — the way a
 * real portal does.
 */
function proxySwitchPayload(activeId: string) {
  return {
    ProxySubjectList: [
      { Id: '', DisplayName: 'Account Holder', LinkUrl: '#', IsSelected: activeId === '', IsSelf: true },
      {
        Id: 'proxy-4',
        DisplayName: 'Casey Patient',
        LinkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-4',
        IsSelected: activeId === 'proxy-4',
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
      return jsonResponse({
        ProxySubjectList: [
          {
            Id: '',
            DisplayName: 'Account Holder',
            LinkUrl: '#',
            IsSelected: true,
            IsSelf: true,
          },
          {
            Id: 'proxy-1',
            DisplayName: 'Alex Patient',
            LinkUrl: 'https://mychart.example.org/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-1',
            IsSelected: false,
            IsSelf: false,
          },
        ],
      })
    })

    const targets = await discoverProxyTargets(req)

    expect(targets).toEqual([
      {
        id: '',
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: true,
        selectionKnown: true,
        linkUrl: '/MyChart/inside.asp?mode=self',
        source: 'proxy-switch-json',
      },
      {
        id: 'proxy-1',
        displayName: 'Alex Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        linkUrl: 'https://mychart.example.org/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-1',
        source: 'proxy-switch-json',
      },
    ])
  })

  it('builds switch links without a prefix on root-mounted instances', async () => {
    const req = requestWithMockedResponses(() => jsonResponse({
      ProxySubjectList: [
        { Id: '', DisplayName: 'Account Holder', LinkUrl: '#', IsSelected: true, IsSelf: true },
        { Id: 'proxy-9', DisplayName: 'Sam Patient', LinkUrl: '', IsSelected: false, IsSelf: false },
      ],
    }), null)

    const targets = await discoverProxyTargets(req)

    // firstPathPart is null for instances mounted at the domain root. A naive
    // template would emit '/null/inside.asp'.
    expect(targets[0].linkUrl).toBe('/inside.asp?mode=self')
    expect(targets[1].linkUrl).toBe('/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-9')
  })

  it('falls back to Home HTML proxy links when ProxySwitch JSON is unavailable', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return new Response('not found', { status: 404 })
      }
      if (config.path === '/Home') {
        return htmlResponse(`
          <a class="proxySubjectLink currentContext" href="/MyChart/inside.asp?mode=self" aria-label="access your record">
            <span class="proxySelectorDropDownNameEllipsis">Account Holder</span>
          </a>
          <a class="proxySubjectLink" data-id="proxy-2" href="/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-2">
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
        id: '',
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: true,
        selectionKnown: true,
        source: 'home-html',
      },
      {
        id: 'proxy-2',
        displayName: 'Jordan Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        source: 'home-html',
      },
    ])
  })

  it('discovers proxy targets from Home personalization script data', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse({ ProxySubjectList: [] })
      }
      if (config.path === '/Home') {
        return htmlResponse(`
          <script>
            EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Taylor Patient",id:{type:"INTERNAL",value:"proxy-3"}});
          </script>
        `)
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const targets = await discoverProxyTargets(req)

    expect(targets).toEqual([
      {
        id: 'proxy-3',
        displayName: 'Taylor Patient',
        isSelf: false,
        isSelected: false,
        // The script payload carries no selection flag at all, so isSelected
        // is a default rather than a fact.
        selectionKnown: false,
        linkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-3',
        source: 'home-html',
      },
    ])
  })

  it('switches proxy context and verifies the selected target', async () => {
    let activeId = ''
    const requestedUrls: string[] = []
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload(activeId))
      }

      if (config.url?.includes('switchcontext')) {
        requestedUrls.push(config.url)
        activeId = 'proxy-4'
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

    const result = await switchProxyTarget(req, { id: 'proxy-4' })

    expect(result.target.displayName).toBe('Casey Patient')
    expect(result.target.isSelected).toBe(true)
    expect(result.verifiedProfileName).toBe('Casey Patient')
    expect(result.verifiedDob).toBe('3/4/2010')
    expect(requestedUrls[0]).toBe('https://mychart.example.org/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-4')
  })

  it('switches back to the account holder by their empty-string id', async () => {
    // The self entry's Id is '' — the whole point of the round trip. A
    // truthiness check on the id sends this down the displayName branch and
    // then throws "must include id or displayName".
    let activeId = 'proxy-4'
    const requestedUrls: string[] = []
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload(activeId))
      }

      if (config.url?.includes('mode=self')) {
        requestedUrls.push(config.url)
        activeId = ''
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

    const result = await switchProxyTarget(req, { id: '' })

    expect(result.target.isSelf).toBe(true)
    expect(result.target.displayName).toBe('Account Holder')
    expect(requestedUrls[0]).toBe('https://mychart.example.org/MyChart/inside.asp?mode=self')
  })

  it('still refuses an implicit switch to self', async () => {
    const req = requestWithMockedResponses(() => jsonResponse(proxySwitchPayload('proxy-4')))

    // Nothing in the request names the account holder, so resolving to self
    // here would mean silently leaving the proxy record the caller asked about.
    await expect(switchProxyTarget(req, {})).rejects.toThrow('Proxy target must include id or displayName.')
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
          <script>EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Taylor Patient",id:{type:"INTERNAL",value:"proxy-3"}});</script>
        `)
      }

      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    const result = await switchProxyTarget(req, { id: 'proxy-3' })

    expect(result.target.id).toBe('proxy-3')
    expect(result.target.isSelected).toBe(true)
    expect(result.verifiedProfileName).toBe('Taylor Ann Patient')
  })

  it('rejects a switch that lands on a different patient', async () => {
    let activeId = ''
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload(activeId))
      }
      if (config.url?.includes('switchcontext')) {
        activeId = 'proxy-4'
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

    await expect(switchProxyTarget(req, { id: 'proxy-4' }))
      .rejects.toThrow("Proxy switch landed on the wrong patient: asked for 'Casey Patient', portal reports 'Morgan Different'.")
  })

  it('rejects a switch that lands on a sibling sharing the surname', async () => {
    // The dangerous near-miss: same family, wrong chart. A surname comparison
    // waves this through, so confirmation has to notice that the profile we
    // landed on matches a *different* record in the list.
    const siblings = {
      ProxySubjectList: [
        { Id: '', DisplayName: 'Homer Simpson', LinkUrl: '#', IsSelected: false, IsSelf: true },
        { Id: 'kid-1', DisplayName: 'Bart Simpson', LinkUrl: '', IsSelected: false, IsSelf: false },
        { Id: 'kid-2', DisplayName: 'Lisa Simpson', LinkUrl: '', IsSelected: true, IsSelf: false },
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

    await expect(switchProxyTarget(req, { id: 'kid-1' }))
      .rejects.toThrow("portal is showing 'Lisa Marie Simpson' (Lisa Simpson)")
  })

  it('errors instead of falling through when the redirect chain will not settle', async () => {
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        return jsonResponse(proxySwitchPayload(''))
      }
      if (config.url) {
        // Endless redirect loop.
        return new Response('', { status: 302, headers: { Location: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-4' } })
      }
      throw new Error(`Unexpected request ${JSON.stringify(config)}`)
    })

    await expect(switchProxyTarget(req, { id: 'proxy-4' }))
      .rejects.toThrow(/redirect chain exceeded 5 hops/)
  })

  it('rejects ambiguous display names', async () => {
    const targets: ProxyTarget[] = [
      {
        id: 'proxy-5',
        displayName: 'Morgan Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        linkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-5',
        source: 'proxy-switch-json',
      },
      {
        id: 'proxy-6',
        displayName: 'Morgan Patient',
        isSelf: false,
        isSelected: false,
        selectionKnown: true,
        linkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-6',
        source: 'proxy-switch-json',
      },
    ]
    const req = requestWithMockedResponses(() => {
      throw new Error('should not make a network request')
    })

    await expect(switchProxyTarget(req, { displayName: 'Morgan Patient' }, { discoveredTargets: targets }))
      .rejects.toThrow("Ambiguous proxy target displayName 'Morgan Patient'.")
  })

  it('verifies the active proxy target against profile data', async () => {
    const proxyTargets: ProxyTarget[] = [
      {
        id: '',
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: false,
        selectionKnown: true,
        linkUrl: '/MyChart/inside.asp?mode=self',
        source: 'home-html',
      },
      {
        id: 'proxy-7',
        displayName: 'Riley Patient',
        isSelf: false,
        isSelected: true,
        selectionKnown: true,
        linkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-7',
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
    expect(result.selectedTarget?.id).toBe('proxy-7')
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
          <script>EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"Taylor Patient",id:{type:"INTERNAL",value:"proxy-3"}});</script>
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
