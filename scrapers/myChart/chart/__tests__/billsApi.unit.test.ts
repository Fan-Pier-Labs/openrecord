import { describe, it, expect, mock } from 'bun:test'
import {
  getBillingHistory,
  getEncBillingId,
  getPaymentList,
  getStatementList,
  saveStatementPdf,
} from '../bills/bills'
import { date2dte } from '../bills/utils'
import { MyChartRequest } from '../../core/myChartRequest'
import type { BillingAccount, StatementItem } from '../bills/types'

const ACCOUNT: BillingAccount = {
  guarantorNumber: 'G-1',
  patientName: 'Homer Simpson',
  amountDue: 42.5,
  id: 'ACC-ID',
  context: 'CTX',
}

interface Call {
  url: string
  init: RequestInit
}

/**
 * Routes by url fragment. Values are either a string body or a factory, so a
 * route can return a non-200 or a binary payload.
 */
function mockRouted(routes: Array<[string, string | (() => Response)]>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Call[] = []

  req.transport = mock(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    for (const [fragment, body] of routes) {
      if (url.includes(fragment)) {
        return typeof body === 'function' ? body() : new Response(body, { status: 200 })
      }
    }
    return new Response('', { status: 404 })
  })

  return { req, calls }
}

const urlFor = (calls: Call[], fragment: string) =>
  calls.find((c) => c.url.includes(fragment))?.url ?? ''

describe('getPaymentList', () => {
  it('returns the parsed payment list', async () => {
    const { req } = mockRouted([
      ['LoadPaymentList', JSON.stringify({ Success: true, PaymentList: [{ Amount: '10.00' }] })],
    ])

    const result = await getPaymentList(req, ACCOUNT)
    expect(result).toMatchObject({ Success: true })
  })

  it('scopes the request to the account id and context', async () => {
    const { req, calls } = mockRouted([['LoadPaymentList', '{}']])
    await getPaymentList(req, ACCOUNT)

    const url = urlFor(calls, 'LoadPaymentList')
    expect(url).toContain('id=ACC-ID')
    expect(url).toContain('context=CTX')
    expect(url).toContain('noCache=')
  })
})

describe('getStatementList', () => {
  it('returns the parsed statement list', async () => {
    const { req } = mockRouted([
      ['GetStatementList', JSON.stringify({ DataStatement: { StatementList: [] } })],
    ])

    expect(await getStatementList(req, ACCOUNT)).toMatchObject({
      DataStatement: { StatementList: [] },
    })
  })

  it('scopes the request to the account id and context', async () => {
    const { req, calls } = mockRouted([['GetStatementList', '{}']])
    await getStatementList(req, ACCOUNT)

    const url = urlFor(calls, 'GetStatementList')
    expect(url).toContain('id=ACC-ID')
    expect(url).toContain('context=CTX')
  })
})

describe('getEncBillingId', () => {
  it('extracts the encrypted billing id from the details page', async () => {
    const { req } = mockRouted([['/Billing/Details', '<script>var x = {"EncID":"ENC-999"};</script>']])
    expect(await getEncBillingId(req, ACCOUNT)).toBe('ENC-999')
  })

  it('tolerates whitespace around the JSON separator', async () => {
    const { req } = mockRouted([['/Billing/Details', '{"EncID"  :   "ENC-1"}']])
    expect(await getEncBillingId(req, ACCOUNT)).toBe('ENC-1')
  })

  it('returns undefined when the page has no EncID', async () => {
    const { req } = mockRouted([['/Billing/Details', '<html>no id here</html>']])
    expect(await getEncBillingId(req, ACCOUNT)).toBeUndefined()
  })

  it('requests the details page for the given account', async () => {
    const { req, calls } = mockRouted([['/Billing/Details', '{"EncID":"E"}']])
    await getEncBillingId(req, ACCOUNT)

    const url = urlFor(calls, '/Billing/Details')
    expect(url).toContain('ID=ACC-ID')
    expect(url).toContain('Context=CTX')
  })
})

