import { afterAll, beforeAll, describe, it, expect, mock } from 'bun:test'
import { MyChartRequest } from '../myChartRequest'
import {
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

function requestWithMockedResponses(handler: (config: RequestConfig) => Response | Promise<Response>): MyChartRequest {
  const req = new MyChartRequest('mychart.example.org')
  req.setFirstPathPart('MyChart')
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
        linkUrl: '/MyChart/inside.asp?mode=self',
        source: 'proxy-switch-json',
      },
      {
        id: 'proxy-1',
        displayName: 'Alex Patient',
        isSelf: false,
        isSelected: false,
        linkUrl: 'https://mychart.example.org/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-1',
        source: 'proxy-switch-json',
      },
    ])
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
      source: target.source,
    }))).toEqual([
      {
        id: '',
        displayName: 'Account Holder',
        isSelf: true,
        isSelected: true,
        source: 'home-html',
      },
      {
        id: 'proxy-2',
        displayName: 'Jordan Patient',
        isSelf: false,
        isSelected: false,
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
        linkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-3',
        source: 'home-html',
      },
    ])
  })

  it('switches proxy context and verifies the selected target', async () => {
    let proxySwitchCalls = 0
    const requestedUrls: string[] = []
    const req = requestWithMockedResponses((config) => {
      if (config.path?.startsWith('/ProxySwitch')) {
        proxySwitchCalls += 1
        return jsonResponse({
          ProxySubjectList: [
            {
              Id: '',
              DisplayName: 'Account Holder',
              LinkUrl: '#',
              IsSelected: proxySwitchCalls === 1,
              IsSelf: true,
            },
            {
              Id: 'proxy-4',
              DisplayName: 'Casey Patient',
              LinkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-4',
              IsSelected: proxySwitchCalls > 1,
              IsSelf: false,
            },
          ],
        })
      }

      if (config.url?.includes('switchcontext')) {
        requestedUrls.push(config.url)
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

  it('rejects ambiguous display names', async () => {
    const targets: ProxyTarget[] = [
      {
        id: 'proxy-5',
        displayName: 'Morgan Patient',
        isSelf: false,
        isSelected: false,
        linkUrl: '/MyChart/inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=proxy-5',
        source: 'proxy-switch-json',
      },
      {
        id: 'proxy-6',
        displayName: 'Morgan Patient',
        isSelf: false,
        isSelected: false,
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
        linkUrl: '/MyChart/inside.asp?mode=self',
        source: 'home-html',
      },
      {
        id: 'proxy-7',
        displayName: 'Riley Patient',
        isSelf: false,
        isSelected: true,
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
  })
})
