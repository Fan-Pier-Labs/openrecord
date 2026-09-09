import { describe, it, expect, mock } from 'bun:test'
import {
  GET_BENEFITS_SUMMARY_PATH,
  fetchInsuranceBenefitsRaw,
  getInsuranceBenefits,
  insuranceBenefitsProcessor,
} from '../insuranceBenefits'
import { MyChartRequest } from '../../../core/myChartRequest'
import { renderOutput } from '../../../processors/processor'

/** One `.ba_card` per account, the shape `parseBillingAccountsHtml` reads. */
function summaryPage(accounts: Array<{ guarantor: string; name: string; id: string; context: string }>): string {
  return accounts
    .map(
      (a) => `<div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #${a.guarantor} (${a.name})</p>
        <p class="ba_card_status_due_amount">$275.00</p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="/MyChart/Billing/Details?ID=${a.id}&Context=${a.context}">Last paid</a>
        </p>
      </div>`,
    )
    .join('')
}

const TOKEN_PAGE = '<input name="__RequestVerificationToken" value="t" />'

const ONE_ACCOUNT = [{ guarantor: '742', name: 'Alice Smith', id: 'ACCT-1', context: 'CTX-1' }]

/** The blank side: what the captured account's `accountBucket` looked like. */
const BLANK_BUCKET = {
  isLimit: false,
  type: '',
  totalAmount: '',
  usedAmount: '',
  remainingAmount: '',
  usedRatio: 0,
  isTotalZero: false,
  rollPeriodEndDate: '',
  rollPeriod: '0',
  numberOfPeriods: 0,
  usedOnPrevLevel: '',
}

const PATIENT_DEDUCTIBLE = {
  isLimit: true,
  type: 'Family',
  totalAmount: '$2,000.00',
  usedAmount: '$1,240.00',
  remainingAmount: '$760.00',
  usedRatio: 0.62,
  isTotalZero: false,
  rollPeriodEndDate: '12/31/2026',
  rollPeriod: 'ConYear',
  numberOfPeriods: 1,
  usedOnPrevLevel: '',
}

/** The captured field set, with invented amounts. */
const BENEFITS = {
  coverageName: 'Example Health Plan (PPO)',
  payerName: 'Example Mutual Health',
  payerLogoBlobMagicId: 'BLOB-1',
  lastUpdatedText: 'Last updated 1/15/2026',
  benefitsPatientId: 'BEN-PAT-1',
  helpText: 'These amounts come from your insurer.',
  coverageId: 'CVG-1',
  queryKey: 'QK-1',
  noCoverageAvailable: false,
  hasAmbiguousCoverages: false,
  hasRTEUpdateInProgress: false,
  canAccessInsuranceHub: true,
  canAccessInsuranceSummary: true,
  canAccessCustomerService: true,
  canAccessAnyLinks: true,
  insuranceHubUrl: '/insurance-hub',
  payerPhoneNumber: '555-0100',
  showPhoneNumberAsAction: true,
  showPhoneNumberAsTextOnly: false,
  showInsuranceSummaryMessage: false,
  deductible: {
    type: 'Deductible',
    network: 'In Network',
    name: 'In-network deductible',
    accountBucket: BLANK_BUCKET,
    patientBucket: PATIENT_DEDUCTIBLE,
  },
  moop: {
    type: 'MOOP',
    network: 'In Network',
    name: 'In-network out-of-pocket maximum',
    accountBucket: BLANK_BUCKET,
    patientBucket: { ...PATIENT_DEDUCTIBLE, totalAmount: '$6,000.00', remainingAmount: '$4,760.00', usedRatio: 0.2067 },
  },
  insuranceLimit: {
    type: 'Limit',
    network: 'In Network',
    name: 'In-network benefit limit',
    accountBucket: BLANK_BUCKET,
    patientBucket: BLANK_BUCKET,
  },
}

type Answer = { body: string; status?: number }

/**
 * The summary page, then per account a token page and whatever
 * `GetBenefitsSummary` answers with. `benefitsFor` is keyed by the posted
 * `guarantorId`, so a scraper that sent the wrong id gets the wrong card here
 * exactly as it would on a real instance.
 */
