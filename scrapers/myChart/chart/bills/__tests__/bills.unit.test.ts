import { describe, it, expect } from 'bun:test'
import { parsePaymentUrl, parseBillingAccountsHtml, parseAmount, billingProcessor, mergeVisitLists, VISIT_LIST_CATEGORIES } from '../bills'
import type { RawResponse } from '../../../core/rawResponse'
import { renderOutput } from '../../../processors/processor'
import { date2dte } from '../utils'

describe('date2dte', () => {
  it('converts Unix epoch (Jan 1, 1970) to DTE value of 47117', () => {
    // The DTE epoch is Dec 31, 1840, so Jan 1, 1970 should be 47117 days after that
    const epoch = new Date(1970, 0, 1)
    expect(date2dte(epoch)).toBe(47117)
  })

  it('converts a known date correctly', () => {
    // Jan 2, 1970 should be 47118
    const jan2 = new Date(1970, 0, 2)
    expect(date2dte(jan2)).toBe(47118)
  })

  it('handles dates in the 2020s', () => {
    // Jan 1, 2024 = 47117 + days from 1970 to 2024
    const jan1_2024 = new Date(2024, 0, 1)
    const result = date2dte(jan1_2024)
    // 54 years, accounting for leap years
    // From 1970 to 2024: 19723 days
    expect(result).toBe(47117 + 19723)
  })

  it('handles dates before 1970', () => {
    // Dec 31, 1969 should be 47116
    const dec31_1969 = new Date(1969, 11, 31)
    expect(date2dte(dec31_1969)).toBe(47116)
  })

  it('returns an integer for any date', () => {
    const date = new Date(2023, 5, 15)
    const result = date2dte(date)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('consecutive days have consecutive DTE values', () => {
    const day1 = new Date(2023, 0, 1)
    const day2 = new Date(2023, 0, 2)
    const day3 = new Date(2023, 0, 3)
    expect(date2dte(day2) - date2dte(day1)).toBe(1)
    expect(date2dte(day3) - date2dte(day2)).toBe(1)
  })

  it('handles leap year date', () => {
    const feb29 = new Date(2024, 1, 29)
    const mar1 = new Date(2024, 2, 1)
    expect(date2dte(mar1) - date2dte(feb29)).toBe(1)
  })

  it('puts day 0 on the DTE base date (Dec 31, 1840)', () => {
    expect(date2dte(new Date(1840, 11, 31))).toBe(0)
    expect(date2dte(new Date(1841, 0, 1))).toBe(1)
  })

  it('handles Y2K', () => {
    // 10957 days from Jan 1, 1970 to Jan 1, 2000
    expect(date2dte(new Date(2000, 0, 1))).toBe(47117 + 10957)
  })

  it('handles a far future date', () => {
    const result = date2dte(new Date(2100, 0, 1))
    expect(result).toBeGreaterThan(47117)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('skips Feb 29 in a non-leap year', () => {
    const feb28 = new Date(2023, 1, 28)
    const mar1 = new Date(2023, 2, 1)
    expect(date2dte(mar1) - date2dte(feb28)).toBe(1)
  })

  it('counts 365 days in a non-leap year and 366 in a leap year', () => {
    expect(date2dte(new Date(2024, 0, 1)) - date2dte(new Date(2023, 0, 1))).toBe(365)
    expect(date2dte(new Date(2025, 0, 1)) - date2dte(new Date(2024, 0, 1))).toBe(366)
  })

  it('is deterministic for the same date', () => {
    // The function builds a UTC date internally, so local time must not matter
    const date = new Date(2023, 6, 4)
    expect(date2dte(date)).toBe(date2dte(date))
  })
})

describe('parsePaymentUrl', () => {
  it('extracts ID and Context from URLMakePayment JSON', () => {
    const html = `
      <script>
        var config = {"URLMakePayment": "~/Billing/Payment?ID=12345\\u0026Context=ABC_XYZ"};
      </script>
    `
    expect(parsePaymentUrl(html)).toEqual({ id: '12345', context: 'ABC_XYZ' })
  })

  it('handles URL with multiple query parameters', () => {
    const html = `{"URLMakePayment": "~/Billing/Payment?ID=999\\u0026Context=CTX_123\\u0026Other=foo"}`
    expect(parsePaymentUrl(html)).toEqual({ id: '999', context: 'CTX_123' })
  })

  it('returns null when URLMakePayment is not present', () => {
    const html = `<html><body>No payment URL here</body></html>`
    expect(parsePaymentUrl(html)).toBeNull()
  })

  it('returns null when URL has no query string', () => {
    const html = `{"URLMakePayment": "~/Billing/Payment"}`
    expect(parsePaymentUrl(html)).toBeNull()
  })

  it('returns null when ID is missing from URL', () => {
    const html = `{"URLMakePayment": "~/Billing/Payment?Context=ABC"}`
    expect(parsePaymentUrl(html)).toBeNull()
  })

  it('returns null when Context is missing from URL', () => {
    const html = `{"URLMakePayment": "~/Billing/Payment?ID=123"}`
    expect(parsePaymentUrl(html)).toBeNull()
  })

  it('handles URL without ~/ prefix', () => {
    const html = `{"URLMakePayment": "Billing/Payment?ID=456\\u0026Context=DEF"}`
    expect(parsePaymentUrl(html)).toEqual({ id: '456', context: 'DEF' })
  })

  it('handles spaces around the colon in JSON', () => {
    const html = `{"URLMakePayment":   "~/Pay?ID=789\\u0026Context=GHI"}`
    expect(parsePaymentUrl(html)).toEqual({ id: '789', context: 'GHI' })
  })

  it('returns null for empty string', () => {
    expect(parsePaymentUrl('')).toBeNull()
  })

  it('handles realistic embedded JSON in HTML page', () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <body>
        <div id="billing-app"></div>
        <script type="text/javascript">
          window.__INITIAL_STATE__ = {
            "URLMakePayment": "~/Billing/MakePayment?ID=GA_100200\\u0026Context=EPIC_CONTEXT_1234",
            "URLPaymentHistory": "~/Billing/History"
          };
        </script>
      </body>
      </html>
    `
    expect(parsePaymentUrl(html)).toEqual({
      id: 'GA_100200',
      context: 'EPIC_CONTEXT_1234',
    })
  })
})

describe('parseBillingAccountsHtml', () => {
  const hostname = 'mychart.example.com'

  it('parses a single billing account card', () => {
    const html = `
      <html>
      <body>
        <div class="ba_card">
          <p class="ba_card_header_account_idAndType">Guarantor #12345 (John Smith)</p>
          <p class="ba_card_status_due_amount">$150.00</p>
          <p class="ba_card_status_recentPaymentLabel">
            <a href="https://mychart.example.com/Billing/Detail?ID=ABC&Context=CTX1">View</a>
          </p>
        </div>
        <script>{"URLMakePayment": "~/Billing/Payment?ID=fallback\\u0026Context=fallback_ctx"}</script>
      </body>
      </html>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toEqual({
      guarantorNumber: '12345',
      patientName: 'John Smith',
      amountDue: 150.00,
      id: 'ABC',
      context: 'CTX1',
    })
  })

  it('parses multiple billing account cards', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #111 (Alice)</p>
        <p class="ba_card_status_due_amount">$50.00</p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="https://mychart.example.com/Billing/Detail?ID=A1&Context=C1">View</a>
        </p>
      </div>
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #222 (Bob)</p>
        <p class="ba_card_status_due_amount">$200.50</p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="https://mychart.example.com/Billing/Detail?ID=B2&Context=C2">View</a>
        </p>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts).toHaveLength(2)
    expect(accounts[0]!.guarantorNumber).toBe('111')
    expect(accounts[0]!.patientName).toBe('Alice')
    expect(accounts[0]!.amountDue).toBe(50.00)
    expect(accounts[1]!.guarantorNumber).toBe('222')
    expect(accounts[1]!.patientName).toBe('Bob')
    expect(accounts[1]!.amountDue).toBe(200.50)
  })

  it('falls back to parsePaymentUrl when link has no ID/Context', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #999 (Fallback User)</p>
        <p class="ba_card_status_due_amount">$75.00</p>
        <p class="ba_card_status_recentPaymentLabel"></p>
      </div>
      <script>{"URLMakePayment": "~/Billing/Pay?ID=FB_ID\\u0026Context=FB_CTX"}</script>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.id).toBe('FB_ID')
    expect(accounts[0]!.context).toBe('FB_CTX')
  })

  it('skips accounts with no ID or Context from any source', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #000 (No Link User)</p>
        <p class="ba_card_status_due_amount">$25.00</p>
        <p class="ba_card_status_recentPaymentLabel"></p>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts).toHaveLength(0)
  })

  it('returns empty array when no billing cards exist', () => {
    const html = `<html><body><p>No billing accounts found.</p></body></html>`
    expect(parseBillingAccountsHtml(html, hostname)).toEqual([])
  })

  it('returns empty array for empty HTML', () => {
    expect(parseBillingAccountsHtml('', hostname)).toEqual([])
  })

  it('parses amount with no dollar sign gracefully', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #555 (Test)</p>
        <p class="ba_card_status_due_amount">99.99</p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="https://mychart.example.com/Billing/Detail?ID=T1&Context=TC">View</a>
        </p>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts[0]!.amountDue).toBe(99.99)
  })

  it('handles zero amount due', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #777 (Zero User)</p>
        <p class="ba_card_status_due_amount">$0.00</p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="https://mychart.example.com/Billing/Detail?ID=Z1&Context=ZC">View</a>
        </p>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts[0]!.amountDue).toBe(0)
  })

  it('sets unknown for missing guarantor number', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Account (Test Patient)</p>
        <p class="ba_card_status_due_amount">$10.00</p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="https://mychart.example.com/Billing/Detail?ID=X1&Context=XC">View</a>
        </p>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts[0]!.guarantorNumber).toBe('unknown')
    expect(accounts[0]!.patientName).toBe('Test Patient')
  })

  it('sets unknown for missing patient name', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #123</p>
        <p class="ba_card_status_due_amount">$10.00</p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="https://mychart.example.com/Billing/Detail?ID=X1&Context=XC">View</a>
        </p>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts[0]!.guarantorNumber).toBe('123')
    expect(accounts[0]!.patientName).toBe('unknown')
  })

  it('extracts ID/Context from Billing/Details link when recentPaymentLabel is missing', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #102424656 (Ryan Hughes)</p>
        <p class="ba_card_status_due_amount">$0.00</p>
        <a href="https://mychart.example.com/Billing/Details?ID=WP-ABC123&Context=WP-DEF456">
          View Account Details, Patient Payments, Billing Documents
        </a>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts).toHaveLength(1)
    expect(accounts[0]!.guarantorNumber).toBe('102424656')
    expect(accounts[0]!.patientName).toBe('Ryan Hughes')
    expect(accounts[0]!.id).toBe('WP-ABC123')
    expect(accounts[0]!.context).toBe('WP-DEF456')
  })

  it('handles amountDue as undefined when element is empty', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #888 (No Amount)</p>
        <p class="ba_card_status_due_amount"></p>
        <p class="ba_card_status_recentPaymentLabel">
          <a href="https://mychart.example.com/Billing/Detail?ID=NA&Context=NC">View</a>
        </p>
      </div>
    `
    const accounts = parseBillingAccountsHtml(html, hostname)
    expect(accounts[0]!.amountDue).toBeUndefined()
  })
})

describe('parseAmount', () => {
  it('reads a thousands separator instead of stopping at it', () => {
    // parseFloat('1,234.56') is 1 — a four-figure balance read as a dollar.
    expect(parseAmount('$1,234.56')).toBe(1234.56)
    expect(parseAmount('$0.00')).toBe(0)
    expect(parseAmount('-$12.00')).toBe(-12)
    expect(parseAmount('')).toBeUndefined()
    expect(parseAmount('n/a')).toBeUndefined()
  })

  it('parseBillingAccountsHtml uses it for the card balance', () => {
    const html = `
      <div class="ba_card">
        <p class="ba_card_header_account_idAndType">Guarantor #1 (Big Bill)</p>
        <p class="ba_card_status_due_amount">$12,345.67</p>
        <a href="/Billing/Details?ID=X&Context=Y">Details</a>
      </div>
    `
    expect(parseBillingAccountsHtml(html)[0]!.amountDue).toBe(12345.67)
  })
})

function get(path: string, body: unknown, status = 200): RawResponse['requests'][number] {
  return { path, method: 'GET', status, contentType: 'application/json', body }
}

const SUMMARY = `
  <div class="ba_card">
    <p class="ba_card_header_account_idAndType">Guarantor #100 (Homer Simpson)</p>
    <p class="ba_card_status_due_amount">$350.00</p>
    <p class="ba_card_status_recentPaymentLabel"><a href="/Billing/Details?ID=A1&Context=C1&tab=3">Last paid</a></p>
  </div>
  <div class="ba_card">
    <p class="ba_card_header_account_idAndType">Guarantor #200 (Marge Simpson)</p>
    <p class="ba_card_status_due_amount">$0.10</p>
    <p class="ba_card_status_recentPaymentLabel"><a href="/Billing/Details?ID=A2&Context=C2">Last paid</a></p>
  </div>
`

const PAYMENT = {
  ID: 'P1', ElementID: 'past_P1', Index: '0', DayOfMonth: 20, Month: 1, Year: 2026,
  FormattedDateDisplay: 'Jan 20, 2026', Description: 'MyChart Payment', SubText: 'Visa x4242',
  HtmlSubText: '<img alt="Visa"> x4242', PaymentAmountDisplay: '$350.00', UndistributedAmountDisplay: null,
  CoverageInfo: null,
  Receipt: { SerialNumber: 'SN-1', FileName: 'r.pdf', BlobToken: 'blob', IsValidReceipt: true, DisplayNumber: 'R-001', PrintStatus: 0, ReceiptStatus: null, ViewReceiptOptions: { AriaLabel: 'x' }, MobileDocViewerSupported: false, Url: null },
  IsBadDebtAdj: false, CanEdit: false, EditPaymentOptions: null, CanCancel: false, IsCardExpiringSoon: false,
}

const CHARGE = {
  GroupType: 0, Index: 0, BillingSystem: 3, IsSBO: false, BillingSystemDisplay: '', AdjustmentsOnly: false,
  DateRangeDisplay: null, StartDate: 67580, StartDayOfMonth: 20, StartMonth: 11, StartYear: 2025,
  StartDateDisplay: '11/20/2025', StartDateAccessibleText: 'November 20, 2025',
  Description: 'ER Visit', Patient: 'Homer Simpson', Provider: 'Nick Riviera, MD', ProviderId: 'PROV-1',
  HospitalAccountDisplay: 'HAR-1', HospitalAccountId: 'HAR-1', SuppressDayFromDate: false, CanAddToPaymentPlan: false,
  PrimaryPayer: 'Springfield Health', IsLTCSeries: false, ChargeAmount: '$1,200.00', SurchargeAmount: null, TaxOrSurcharge: 0,
  InsuranceAmountDue: '$0.00', InsuranceAmountDueRaw: 0, SelfAmountDue: '$350.00', SelfAmountDueRaw: 350,
  IsPatientNotResponsible: false, PatientNotResponsibleYet: false, InsurancePaymentAmount: '$850.00',
  InsuranceEstimatedPaymentAmount: null, SelfPaymentAmount: '$0.00', SelfAdjustmentAmount: null, SelfDiscountAmount: null,
  ContestedChargeAmount: null, ContestedPaymentAmount: null, ShowInsurancePendingHelp: false, ShowInsuranceCoveredHelp: false,
  SelfPaymentPlanAmountDue: null, SelfPaymentPlanAmountDueRaw: 0, IsExpanded: false, BlockExpanding: false,
  ProcedureList: [{ BillingSystem: 3, Description: 'ER Level 3', Amount: '$1,200.00', PaymentList: null, InsuranceAmountDue: null, SelfAmountDue: '$350.00', HasAmountDue: true, SelfBadDebtAmount: null, HasBadDebtAmount: false, AdjustmentsOnly: false, IsContested: false }],
  ProcedureGroupList: [{ VisitIndex: 0, VisitGroupType: 0, Description: 'Payments', Amount: '$0.00', ProcedureList: null, PaymentList: [PAYMENT], EstPlanPaymentList: [], HasEstPlanList: false, IsExpanded: false }],
  CoverageInfoList: [{ CoverageName: 'Springfield Health', Billed: '$1,200.00', Covered: '$850.00', PendingInsurance: null, RemainingResponsibility: '$350.00', Copay: '$50.00', Deductible: null, Coinsurance: null, NotCovered: null, Benefits: [{ Name: 'Copay', Amount: '$50.00' }], ShowInsuranceCoveredHelp: false }],
  ShowCoverageHelp: true, VisitAutoPay: null, ShowVisitAutoPay: false, LevelOfDetailLoaded: 0,
  SelfBadDebtAmount: null, SelfBadDebtAmountRaw: 0, IsClosedHospitalAccount: false, IsBadDebtVisit: false, IsContestedHAR: false,
  IsPaymentPlanEstimate: false, NotOnPlanAmount: null, NotOnPlanAmountRaw: 0, EmptyVisitEstimateID: null,
  EstimateInfo: { EstimateID: 'EST-1', EstimateAmount: '$300.00', EstimateStatus: 2 },
  PatFriendlyAccountStatus: 1, VisitBadDebtScenario: 0, IsUnpayableHAR: false, PatFriendlyAccountStatusAccessibleText: 'Balance due',
  VisitStatusesEqualToClosed: [0], IsOnPaymentPlan: false, IsNotOnPaymentPlan: true,
  AgencyInformation: { Name: '', PhoneNumber: '', AgencyID: 0 }, AgencyInformationDescription: null,
}

const VISITS_A1 = {
  Success: true,
  Data: {
    UnifiedVisitList: [CHARGE, { ...CHARGE, Description: 'Old debt', HospitalAccountId: 'HAR-2', SelfAmountDueRaw: 20 }],
    BadDebtVisitList: [{ ...CHARGE, Description: 'Old debt', HospitalAccountId: 'HAR-2', SelfAmountDueRaw: 20, IsBadDebtHAR: true }],
    NotPaymentPlanVisitList: [CHARGE],
    VisitListAmount: '$350.00', BadDebtVisitListAmount: '$20.00', PaymentPlanVisitListAmount: '',
    PaymentPlanVisitListAutoPayAmount: null, PaymentPlanVisitListScheduledDate: null, EstimatedPaymentPlanBalance: null,
    HasVisits: true, ShowingAll: true, HasUnconvertedPBVisits: false, CanMakePayment: true, CanEditPaymentPlan: false,
    URLMakePayment: '~/Billing/Payment?ID=A1', Filters: { FilterClass: 'x', Options: [] },
    PartialPaymentPlanAlert: { Code: 1, Banner: { HeaderText: 'Plan', DetailText: 'Partially paid', ButtonLabel: 'Pay' } },
    BillingSystem: 3, UndistributedPayments: [{ anything: true }], ShouldShowADACopyright: false,
    SharedAgencyInformation: { Name: 'Collections Inc', PhoneNumber: '555-0199', AgencyID: 7 },
  },
}

const STATEMENTS_A1 = {
  Success: true,
  DataStatement: { StatementList: [{ Show: true, DateDisplay: '20260115', FormattedDateDisplay: 'Jan 15, 2026', Description: 'Sent via postal mail', SubText: '', IsRead: false, ImagePath: 'IMG', Token: 'TOK', IsPaperless: false, StatementAmountDisplay: '$350.00', IsDetailBill: false, EncBillingSystem: 'ENC', RecordID: 'REC-1', ServiceDateStart: null, ServiceDateEnd: null }], HasUnread: true },
  DataDetailBill: { StatementList: [{ DateDisplay: '20251201', FormattedDateDisplay: 'Dec 1, 2025', Description: 'Itemized bill', IsRead: true, StatementAmountDisplay: '$1,200.00', IsDetailBill: true, RecordID: 'REC-2', ServiceDateStart: 67580, ServiceDateEnd: 67580 }] },
}

const RAW: RawResponse = {
  requests: [
    { path: '/Billing/Summary', method: 'GET', status: 200, contentType: 'text/html', body: SUMMARY },
    get('/Billing/Details/GetVisits?id=A1&context=C1&filterOption=1&cid=', VISITS_A1),
    get('/Billing/Details/GetStatementList?id=A1&context=C1&cid=', STATEMENTS_A1),
    get('/Billing/Details/LoadPaymentList?id=A1&context=C1&cid=', { Success: true, Data: { PaymentList: [PAYMENT, { ...PAYMENT, ID: 'P2', Receipt: null, PaymentAmountDisplay: '$150.00' }], Filters: null } }),
    { path: '/Billing/Details?ID=A1&Context=C1', method: 'GET', status: 200, contentType: 'text/html', body: '{"EncID":"ENC-1"}' },
    get('/Billing/Details/GetVisits?id=A2&context=C2&filterOption=1&cid=', 'Server Error', 500),
    get('/Billing/Details/GetStatementList?id=A2&context=C2&cid=', { DataStatement: { StatementList: [] }, DataDetailBill: { StatementList: [] } }),
  ],
}

describe('billingProcessor.standard', () => {
  const standard = billingProcessor.standard(RAW)

  it('builds one account per summary card, joined to its own requests by id and context', () => {
    expect(standard.totalDue).toBe(350.1)
    expect(standard.accounts.map((a) => [a.guarantorNumber, a.patientName, a.amountDueNumber])).toEqual([
      ['100', 'Homer Simpson', 350],
      ['200', 'Marge Simpson', 0.1],
    ])
    const [homer, marge] = standard.accounts
    expect(homer).toMatchObject({
      VisitListAmount: '$350.00',
      BadDebtVisitListAmount: '$20.00',
      PaymentPlanVisitListAmount: '',
      PaymentPlanVisitListAutoPayAmount: null,
      CanMakePayment: true,
      URLMakePayment: '~/Billing/Payment?ID=A1',
      HasUnconvertedPBVisits: false,
      HasVisits: true,
      PartialPaymentPlanAlert: { Code: 1, Banner: { HeaderText: 'Plan', DetailText: 'Partially paid' } },
      UndistributedPayments: [{ anything: true }],
      SharedAgencyInformation: { Name: 'Collections Inc', PhoneNumber: '555-0199' },
    })
    // The account whose GetVisits failed is still reported — with nothing under it.
    expect(marge).toMatchObject({ visits: [], statements: [], payments: [], HasVisits: null, VisitListAmount: null })
    const json = JSON.stringify(standard)
    for (const internal of ['ENC-1', 'ButtonLabel', 'AgencyID', 'EstimateID', 'HtmlSubText', 'BlobToken', 'Token"', 'ImagePath', 'ShowCoverageHelp', 'StartDayOfMonth']) {
      expect(json).not.toContain(internal)
    }
  })

  it('merges the visit lists most-specific-first and de-duplicates across them', () => {
    const visits = standard.accounts[0]!.visits
    expect(visits.map((v) => [v.Description, v.category])).toEqual([
      ['Old debt', 'BadDebtVisitList'],
      ['ER Visit', 'UnifiedVisitList'],
    ])
    expect(visits[0]!.IsBadDebtHAR).toBe(true)
    expect(VISIT_LIST_CATEGORIES[VISIT_LIST_CATEGORIES.length - 1]).toBe('UnifiedVisitList')
    expect(mergeVisitLists({})).toEqual([])
  })

  it('keeps every listed charge field under its MyChart name', () => {
    const v = standard.accounts[0]!.visits[1]!
    expect(v).toEqual({
      category: 'UnifiedVisitList',
      StartDateDisplay: '11/20/2025',
      DateRangeDisplay: null,
      Description: 'ER Visit',
      Patient: 'Homer Simpson',
      Provider: 'Nick Riviera, MD',
      HospitalAccountDisplay: 'HAR-1',
      HospitalAccountId: 'HAR-1',
      PrimaryPayer: 'Springfield Health',
      ChargeAmount: '$1,200.00',
      InsurancePaymentAmount: '$850.00',
      InsuranceAmountDue: '$0.00',
      InsuranceEstimatedPaymentAmount: null,
      InsuranceAmountDueRaw: 0,
      SelfPaymentAmount: '$0.00',
      SelfAmountDue: '$350.00',
      SelfAmountDueRaw: 350,
      SelfAdjustmentAmount: null,
      SelfDiscountAmount: null,
      SelfBadDebtAmount: null,
      SelfBadDebtAmountRaw: 0,
      SelfPaymentPlanAmountDue: null,
      SelfPaymentPlanAmountDueRaw: 0,
      NotOnPlanAmount: null,
      NotOnPlanAmountRaw: 0,
      ContestedChargeAmount: null,
      ContestedPaymentAmount: null,
      SurchargeAmount: null,
      TaxOrSurcharge: 0,
      IsPatientNotResponsible: false,
      PatientNotResponsibleYet: false,
      IsOnPaymentPlan: false,
      IsNotOnPaymentPlan: true,
      IsBadDebtHAR: null,
      IsBadDebtVisit: false,
      IsContestedHAR: false,
      IsClosedHospitalAccount: false,
      AdjustmentsOnly: false,
      PatFriendlyAccountStatusAccessibleText: 'Balance due',
      EstimateInfo: { EstimateAmount: '$300.00', EstimateStatus: 2 },
      AgencyInformation: { Name: '', PhoneNumber: '' },
      AgencyInformationDescription: null,
      ProcedureList: [{ Description: 'ER Level 3', Amount: '$1,200.00', SelfAmountDue: '$350.00', InsuranceAmountDue: null, IsContested: false, HasAmountDue: true, PaymentList: [], SelfBadDebtAmount: null, HasBadDebtAmount: false, AdjustmentsOnly: false, BillingSystem: 3 }],
      ProcedureGroupList: [{
        Description: 'Payments', Amount: '$0.00', ProcedureList: [],
        PaymentList: [{ FormattedDateDisplay: 'Jan 20, 2026', Description: 'MyChart Payment', SubText: 'Visa x4242', PaymentAmountDisplay: '$350.00', UndistributedAmountDisplay: null, Receipt: { DisplayNumber: 'R-001', SerialNumber: 'SN-1' } }],
        EstPlanPaymentList: [],
      }],
      CoverageInfoList: [{ CoverageName: 'Springfield Health', Billed: '$1,200.00', Covered: '$850.00', PendingInsurance: null, RemainingResponsibility: '$350.00', Copay: '$50.00', Deductible: null, Coinsurance: null, NotCovered: null, Benefits: [{ Name: 'Copay', Amount: '$50.00' }] }],
    })
  })

  it('merges the two statement lists and projects the payments', () => {
    const account = standard.accounts[0]!
    expect(account.statements).toEqual([
      { FormattedDateDisplay: 'Jan 15, 2026', DateDisplay: '20260115', Description: 'Sent via postal mail', SubText: '', StatementAmountDisplay: '$350.00', IsRead: false, IsDetailBill: false, IsPaperless: false, ServiceDateStart: null, ServiceDateEnd: null, RecordID: 'REC-1' },
      { FormattedDateDisplay: 'Dec 1, 2025', DateDisplay: '20251201', Description: 'Itemized bill', SubText: null, StatementAmountDisplay: '$1,200.00', IsRead: true, IsDetailBill: true, IsPaperless: null, ServiceDateStart: 67580, ServiceDateEnd: 67580, RecordID: 'REC-2' },
    ])
    expect(account.payments.map((p) => [p.PaymentAmountDisplay, p.Receipt])).toEqual([
      ['$350.00', { DisplayNumber: 'R-001', SerialNumber: 'SN-1' }],
      ['$150.00', null],
    ])
  })

  it('reads an empty envelope as nothing owed and no accounts', () => {
    expect(billingProcessor.standard({ requests: [] })).toEqual({ totalDue: 0, accounts: [] })
  })
})

describe('billingProcessor.concise', () => {
  it('keeps the balances, the charge headlines, the statements and the payments', () => {
    const concise = billingProcessor.concise(billingProcessor.standard(RAW)) as { totalDue: number; accounts: Array<Record<string, unknown>> }
    expect(concise.totalDue).toBe(350.1)
    expect(concise.accounts[0]).toEqual({
      guarantorNumber: '100',
      patientName: 'Homer Simpson',
      amountDueNumber: 350,
      visits: [
        { StartDateDisplay: '11/20/2025', DateRangeDisplay: null, Description: 'Old debt', Patient: 'Homer Simpson', Provider: 'Nick Riviera, MD', PrimaryPayer: 'Springfield Health', ChargeAmount: '$1,200.00', InsurancePaymentAmount: '$850.00', InsuranceAmountDue: '$0.00', SelfPaymentAmount: '$0.00', SelfAmountDue: '$350.00', category: 'BadDebtVisitList' },
        { StartDateDisplay: '11/20/2025', DateRangeDisplay: null, Description: 'ER Visit', Patient: 'Homer Simpson', Provider: 'Nick Riviera, MD', PrimaryPayer: 'Springfield Health', ChargeAmount: '$1,200.00', InsurancePaymentAmount: '$850.00', InsuranceAmountDue: '$0.00', SelfPaymentAmount: '$0.00', SelfAmountDue: '$350.00', category: 'UnifiedVisitList' },
      ],
      statements: [
        { FormattedDateDisplay: 'Jan 15, 2026', Description: 'Sent via postal mail', StatementAmountDisplay: '$350.00', IsRead: false },
        { FormattedDateDisplay: 'Dec 1, 2025', Description: 'Itemized bill', StatementAmountDisplay: '$1,200.00', IsRead: true },
      ],
      payments: [
        { FormattedDateDisplay: 'Jan 20, 2026', Description: 'MyChart Payment', PaymentAmountDisplay: '$350.00' },
        { FormattedDateDisplay: 'Jan 20, 2026', Description: 'MyChart Payment', PaymentAmountDisplay: '$150.00' },
      ],
    })
    expect(JSON.stringify(concise)).not.toContain('ProcedureList')
  })

  it('renders through every mode', () => {
    expect(renderOutput(billingProcessor, RAW, 'raw')).toBe(RAW)
    expect(renderOutput(billingProcessor, RAW, 'standard')).toContain('- **totalDue**: 350.1')
    const concise = renderOutput(billingProcessor, RAW, 'concise') as string
    expect(concise).toContain('| ER Visit |')
    expect(concise).not.toContain('CoverageInfoList')
  })
})
