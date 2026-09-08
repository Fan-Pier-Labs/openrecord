import { describe, it, expect, mock } from 'bun:test'
import {
  getBillingHistory,
  fetchBillingRaw,
  billingProcessor,
  getEncBillingId,
  getPaymentList,
  getStatementList,
  saveStatementPdf,
  downloadBillingStatement,
} from '../bills'
import { toEpicDteLocal } from '../../../../../shared/epicDate'
import { MyChartRequest } from '../../../core/myChartRequest'
import type { BillingAccount, StatementItem } from '../types'
import { renderOutput } from '../../../processors/processor'

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

describe('downloadBillingStatement', () => {
  const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // %PDF-1.4
  const card = (id: string, guarantor: string) => `
    <div class="ba_card">
      <p class="ba_card_header_account_idAndType">Guarantor #${guarantor} (Homer Simpson)</p>
      <p class="ba_card_status_due_amount">$1.00</p>
      <p class="ba_card_status_recentPaymentLabel">
        <a href="https://mychart.example.com/Billing/Detail?ID=${id}&Context=CTX">View</a>
      </p>
    </div>`
  const statement = (RecordID: string, extra: Record<string, unknown> = {}) => ({
    RecordID, DateDisplay: '20260115', FormattedDateDisplay: 'Jan 15, 2026', Description: 'Sent via postal mail',
    StatementAmountDisplay: '$350.00', IsDetailBill: false, EncBillingSystem: 'BS', ImagePath: 'IMG', Token: 'tok/en', ...extra,
  })
  // Two accounts: the statement lives on the second, as an itemized bill.
  const lists: Record<string, unknown> = {
    'id=ACC-1': { DataStatement: { StatementList: [statement('REC-1')] }, DataDetailBill: { StatementList: [] } },
    'id=ACC-2': { DataStatement: { StatementList: [] }, DataDetailBill: { StatementList: [statement('REC-2', { IsDetailBill: true, DateDisplay: '20251201', Description: 'Itemized bill' })] } },
  }
  function twoAccounts(overrides: Array<[string, string | (() => Response)]> = []) {
    return mockRouted([
      ...overrides,
      ['/Billing/Summary', card('ACC-1', '1') + card('ACC-2', '2')],
      ['GetStatementList?noCache=', () => new Response('unreachable')],
      ['GetStatementList', () => new Response('unreachable')],
      ['DownloadFromBlob', () => new Response(PDF, { status: 200 })],
      ['/Billing/Details?ID=ACC-2', '{"EncID":"ENC-2"}'],
      ['/Billing/Details?ID=ACC-1', '{"EncID":"ENC-1"}'],
    ])
  }
  // The statement list is routed per account, which the fragment router
  // cannot express, so it is answered from the account id in the url.
  function withStatementLists(mocked: ReturnType<typeof mockRouted>) {
    const inner = mocked.req.transport
    mocked.req.transport = mock(async (url: string, init: RequestInit = {}) => {
      if (url.includes('GetStatementList')) {
        mocked.calls.push({ url, init })
        const key = Object.keys(lists).find((k) => url.includes(k))!
        return new Response(JSON.stringify(lists[key]), { status: 200 })
      }
      return inner(url, init)
    })
    return mocked
  }

  it('finds the statement on whichever account and list holds it, and returns the PDF', async () => {
    const { req, calls } = withStatementLists(twoAccounts())
    const result = await downloadBillingStatement(req, 'REC-2')

    expect(result.mimeType).toBe('application/pdf')
    expect(result.fileName).toBe('Statement_20251201.pdf')
    expect(Buffer.from(result.bytes).subarray(0, 4).toString()).toBe('%PDF')
    expect(result.statement).toEqual({
      RecordID: 'REC-2', dateISO: '2025-12-01', FormattedDateDisplay: 'Jan 15, 2026', Description: 'Itemized bill',
      StatementAmountDisplay: '$350.00', IsDetailBill: true,
    })
    // The download is keyed by the owning account's EncID, not the first account's.
    const download = urlFor(calls, 'DownloadFromBlob')
    expect(download).toContain('earId=ENC-2')
    expect(download).toContain('id=REC-2')
    expect(download).toContain(`token=${encodeURIComponent('tok/en')}`)
    expect(calls.some((c) => c.url.includes('/Billing/Details?ID=ACC-1'))).toBe(false)
  })

  it('names the RecordIDs it did find when the one asked for is not there', async () => {
    const { req } = withStatementLists(twoAccounts())
    await expect(downloadBillingStatement(req, 'REC-9')).rejects.toThrow(/No billing statement has RecordID "REC-9".*REC-1, REC-2/)
  })

  it('refuses when the details page has no EncID rather than requesting a broken download', async () => {
    const { req, calls } = withStatementLists(twoAccounts([['/Billing/Details?ID=ACC-2', '<html>no id</html>']]))
    await expect(downloadBillingStatement(req, 'REC-2')).rejects.toThrow(/carried no EncID/)
    expect(calls.some((c) => c.url.includes('DownloadFromBlob'))).toBe(false)
  })

  it('refuses a 200 that is not a PDF instead of saving an error page as one', async () => {
    const { req } = withStatementLists(twoAccounts([['DownloadFromBlob', () => new Response('<html>Session expired</html>', { status: 200 })]]))
    await expect(downloadBillingStatement(req, 'REC-1')).rejects.toThrow(/did not return a PDF.*Session expired/)
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

  const visit = (Description: string, SelfAmountDueRaw = 0) => ({
    Description, StartDateDisplay: '01/10/2026', Patient: 'Homer Simpson', Provider: 'Dr. Hibbert',
    HospitalAccountId: 'HAR-1', StartDate: 67000, SelfAmountDueRaw, SelfAmountDue: `$${SelfAmountDueRaw.toFixed(2)}`,
  })

  const details = (visits: unknown[] = [], informational: unknown[] = []) =>
    JSON.stringify({
      Success: true,
      Data: { UnifiedVisitList: visits, InformationalVisitList: informational, HasVisits: true, CanMakePayment: true },
    })

  function fullMock(overrides: Array<[string, string | (() => Response)]> = []) {
    return mockRouted([
      ...overrides,
      ['/Billing/Summary', SUMMARY_HTML],
      ['GetVisits', details([visit('Annual physical', 42.5)], [visit('Flu shot')])],
      ['GetStatementList', JSON.stringify({ DataStatement: { StatementList: [{ FormattedDateDisplay: 'Jan 15, 2026', StatementAmountDisplay: '$42.50', IsRead: false, RecordID: 'REC-1' }] }, DataDetailBill: { StatementList: [] } })],
      ['LoadPaymentList', JSON.stringify({ Data: { PaymentList: [{ FormattedDateDisplay: 'Dec 5, 2025', Description: 'MyChart Payment', PaymentAmountDisplay: '$150.00' }] } })],
      ['/Billing/Details', '{"EncID":"ENC-7"}'],
    ])
  }

  it('joins visits, statements and payments onto each account in the standard object', async () => {
    const { req } = fullMock()
    const result = await getBillingHistory(req)

    expect(result.totalDue).toBe(42.5)
    const [account] = result.accounts
    expect(account).toMatchObject({ guarantorNumber: '7007', patientName: 'Homer Simpson', amountDueNumber: 42.5, HasVisits: true, CanMakePayment: true })
    expect(account!.visits.map((v) => [v.Description, v.category])).toEqual([
      ['Flu shot', 'InformationalVisitList'],
      ['Annual physical', 'UnifiedVisitList'],
    ])
    expect(account!.statements).toHaveLength(1)
    expect(account!.statements[0]).toMatchObject({ FormattedDateDisplay: 'Jan 15, 2026', StatementAmountDisplay: '$42.50', IsRead: false, RecordID: 'REC-1' })
    expect(account!.payments).toEqual([{
      FormattedDateDisplay: 'Dec 5, 2025', Description: 'MyChart Payment', SubText: null,
      PaymentAmountDisplay: '$150.00', UndistributedAmountDisplay: null, Receipt: null,
    }])
    // Account keys are internal: in raw as the request paths, not in standard.
    expect(JSON.stringify(result)).not.toContain('ENC-7')
    expect(JSON.stringify(result)).not.toContain('CTX7')
  })

  it('records the summary page and the four per-account calls, minus the cache-buster', async () => {
    const { req } = fullMock()
    const raw = await fetchBillingRaw(req)

    expect(raw.requests.map((r) => r.path.split('?')[0])).toEqual([
      '/Billing/Summary',
      '/Billing/Details/GetVisits',
      '/Billing/Details/GetStatementList',
      '/Billing/Details/LoadPaymentList',
      '/Billing/Details',
    ])
    for (const r of raw.requests.slice(1)) {
      expect(r.path).not.toContain('noCache')
      expect(r.path).toMatch(/id=ID7/i)
      expect(r.path).toMatch(/context=CTX7/i)
    }
    // The details page is recorded whole (parsed, since this one is JSON-shaped); EncID is raw-only.
    expect(raw.requests[4]!.body).toEqual({ EncID: 'ENC-7' })
    expect(renderOutput(billingProcessor, raw, 'raw')).toBe(raw)
    expect(renderOutput(billingProcessor, raw, 'concise')).toContain('- **totalDue**: 42.5')
  })

  it('searches a window wide enough to cover a lifetime of visits', async () => {
    // The visit search is bounded by explicit dates, so a narrow window would
    // silently drop old bills.
    const { req, calls } = fullMock()
    await getBillingHistory(req)

    const url = urlFor(calls, 'GetVisits')
    const start = Number(new URL(url).searchParams.get('searchStartDTE'))
    const stop = Number(new URL(url).searchParams.get('searchStopDTE'))

    expect(start).toBeLessThanOrEqual(toEpicDteLocal(new Date()) - 100 * 365)
    expect(stop).toBeGreaterThan(toEpicDteLocal(new Date()))
  })

  it('keeps the visits when a supplementary call fails, and records the failure', async () => {
    // A statement-list outage should not cost the caller the visit history it
    // already retrieved.
    const { req } = mockRouted([
      ['/Billing/Summary', SUMMARY_HTML],
      ['GetVisits', details([visit('Annual physical')])],
      ['GetStatementList', () => new Response('not json', { status: 500 })],
      ['LoadPaymentList', () => { throw new Error('connection reset') }],
      ['/Billing/Details', '{"EncID":"ENC-7"}'],
    ])

    const raw = await fetchBillingRaw(req)
    expect(raw.requests.find((r) => r.path.includes('GetStatementList'))).toMatchObject({ status: 500, body: 'not json' })
    expect(raw.requests.some((r) => r.path.includes('LoadPaymentList'))).toBe(false)

    const [account] = billingProcessor.standard(raw).accounts
    expect(account!.visits.map((v) => v.Description)).toEqual(['Annual physical'])
    expect(account!.statements).toEqual([])
    expect(account!.payments).toEqual([])
  })

  it('returns no accounts when the summary page has none', async () => {
    const { req } = mockRouted([['/Billing/Summary', '<html><body>No balance</body></html>']])
    expect(await getBillingHistory(req)).toEqual({ totalDue: 0, accounts: [] })
  })
})