describe('saveStatementPdf', () => {
  const STATEMENT = {
    RecordID: 'REC-1',
    EncBillingSystem: '2',
    ImagePath: 'path/to/file',
    Token: 'tok en+slash/',
    DateDisplay: '2024-01-15',
  } as unknown as StatementItem

  it('returns the PDF bytes as a Buffer', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
    const { req } = mockRouted([['DownloadFromBlob', () => new Response(pdf, { status: 200 })]])

    const buffer = await saveStatementPdf(req, 'ENC-1', STATEMENT)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('url-encodes the token so slashes and plus signs survive', async () => {
    const { req, calls } = mockRouted([['DownloadFromBlob', () => new Response(new Uint8Array())]])
    await saveStatementPdf(req, 'ENC-1', STATEMENT)

    const url = urlFor(calls, 'DownloadFromBlob')
    expect(url).toContain(`token=${encodeURIComponent('tok en+slash/')}`)
    expect(url).toContain('earId=ENC-1')
    expect(url).toContain('id=REC-1')
  })
})

describe('getBillingHistory', () => {
  const SUMMARY_HTML = `
    <div class="ba_card">
      <p class="ba_card_header_account_idAndType">Guarantor #7007 (Homer Simpson)</p>
      <p class="ba_card_status_due_amount">$42.50</p>
      <p class="ba_card_status_recentPaymentLabel">
        <a href="https://mychart.example.com/Billing/Detail?ID=ID7&Context=CTX7">View</a>
      </p>
    </div>
  `

  const details = (visits: unknown[] = [], informational: unknown[] = []) =>
    JSON.stringify({
      Success: true,
      Data: { UnifiedVisitList: visits, InformationalVisitList: informational },
    })

  function fullMock(overrides: Array<[string, string | (() => Response)]> = []) {
    return mockRouted([
      ...overrides,
      ['/Billing/Summary', SUMMARY_HTML],
      ['GetVisits', details([{ v: 1 }], [{ v: 2 }])],
      ['GetStatementList', JSON.stringify({ DataStatement: { StatementList: [] } })],
      ['LoadPaymentList', JSON.stringify({ PaymentList: [] })],
      ['/Billing/Details', '{"EncID":"ENC-7"}'],
    ])
  }

  it('attaches details, statements, payments and the encrypted id to each account', async () => {
    const { req } = fullMock()
    const [account] = await getBillingHistory(req)

    expect(account!.guarantorNumber).toBe('7007')
    expect(account!.billingDetails?.Success).toBe(true)
    expect(account!.statementList).toBeDefined()
    expect(account!.paymentList).toBeDefined()
    expect(account!.encBillingId).toBe('ENC-7')
  })

  it('searches a window wide enough to cover a lifetime of visits', async () => {
    // The visit search is bounded by explicit dates, so a narrow window would
    // silently drop old bills.
    const { req, calls } = fullMock()
    await getBillingHistory(req)

    const url = urlFor(calls, 'GetVisits')
    const start = Number(new URL(url).searchParams.get('searchStartDTE'))
    const stop = Number(new URL(url).searchParams.get('searchStopDTE'))

    expect(start).toBeLessThanOrEqual(date2dte(new Date()) - 100 * 365)
    expect(stop).toBeGreaterThan(date2dte(new Date()))
  })

  it('keeps the billing details when the supplementary calls fail', async () => {
    // A statement-list outage should not cost the caller the visit history it
    // already retrieved.
    const { req } = mockRouted([
      ['/Billing/Summary', SUMMARY_HTML],
      ['GetVisits', details([{ v: 1 }])],
      ['GetStatementList', () => new Response('not json', { status: 500 })],
      ['LoadPaymentList', JSON.stringify({ PaymentList: [] })],
      ['/Billing/Details', '{"EncID":"ENC-7"}'],
    ])

    const [account] = await getBillingHistory(req)
    expect(account!.billingDetails?.Success).toBe(true)
    expect(account!.statementList).toBeUndefined()
  })

  it('returns an empty list when the summary page has no accounts', async () => {
    const { req } = mockRouted([['/Billing/Summary', '<html><body>No balance</body></html>']])
    expect(await getBillingHistory(req)).toEqual([])
  })
})