function mockRequest(
  accounts: Array<{ guarantor: string; name: string; id: string; context: string }>,
  benefitsFor: Record<string, Answer>,
) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.transport = mock(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    if (/\/Billing\/Summary$/i.test(path)) return new Response(summaryPage(accounts), { status: 200 })
    if (/\/Billing\/Details$/i.test(path)) return new Response(TOKEN_PAGE, { status: 200 })
    const posted = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as { guarantorId?: string }
    const answer = benefitsFor[posted.guarantorId ?? ''] ?? { body: '{}', status: 500 }
    return new Response(answer.body, {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return req
}

describe('fetchInsuranceBenefitsRaw', () => {
  it('posts the guarantor account id and context under MyChart\'s own names', async () => {
    const req = mockRequest(ONE_ACCOUNT, { 'ACCT-1': { body: JSON.stringify(BENEFITS) } })
    const raw = await fetchInsuranceBenefitsRaw(req)

    const post = raw.requests.find((r) => r.method === 'POST')!
    expect(post.path).toBe(GET_BENEFITS_SUMMARY_PATH)
    expect(post.requestBody).toEqual({ guarantorId: 'ACCT-1', billingSystem: 'CTX-1' })
  })

  it('sends the antiforgery token as a header with a JSON body, not a form field', async () => {
    const req = mockRequest(ONE_ACCOUNT, { 'ACCT-1': { body: JSON.stringify(BENEFITS) } })
    const calls: RequestInit[] = []
    const inner = req.transport!
    req.transport = mock(async (url: string, init: RequestInit) => {
      if (new URL(url).pathname.endsWith('GetBenefitsSummary')) calls.push(init)
      return inner(url, init)
    })
    await fetchInsuranceBenefitsRaw(req)

    const headers = calls[0]!.headers as Record<string, string>
    expect(headers.__RequestVerificationToken).toBe('t')
    expect(headers['Content-Type']).toContain('application/json')
  })

  it('asks once per guarantor account', async () => {
    const accounts = [
      ...ONE_ACCOUNT,
      { guarantor: '743', name: 'Alice Smith', id: 'ACCT-2', context: 'CTX-2' },
    ]
    const raw = await fetchInsuranceBenefitsRaw(
      mockRequest(accounts, {
        'ACCT-1': { body: JSON.stringify(BENEFITS) },
        'ACCT-2': { body: JSON.stringify({ ...BENEFITS, noCoverageAvailable: true }) },
      }),
    )
    expect(raw.requests.filter((r) => r.method === 'POST')).toHaveLength(2)
  })

  it('throws when the only account fails, rather than reporting no accumulators', async () => {
    const req = mockRequest(ONE_ACCOUNT, { 'ACCT-1': { body: 'nope', status: 500 } })
    await expect(getInsuranceBenefits(req)).rejects.toThrow(/HTTP 500/)
  })

  it('keeps the account that answered when the other one fails', async () => {
    const accounts = [
      ...ONE_ACCOUNT,
      { guarantor: '743', name: 'Alice Smith', id: 'ACCT-2', context: 'CTX-2' },
    ]
    const standard = await getInsuranceBenefits(
      mockRequest(accounts, {
        'ACCT-1': { body: JSON.stringify(BENEFITS) },
        'ACCT-2': { body: 'nope', status: 500 },
      }),
    )
    expect(standard.accounts.map((a) => a.guarantorNumber)).toEqual(['742'])
    expect(standard.unavailable).toEqual(['743'])
    // An unread account is not evidence of no benefits.
    expect(standard.hasNoBenefits).toBe(false)
  })
})

describe('insuranceBenefitsProcessor', () => {
  async function standardFor(benefits: unknown) {
    return getInsuranceBenefits(mockRequest(ONE_ACCOUNT, { 'ACCT-1': { body: JSON.stringify(benefits) } }))
  }

  it('names the guarantor account, which the response itself does not', async () => {
    const standard = await standardFor(BENEFITS)
    expect(standard.accounts[0]!.guarantorNumber).toBe('742')
    expect(standard.accounts[0]!.patientName).toBe('Alice Smith')
  })

  it('keeps both buckets, including the blank one', async () => {
    const standard = await standardFor(BENEFITS)
    const deductible = standard.accounts[0]!.deductible!
    expect(deductible.patientBucket.remainingAmount).toBe('$760.00')
    // Rule 6: the blank side is emitted, not dropped for being empty.
    expect(deductible.accountBucket.remainingAmount).toBe('')
    expect(deductible.accountBucket.rollPeriod).toBe('0')
  })

  it('parses the amounts into derived Number fields without touching the formatted ones', async () => {
    const standard = await standardFor(BENEFITS)
    const patient = standard.accounts[0]!.deductible!.patientBucket
    expect(patient.totalAmountNumber).toBe(2000)
    expect(patient.usedAmountNumber).toBe(1240)
    expect(patient.remainingAmountNumber).toBe(760)
    expect(patient.totalAmount).toBe('$2,000.00')
    // Nothing to parse on the blank side; null, not 0.
    expect(standard.accounts[0]!.deductible!.accountBucket.totalAmountNumber).toBeNull()
  })

  it('reports hasNoBenefits from MyChart\'s own field', async () => {
    expect((await standardFor(BENEFITS)).hasNoBenefits).toBe(false)
    const none = await standardFor({ ...BENEFITS, noCoverageAvailable: true })
    expect(none.hasNoBenefits).toBe(true)
    expect(none.unavailable).toEqual([])
  })

  it('emits an accumulator MyChart omitted as null rather than inventing one', async () => {
    const partial = { ...BENEFITS, insuranceLimit: null }
    const standard = await standardFor(partial)
    expect(standard.accounts[0]!.insuranceLimit).toBeNull()
    expect(standard.accounts[0]!.moop).not.toBeNull()
  })

  it('drops the payer logo and the show-this-control flags from the non-raw modes', async () => {
    const standard = await standardFor(BENEFITS)
    const account = standard.accounts[0]! as unknown as Record<string, unknown>
    for (const dropped of [
      'payerLogoBlobMagicId',
      'showPhoneNumberAsAction',
      'showPhoneNumberAsTextOnly',
      'showInsuranceSummaryMessage',
    ]) {
      expect(account[dropped]).toBeUndefined()
    }
  })

  it('keeps both buckets and the reset date in concise', async () => {
    const standard = await standardFor(BENEFITS)
    const concise = insuranceBenefitsProcessor.concise(standard) as {
      accounts: Array<{ deductible: { accountBucket: unknown; patientBucket: { remainingAmount: string; rollPeriodEndDate: string } } }>
    }
    const deductible = concise.accounts[0]!.deductible
    expect(deductible.patientBucket.remainingAmount).toBe('$760.00')
    expect(deductible.patientBucket.rollPeriodEndDate).toBe('12/31/2026')
    expect(deductible.accountBucket).toBeDefined()
  })

  it('renders the deductible in every mode', async () => {
    const req = mockRequest(ONE_ACCOUNT, { 'ACCT-1': { body: JSON.stringify(BENEFITS) } })
    const raw = await fetchInsuranceBenefitsRaw(req)
    for (const mode of ['raw', 'standard', 'concise', 'json'] as const) {
      const out = renderOutput(insuranceBenefitsProcessor, raw, mode)
      expect(JSON.stringify(out)).toContain('760')
    }
  })
})
