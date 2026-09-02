/**
 * The MCPB's condensing layer.
 *
 * These fixtures are cut down from real fake-mychart responses (`bun run
 * fake-mychart`, which is held to skeletons generated from live captures), so
 * the field names and the nesting are the ones a real instance sends — just
 * with one or two rows instead of forty.
 *
 * What is asserted throughout is that the *clinical* content survives and the
 * view-model scaffolding does not. A condenser that quietly dropped a lab
 * value would still shrink the payload, and every size assertion here would
 * still pass, so every one of them is paired with a content assertion.
 */
import { describe, it, expect } from 'bun:test'
import { condenseForModel, prune, CONDENSERS } from '../condense'

const condense = (id: string, raw: unknown) => condenseForModel(id, raw).data as Record<string, unknown>

// A `Visit` row with only the fields the condenser reads. The real one carries
// ~120; the rest are the button-state booleans this layer exists to remove.
function visit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Csn: 'CSN-1',
    PrimaryDate: '01/10/2026 09:00:00 AM',
    Instant: '/Date(1768050000000)/',
    Date: '',
    Time: '',
    VisitTypeName: 'Annual Physical',
    ChiefComplaint: '',
    IsPastVisit: false,
    IsCanceled: false,
    IsNoShow: false,
    LeftWithoutSeen: false,
    InProgress: false,
    IsConfirmed: false,
    PrimaryProviderName: 'Julius Hibbert, MD',
    PrimaryProvider: { Name: '', PhotoUrl: '', PhotoBlobToken: '' },
    Providers: [{ Name: 'Julius Hibbert, MD', PhotoUrl: '', EncryptedId: '' }],
    PrimaryDepartment: { Name: 'Internal Medicine', Address: [], Specialty: { Value: '' } },
    Organization: { OrganizationName: 'Springfield General', LogoUrl: '', PayerOrgDetails: {} },
    Diagnoses: null,
    SurgicalProcedures: null,
    Copay: null,
    IsHideVisitTime: false,
    IsTimeToBeDetermined: false,
    IsClinicalNoteAvailable: true,
    IsApptDetailsEnabled: true,
    IsRescheduleEnabled: false,
    HasTransmitSummaryLink: false,
    ...overrides,
  }
}

describe('prune', () => {
  it('drops nulls, empty strings and objects that hold only those', () => {
    expect(prune({ a: 1, b: null, c: '', d: { e: '', f: null } })).toEqual({ a: 1 })
  })

  it('keeps false and 0 — they are answers, not absences', () => {
    expect(prune({ isRefillable: false, balance: 0 })).toEqual({ isRefillable: false, balance: 0 })
  })

  it('keeps an empty array, because "no known allergies" is a clinical statement', () => {
    expect(prune({ allergies: [] })).toEqual({ allergies: [] })
  })

  it('never changes an array length, so a count taken from it still matches', () => {
    const pruned = prune({ rows: [{ a: '' }, { a: 1 }, { a: null }] }) as { rows: unknown[] }
    expect(pruned.rows).toEqual([{}, { a: 1 }, {}])
  })

  it('leaves primitives inside arrays alone', () => {
    expect(prune({ codes: ['a', '', 'b'] })).toEqual({ codes: ['a', '', 'b'] })
  })
})

describe('get_past_visits', () => {
  const raw = {
    ViewBagProperties: { LoadingOrgNames: '', ErrorOrgNames: '' },
    SerializedIndex: 'opaque-cursor',
    List: {
      'ORG-A': {
        Organization: { OrganizationName: 'Springfield General', LogoUrl: '' },
        HasMoreData: true,
        ListSize: 2,
        List: [
          visit({ Csn: 'CSN-OLD', PrimaryDate: '11/20/2025 02:30:00 PM', Instant: '/Date(1763652600000)/' }),
          visit({ Csn: 'CSN-NEW', PrimaryDate: '01/10/2026 09:00:00 AM', Instant: '/Date(1768050000000)/' }),
        ],
      },
      'ORG-B': {
        Organization: { OrganizationName: 'Shelbyville Medical', LogoUrl: '' },
        HasMoreData: false,
        ListSize: 1,
        List: [visit({ Csn: 'CSN-B', PrimaryDate: '06/01/2025 10:00:00 AM', Instant: '/Date(1748779200000)/' })],
      },
    },
  }

  const out = condense('get_past_visits', raw)
  const visits = out.visits as Array<Record<string, unknown>>

  it('flattens every organization into one list', () => {
    expect(out.count).toBe(3)
    expect(visits.map((v) => v.csn)).toEqual(['CSN-NEW', 'CSN-OLD', 'CSN-B'])
  })

  it('keeps the csn, which is the handle for every follow-up call', () => {
    // get_visit_notes, get_visit_avs and get_letter_details all take it.
    expect(visits.every((v) => typeof v.csn === 'string' && v.csn)).toBe(true)
  })

  it('reports past visits as completed, not as appointments still to keep', () => {
    // Every row here has IsPastVisit false — some instances leave that flag
    // off on rows LoadPast itself returned.
    expect(visits.map((v) => v.status)).toEqual(['completed', 'completed', 'completed'])
  })

  it('says when MyChart still has older visits', () => {
    expect(out.has_older_visits).toBe(true)
  })

  it('reads the date from the clinic’s own rendering, not from the reader’s timezone', () => {
    // Derived from PrimaryDate, so this passes in Tokyo and in Los Angeles.
    expect(visits[0]!.date).toBe('2026-01-10')
    expect(visits[0]!.time).toBe('09:00:00 AM')
  })

  it('drops the view-model scaffolding', () => {
    expect(JSON.stringify(out)).not.toContain('IsRescheduleEnabled')
    expect(JSON.stringify(out)).not.toContain('PayerOrgDetails')
    expect(JSON.stringify(raw).length / JSON.stringify(out).length).toBeGreaterThan(3)
  })

  it('falls back to the display date, then to the instant, when PrimaryDate is absent', () => {
    const noPrimary = condense('get_past_visits', {
      List: {
        'ORG-A': { List: [visit({ Csn: 'CSN-D', PrimaryDate: '', Date: 'Jan 10, 2026', Time: '9:00 AM' })] },
      },
    })
    expect((noPrimary.visits as Array<Record<string, unknown>>)[0]).toMatchObject({
      date: 'Jan 10, 2026',
      time: '9:00 AM',
    })

    // Nothing but the absolute instant left. Date-only, so no timezone claim.
    const instantOnly = condense('get_past_visits', {
      List: { 'ORG-A': { List: [visit({ Csn: 'CSN-E', PrimaryDate: '', Date: '', Instant: '/Date(1768050000000)/' })] } },
    })
    expect((instantOnly.visits as Array<Record<string, unknown>>)[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('suppresses a time MyChart says not to show', () => {
    const hidden = condense('get_past_visits', {
      List: { 'ORG-A': { List: [visit({ Csn: 'CSN-F', IsTimeToBeDetermined: true })] } },
    })
    expect((hidden.visits as Array<Record<string, unknown>>)[0]!.time).toBeUndefined()
  })

  it('passes a scrape failure through instead of condensing the error away', () => {
    const failure = condense('get_past_visits', { visits: [], error: 'Authentication error' })
    expect(failure.error).toBe('Authentication error')
  })
})

describe('get_upcoming_visits', () => {
  // Instant blanked so ordering falls back to PrimaryDate — the path an
  // instance that omits `Instant` takes.
  const out = condense('get_upcoming_visits', {
    InProgressVisits: [visit({ Csn: 'CSN-NOW', InProgress: true, Instant: '', PrimaryDate: '02/01/2026 08:00:00 AM' })],
    NextNDaysVisits: [],
    LaterVisitsList: [
      visit({ Csn: 'CSN-LATER', Instant: '', PrimaryDate: '04/15/2026 09:00:00 AM', IsConfirmed: true }),
      visit({ Csn: 'CSN-CANCELED', Instant: '', PrimaryDate: '03/01/2026 09:00:00 AM', IsCanceled: true }),
    ],
    HighlightDays: [],
    HasPVG: false,
  })
  const visits = out.visits as Array<Record<string, unknown>>

  it('orders soonest first and keeps which bucket each came from', () => {
    expect(visits.map((v) => [v.csn, v.bucket])).toEqual([
      ['CSN-NOW', 'in_progress'],
      ['CSN-CANCELED', 'later'],
      ['CSN-LATER', 'later'],
    ])
  })

  it('never calls an upcoming visit completed', () => {
    expect(visits.map((v) => v.status)).toEqual(['in_progress', 'canceled', 'confirmed'])
  })
})

describe('get_lab_results', () => {
  const raw = [
    {
      orderName: 'Lipid Panel',
      key: 'RES-LIPID',
      orderLimitReached: false,
      hideEncInfo: false,
      results: [
        {
          name: 'Lipid Panel',
          key: 'RES-LIPID',
          showName: false,
          isAbnormal: true,
          orderMetadata: {
            orderProviderName: 'Julius Hibbert, MD',
            prioritizedInstantISO: '2026-01-10T10:30:00',
            resultTimestampDisplay: 'Jan 10, 2026 10:30 AM',
            collectionTimestampsDisplay: 'Jan 10, 2026 9:00 AM',
            specimensDisplay: 'Blood',
            resultStatus: 'Final',
            resultingLab: { name: 'Springfield General Lab', address: ['123 Main St'], cliaNumber: '' },
          },
          resultComponents: [
            {
              componentInfo: { componentID: 'COMP-CHOL', name: 'Total Cholesterol', commonName: '', units: 'mg/dL' },
              componentResultInfo: {
                value: '280',
                numericValue: 280,
                referenceRange: { low: 125, high: 200, formattedReferenceRange: '125 - 200 mg/dL' },
                abnormalFlagCategoryValue: 'High',
              },
              componentComments: { isRTF: false, hasContent: false, contentAsString: '' },
            },
          ],
          studyResult: {
            narrative: { hasContent: false, contentAsString: '' },
            impression: { hasContent: false, contentAsString: '' },
          },
          resultNote: { hasContent: true, contentAsString: 'Recheck in 3 months.' },
          resultLetter: { hasContent: false, contentAsString: '' },
          reportDetails: { isDownloadablePDFReport: false, reportID: '' },
          scans: [],
          imageStudies: [],
        },
      ],
      historicalResults: {
        historicalResults: {
          'COMP-CHOL': {
            componentID: 'COMP-CHOL',
            name: 'Total Cholesterol',
            hideGraph: false,
            // Deliberately newest-first, and longer than the cap.
            historicalResultData: Array.from({ length: 12 }, (_, i) => ({
              value: String(300 - i),
              numericValue: 300 - i,
              referenceRange: { low: 125, high: 200, formattedReferenceRange: '125 - 200 mg/dL' },
              dateISO: `20${26 - i}-01-10T09:00:00`,
            })),
          },
        },
        orderedComponentIDs: ['COMP-CHOL'],
      },
    },
  ]

  const out = condense('get_lab_results', raw)
  const result = (out.results as Array<Record<string, unknown>>)[0]!
  const component = (result.components as Array<Record<string, unknown>>)[0]!

  it('keeps the value, units and reference range for every component', () => {
    expect(component).toMatchObject({
      name: 'Total Cholesterol',
      value: '280',
      units: 'mg/dL',
      range: '125 - 200 mg/dL',
      flag: 'High',
    })
  })

  it('keeps the abnormal marker and the provider note', () => {
    expect(result.abnormal).toBe(true)
    expect(result.note).toBe('Recheck in 3 months.')
    expect(result.ordered_by).toBe('Julius Hibbert, MD')
  })

  it('keeps the most RECENT trend points, whatever order the instance sent', () => {
    const trend = component.trend as string[]
    expect(trend).toHaveLength(8)
    expect(trend[trend.length - 1]).toBe('2026-01-10: 300')
    expect(trend[0]).toBe('2019-01-10: 293')
  })

  it('drops the per-point copies of the reference range', () => {
    expect(JSON.stringify(out)).not.toContain('lowerBoundExclusive')
    expect(JSON.stringify(raw).length / JSON.stringify(out).length).toBeGreaterThan(3)
  })
})

describe('get_imaging_results', () => {
  const out = condense('get_imaging_results', [
    {
      orderName: 'XR Skull 2 Views',
      key: 'RES-XRAY',
      index: 0,
      image_id: 'eyJmZGkiOiJGREktMSJ9',
      resultDate: 'Aug 5, 2025 11:00 AM',
      orderProvider: 'Julius Hibbert, MD',
      narrative: 'FINDINGS: Calvarium is intact.',
      impression: 'IMPRESSION: Foreign bodies present.',
      reportText: 'FINDINGS: Calvarium is intact. IMPRESSION: Foreign bodies present.',
      samlUrl: 'https://example.invalid/e/saml-sts?single-use-token',
      series: [{ studyDescription: 'Skull AP', modality: 'CR', numberOfImages: 2 }],
      results: [{ name: 'XR Skull 2 Views', orderMetadata: { resultStatus: 'Final', readingProviderName: '' } }],
    },
    {
      orderName: 'CT Head',
      key: 'RES-CT',
      index: 1,
      resultDate: 'Jan 2, 2026',
      impression: 'IMPRESSION: Unremarkable.',
      results: [{ name: 'CT Head', orderMetadata: { resultStatus: 'Final' } }],
    },
  ])
  const studies = out.studies as Array<Record<string, unknown>>

  it('keeps both handles download_imaging_study accepts', () => {
    expect(studies[0]!.image_id).toBe('eyJmZGkiOiJGREktMSJ9')
    expect(studies[0]!.index).toBe(0)
  })

  it('keeps the radiologist’s findings and impression', () => {
    expect(studies[0]!.findings).toBe('FINDINGS: Calvarium is intact.')
    expect(studies[0]!.impression).toBe('IMPRESSION: Foreign bodies present.')
  })

  it('says outright whether there are pictures to look at', () => {
    expect(studies[0]!.has_viewable_images).toBe(true)
    expect(studies[1]!.has_viewable_images).toBe(false)
  })

  it('drops the single-use viewer URL, which has expired by the time anyone reads it', () => {
    expect(JSON.stringify(out)).not.toContain('saml-sts')
  })
})

describe('get_billing', () => {
  const charge = (overrides: Record<string, unknown> = {}) => ({
    HospitalAccountId: 'HA-1',
    HospitalAccountDisplay: 'Account #1',
    StartDate: 20260110,
    StartDateDisplay: 'Jan 10, 2026',
    Description: 'Annual Physical',
    Patient: 'Homer Simpson',
    Provider: 'Julius Hibbert, MD',
    ChargeAmount: '$500.00',
    InsurancePaymentAmount: '$0.00',
    InsuranceAmountDue: '$150.00',
    SelfAmountDue: '$350.00',
    SelfAmountDueRaw: 350,
    IsExpanded: false,
    BlockExpanding: false,
    ProcedureGroupList: [],
    ...overrides,
  })

  it('merges the categorized lists without counting a charge twice', () => {
    // The same charge appears in UnifiedVisitList and in the filtered view
    // MyChart also returns it in.
    const out = condense('get_billing', [
      {
        patientName: 'Homer Simpson',
        guarantorNumber: '742',
        amountDue: 350,
        billingDetails: {
          Success: true,
          Data: {
            UnifiedVisitList: [charge()],
            NotPaymentPlanVisitList: [charge()],
            BadDebtVisitList: [charge({ HospitalAccountId: 'HA-2', Description: 'ER Visit', SelfAmountDueRaw: 90 })],
            CanMakePayment: true,
            Filters: { FilterClass: '', Options: [] },
          },
        },
        statementList: { Success: true, DataStatement: { StatementList: [] }, DataDetailBill: { StatementList: [] } },
        paymentList: { Success: true, Data: { PaymentList: [] } },
      },
    ])
    const visits = (out.accounts as Array<Record<string, unknown>>)[0]!.visits as Array<Record<string, unknown>>
    expect(visits.map((v) => v.description)).toEqual(['Annual Physical', 'ER Visit'])
    expect(visits[1]!.category).toBe('bad_debt')
  })

  it('keeps the statements and the payment history', () => {
    const out = condense('get_billing', [
      {
        patientName: 'Homer Simpson',
        amountDue: 0,
        billingDetails: { Success: true, Data: { UnifiedVisitList: [] } },
        statementList: {
          Success: true,
          DataStatement: {
            StatementList: [
              {
                FormattedDateDisplay: 'Jan 15, 2026',
                Description: 'Sent via postal mail',
                StatementAmountDisplay: '$350.00',
                IsRead: false,
                ImagePath: 'file-key',
                Token: 'download-token',
                PrintID: '',
              },
            ],
          },
          DataDetailBill: { StatementList: [] },
        },
        paymentList: {
          Success: true,
          Data: {
            PaymentList: [
              {
                FormattedDateDisplay: 'Jan 20, 2026',
                Description: 'MyChart Payment',
                PaymentAmountDisplay: '$350.00',
                CanEdit: false,
                EditPaymentOptions: null,
              },
            ],
          },
        },
      },
    ])
    const account = (out.accounts as Array<Record<string, unknown>>)[0]!
    expect(account.statements).toEqual([
      { date: 'Jan 15, 2026', description: 'Sent via postal mail', amount: '$350.00', unread: true },
    ])
    expect(account.payments).toEqual([
      { date: 'Jan 20, 2026', description: 'MyChart Payment', amount: '$350.00' },
    ])
  })

  it('finds the charges on an instance that only fills a categorized list', () => {
    // The older Epic release splits everything across the categorized lists
    // and leaves UnifiedVisitList empty; reading only that one loses the bill.
    const out = condense('get_billing', [
      {
        patientName: 'Homer Simpson',
        amountDue: 350,
        billingDetails: { Success: true, Data: { UnifiedVisitList: [], InformationalVisitList: [charge()] } },
      },
    ])
    const visits = (out.accounts as Array<Record<string, unknown>>)[0]!.visits as Array<Record<string, unknown>>
    expect(visits).toHaveLength(1)
    expect(visits[0]).toMatchObject({ you_owe: '$350.00', category: 'informational' })
    expect(out.total_due).toBe(350)
  })
})

describe('get_messages', () => {
  const out = condense('get_messages', {
    legacyXUnreadCount: 1,
    conversations: [
      {
        hthId: 'CONV-1',
        subject: 'Weight Management Follow-up',
        tags: { Messages: false, Unread: true },
        previewText: 'Homer, we discussed…',
        audience: [{ name: 'Julius Hibbert, MD' }],
        hasMoreMessages: false,
        userKeys: [],
        maskedUserNames: [],
        messages: [
          {
            wmgId: 'MSG-1',
            isUnread: true,
            deliveryInstantISO: '2026-01-10T14:30:00Z',
            body: 'Reduce your donut intake.',
            author: { displayName: 'Julius Hibbert, MD', empKey: 'PROV-1', wprKey: '' },
            attachments: [],
            tasks: [],
            suggestedActions: [],
          },
        ],
      },
    ],
    users: { 'PROV-1': { name: 'Julius Hibbert, MD', photoUrl: '', providerId: '' } },
    viewers: { 'WPR-1': { name: 'Homer Simpson', isSelf: true } },
  })
  const conversation = (out.conversations as Array<Record<string, unknown>>)[0]!

  it('keeps the conversation id, which reply and delete both take', () => {
    expect(conversation.conversation_id).toBe('CONV-1')
  })

  it('keeps the message bodies, which are the whole point', () => {
    expect((conversation.messages as Array<Record<string, unknown>>)[0]).toMatchObject({
      from: 'Julius Hibbert, MD',
      body: 'Reduce your donut intake.',
      unread: true,
    })
  })

  it('drops the preview once the body it truncates is present', () => {
    expect(conversation.preview).toBeUndefined()
  })

  it('keeps the preview when the bodies did not come down with the list', () => {
    const previewOnly = condense('get_messages', {
      conversations: [{ hthId: 'CONV-2', subject: 'Labs', previewText: 'Your results are…' }],
    })
    expect((previewOnly.conversations as Array<Record<string, unknown>>)[0]!.preview).toBe('Your results are…')
  })
})

describe('get_message_recipients', () => {
  it('keeps the name send_message resolves against, and drops the id plumbing', () => {
    const out = condense('get_message_recipients', {
      recipients: [
        {
          recipientType: 1,
          displayName: 'Julius Hibbert, MD',
          specialty: 'Internal Medicine',
          pcpTypeDisplayName: 'Primary Care Provider',
          userId: 'PROV-1',
          departmentId: 'DEP-1',
          poolId: 'POOL-1',
          photoUrl: '',
          oocContext: 0,
        },
      ],
    })
    expect(out.count).toBe(1)
    expect((out.recipients as unknown[])[0]).toEqual({
      name: 'Julius Hibbert, MD',
      specialty: 'Internal Medicine',
      relationship: 'Primary Care Provider',
    })
  })
})

describe('condenseForModel', () => {
  it('prunes a capability with no condenser of its own', () => {
    const { data, reshaped } = condenseForModel('get_allergies', {
      allergies: [{ name: 'Vegetables', reaction: 'Hives', severity: '', id: null }],
      allergiesStatus: 0,
    })
    expect(reshaped).toBe(false)
    expect(data).toEqual({ allergies: [{ name: 'Vegetables', reaction: 'Hives' }], allergiesStatus: 0 })
  })

  it('reports which payloads were reshaped, so the caller can point at get_raw_data', () => {
    expect(condenseForModel('get_past_visits', { List: {} }).reshaped).toBe(true)
    expect(condenseForModel('get_medications', { medications: [] }).reshaped).toBe(false)
  })

  it('returns something serializable when a payload prunes away to nothing', () => {
    // JSON.stringify(undefined) is undefined, which would blow up the tool result.
    expect(condenseForModel('get_profile', { name: '', dob: null })).toEqual({ data: {}, reshaped: false })
    expect(condenseForModel('get_documents', []).data).toEqual([])
  })

  it('only condenses ids that exist, so a typo cannot silently disable one', async () => {
    const { CAPABILITY_IDS } = await import('../../../shared/capabilities')
    for (const id of Object.keys(CONDENSERS)) expect(CAPABILITY_IDS).toContain(id)
  })
})
