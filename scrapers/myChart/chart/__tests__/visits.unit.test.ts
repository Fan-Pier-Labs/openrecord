import { describe, it, expect, mock } from 'bun:test'
import {
  upcomingVisits,
  pastVisits,
  fetchUpcomingVisitsRaw,
  fetchPastVisitsRaw,
  upcomingVisitsProcessor,
  pastVisitsProcessor,
  visitStandard,
  visitStatus,
  visitInstantMs,
} from '../visits/visits'
import { MyChartRequest } from '../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../core/util'
import { renderOutput } from '../../processors/processor'
import type { RawResponse } from '../../core/rawResponse'

function mockRequest(responses: Array<{ body: string; contentType?: string; server?: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    if (!r) throw new Error(`unexpected request #${i}`)
    const headers: Record<string, string> = { 'content-type': r.contentType ?? 'application/json' }
    if (r.server !== undefined) headers['server'] = r.server
    return new Response(r.body, { status: 200, headers })
  })
  return req
}

/** Records every call so the wire shape can be asserted. */
function mockRecordingRequest(responses: Array<{ body: string; contentType?: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = []
  let i = 0
  req.transport = mock(async (url: string, init?: RequestInit) => {
    calls.push({ url: url.toString(), init })
    const r = responses[i++]
    if (!r) throw new Error(`unexpected request #${i}`)
    return new Response(r.body, { status: 200, headers: { 'content-type': r.contentType ?? 'application/json' } })
  })
  return { req, calls }
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="csrf_token" />', contentType: 'text/html' }

/** A LoadPast page: one organization, the given visits, the given cursor. */
function pastPage(visits: unknown[], opts: { hasMore?: boolean; cursor?: string; orgId?: string; orgName?: string } = {}) {
  return {
    ViewBagProperties: { LoadingOrgNames: '', ErrorOrgNames: '', ManualOrgNames: '' },
    SerializedIndex: opts.cursor ?? '',
    List: {
      [opts.orgId ?? 'Org-1']: {
        Organization: { OrganizationName: opts.orgName ?? 'Example Health' },
        List: visits,
        ListSize: visits.length,
        HasMoreData: opts.hasMore ?? false,
        SerializedIndex: opts.cursor ?? '',
      },
    },
  }
}

function instant(iso: string): string {
  return `/Date(${Date.parse(iso)})/`
}

describe('visitStandard', () => {
  it('keeps MyChart field names, lifts organizationName, derives instantISO and status', () => {
    const row = {
      Csn: 'CSN-1',
      CsnForECheckIn: 'CSN-1',
      Id: 'ID-1',
      ReferenceID: 'REF-1',
      Instant: '/Date(1761851400000)/',
      PrimaryDate: '10/30/2025 03:30:00 PM',
      TimeZone: 'Eastern Standard Time',
      IsTimeToBeDetermined: false,
      IsHideVisitTime: false,
      DurationInMinutes: 30,
      HasDuration: true,
      ArrivalTime: '3:15 PM',
      EarlyArrivalReason: 'Paperwork',
      AdmissionDateRange: null,
      DischargeDate: null,
      RescheduledDatString: null,
      VisitTypeName: 'Office Visit',
      IsUsingFallbackVisitTypeName: false,
      EncounterType: 101,
      ChiefComplaint: 'Follow-up',
      Diagnoses: [{ Code: 'J00', Description: 'Common cold', Extra: 'dropped' }],
      SurgicalProcedures: [{ Name: 'Procedure A', Instructions: 'Fast', Providers: [{ Name: 'Dr. Surgeon', PhotoUrl: 'x' }] }],
      Cases: [{ CaseId: 'C1', Description: 'Case' }],
      ComponentVisits: [{ Csn: 'CSN-1a', VisitTypeName: 'Lab', PrimaryDate: '10/30/2025 03:00:00 PM' }],
      HasComponentVisits: true,
      PatientNextStepInstructions: 'Bring insurance card',
      EpisodeDetails: { GestationalAge: '' },
      SurgeryTimeOfDay: 0,
      PrimaryProviderName: 'Dr. Example',
      PrimaryProvider: { Name: 'Dr. Example', EncryptedId: 'secret' },
      Providers: [
        { Name: 'Dr. Example', Department: { Name: 'Primary Care', Address: ['1 Main St'], PhoneNumber: '555-0100', Id: 'dep' } },
        { Name: 'Nurse', Department: null },
      ],
      OtherProviders: [{ Name: 'Dr. Other' }],
      GuestPatientFirstName: null,
      PrimaryDepartment: {
        Id: 'DEP-1',
        Name: 'Primary Care',
        Address: ['1 Main St', 'Springfield'],
        PhoneNumber: '555-0100',
        Specialty: { Value: '1', Title: 'Family Medicine' },
        Instructions: [{ Text: 'Park in lot B', Type: 'arrival' }],
        ArrivalLocation: 'Front desk',
        TimeZone: 'America/New_York',
      },
      PreadmissionLocation: null,
      Organization: { OrganizationId: 'ORG', OrganizationName: 'Example Health', IsSSO: false },
      IsCanceled: false,
      IsNoShow: false,
      LeftWithoutSeen: false,
      InProgress: false,
      IsArrived: false,
      IsConfirmed: true,
      IsCancelRequestSent: false,
      ConfirmationStatus: 2,
      ArrivalStatus: null,
      Telemedicine: { IsTelemedicine: false, TelemedicineUrl: null, TelemedicineMode: 0 },
      TelehealthMode: 0,
      EVisit: null,
      IsInHomeVisit: false,
      Copay: { Amount: '$20.00', IsPaid: false },
      HasPaymentInfo: true,
      IsFullyPaid: false,
      IsClinicalNoteAvailable: true,
      IsNotesOnly: false,
      IsClinicalInformationAvailable: true,
      IsVisitSummaryEnabled: true,
      HasDownloadSummaryLink: false,
      IsNotViewed: true,
      IsVisitAmbulatory: true,
      // UI flags that must not survive
      IsRescheduleEnabled: true,
      CanShowECheckIn: true,
      IsPastVisit: false,
    }

    const standard = visitStandard(row, false)
    expect(standard).toEqual({
      Csn: 'CSN-1',
      CsnForECheckIn: 'CSN-1',
      Id: 'ID-1',
      ReferenceID: 'REF-1',
      Instant: '/Date(1761851400000)/',
      instantISO: '2025-10-30T19:10:00.000Z',
      PrimaryDate: '10/30/2025 03:30:00 PM',
      TimeZone: 'Eastern Standard Time',
      IsTimeToBeDetermined: false,
      IsHideVisitTime: false,
      DurationInMinutes: 30,
      HasDuration: true,
      ArrivalTime: '3:15 PM',
      EarlyArrivalReason: 'Paperwork',
      AdmissionDateRange: null,
      DischargeDate: null,
      RescheduledDatString: null,
      VisitTypeName: 'Office Visit',
      IsUsingFallbackVisitTypeName: false,
      EncounterType: 101,
      EncounterIsSurgery: null,
      EncounterIsEDVisit: null,
      IsPreadmission: null,
      IsHovPreadmission: null,
      IsResidentialMed: null,
      ChiefComplaint: 'Follow-up',
      Diagnoses: [{ Code: 'J00', Description: 'Common cold' }],
      SurgicalProcedures: [{ Name: 'Procedure A', Instructions: 'Fast', Providers: [{ Name: 'Dr. Surgeon' }] }],
      Cases: [{ CaseId: 'C1', Description: 'Case' }],
      ComponentVisits: [{ Csn: 'CSN-1a', VisitTypeName: 'Lab', PrimaryDate: '10/30/2025 03:00:00 PM' }],
      HasComponentVisits: true,
      PatientNextStepInstructions: 'Bring insurance card',
      EpisodeDetails: { GestationalAge: '' },
      SurgeryTimeOfDay: 0,
      PrimaryProviderName: 'Dr. Example',
      PrimaryProvider: { Name: 'Dr. Example' },
      Providers: [
        { Name: 'Dr. Example', Department: { Name: 'Primary Care', Address: ['1 Main St'], PhoneNumber: '555-0100' } },
        { Name: 'Nurse', Department: null },
      ],
      OtherProviders: [{ Name: 'Dr. Other' }],
      GuestPatientFirstName: null,
      PrimaryDepartment: {
        Name: 'Primary Care',
        Address: ['1 Main St', 'Springfield'],
        PhoneNumber: '555-0100',
        Specialty: { Title: 'Family Medicine' },
        Instructions: [{ Text: 'Park in lot B' }],
        ArrivalLocation: 'Front desk',
        TimeZone: 'America/New_York',
      },
      PreadmissionLocation: null,
      organizationName: 'Example Health',
      IsCanceled: false,
      IsNoShow: false,
      LeftWithoutSeen: false,
      InProgress: false,
      IsArrived: false,
      IsConfirmed: true,
      IsCancelRequestSent: false,
      status: 'confirmed',
      ConfirmationStatus: 2,
      ArrivalStatus: null,
      Telemedicine: { IsTelemedicine: false, TelemedicineMode: 0 },
      TelehealthMode: 0,
      EVisit: null,
      IsInHomeVisit: false,
      Copay: { Amount: '$20.00', IsPaid: false },
      HasPaymentInfo: true,
      IsFullyPaid: false,
      IsClinicalNoteAvailable: true,
      IsNotesOnly: false,
      IsClinicalInformationAvailable: true,
      IsVisitSummaryEnabled: true,
      HasDownloadSummaryLink: false,
      IsNotViewed: true,
      IsVisitAmbulatory: true,
    })
    expect(standard).not.toHaveProperty('IsRescheduleEnabled')
    expect(standard).not.toHaveProperty('Organization')
    expect(standard).not.toHaveProperty('IsPastVisit')
  })

  it('emits every field on an empty row, as null/[]', () => {
    const standard = visitStandard({}, false)
    expect(standard.Csn).toBeNull()
    expect(standard.instantISO).toBeNull()
    expect(standard.Diagnoses).toEqual([])
    expect(standard.PrimaryDepartment).toEqual({
      Name: null, Address: [], PhoneNumber: null, Specialty: { Title: null }, Instructions: [], ArrivalLocation: null, TimeZone: null,
    })
    expect(standard.EpisodeDetails).toEqual({ GestationalAge: null })
    expect(standard.organizationName).toBeNull()
    expect(standard.status).toBe('scheduled')
    expect(Object.keys(standard)).toHaveLength(66)
  })

  it('keeps the nested objects MyChart sent, and the arrays that were null as empty', () => {
    const standard = visitStandard({
      AdmissionDateRange: { Start: '01/02/2024', End: '01/05/2024' },
      PreadmissionLocation: { Name: 'Pre-op', Address: ['2 Side St'], PhoneNumber: null, Instructions: null, ArrivalLocation: 'Desk 3' },
      EVisit: { IsEVisit: true, EVisitUrl: '/evisit' },
      SurgeryTimeOfDay: 'AM',
      Diagnoses: null,
      Cases: null,
    }, true)
    expect(standard.AdmissionDateRange).toEqual({ Start: '01/02/2024', End: '01/05/2024' })
    expect(standard.PreadmissionLocation).toEqual({ Name: 'Pre-op', Address: ['2 Side St'], PhoneNumber: null, Instructions: [], ArrivalLocation: 'Desk 3' })
    expect(standard.EVisit).toEqual({ IsEVisit: true })
    expect(standard.SurgeryTimeOfDay).toBe('AM')
    expect(standard.Diagnoses).toEqual([])
    expect(standard.Cases).toEqual([])
  })
})

describe('visitStatus', () => {
  it('picks the most specific status first and never consults IsPastVisit', () => {
    expect(visitStatus({ IsCanceled: true, InProgress: true, IsConfirmed: true }, true)).toBe('canceled')
    expect(visitStatus({ IsNoShow: true, IsArrived: true }, true)).toBe('no_show')
    expect(visitStatus({ LeftWithoutSeen: true, IsArrived: true }, true)).toBe('left_without_being_seen')
    expect(visitStatus({ InProgress: true, IsArrived: true }, false)).toBe('in_progress')
    expect(visitStatus({ IsArrived: true, IsConfirmed: true }, false)).toBe('arrived')
    expect(visitStatus({ IsConfirmed: true, IsPastVisit: false }, true)).toBe('completed')
    expect(visitStatus({ IsCancelRequestSent: true, IsConfirmed: true }, false)).toBe('cancel_requested')
    expect(visitStatus({ IsConfirmed: true }, false)).toBe('confirmed')
    expect(visitStatus({ IsPastVisit: true }, false)).toBe('scheduled')
  })
})

describe('visitInstantMs', () => {
  it('prefers Instant, falls back to PrimaryDate, and is null when neither parses', () => {
    expect(visitInstantMs({ Instant: '/Date(1761851400000)/', PrimaryDate: '01/01/2000 12:00:00 AM' })).toBe(1761851400000)
    expect(visitInstantMs({ Instant: '', PrimaryDate: '2024-06-01T12:00:00Z' })).toBe(Date.parse('2024-06-01T12:00:00Z'))
    expect(visitInstantMs({ Instant: '', PrimaryDate: 'not a date' })).toBeNull()
    expect(visitInstantMs({})).toBeNull()
  })
})

describe('upcomingVisits', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>', contentType: 'text/html' }])
    await expect(upcomingVisits(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('flattens the three buckets into one list, soonest first, each with its bucket', async () => {
    const visitsData = {
      LaterVisitsList: [{ Csn: 'L', VisitTypeName: 'Annual Physical', Instant: instant('2025-03-15T14:30:00Z'), IsConfirmed: true }],
      NextNDaysVisits: [{ Csn: 'S', VisitTypeName: 'Lab Work', Instant: instant('2025-01-20T13:00:00Z') }],
      InProgressVisits: [{ Csn: 'P', VisitTypeName: 'Telehealth', Instant: instant('2025-01-15T16:00:00Z'), InProgress: true }],
      HighlightDays: ['2025-01-20'],
      HasPVG: false,
    }
    const req = mockRequest([TOKEN, { body: JSON.stringify(visitsData) }])

    const result = await upcomingVisits(req)
    expect(result).not.toBeNull()
    expect(result!.count).toBe(3)
    expect(result!.visits.map((v) => [v.Csn, v.bucket, v.status])).toEqual([
      ['P', 'in_progress', 'in_progress'],
      ['S', 'soon', 'scheduled'],
      ['L', 'later', 'confirmed'],
    ])
    expect(result!.visits[0]!.instantISO).toBe('2025-01-15T16:00:00.000Z')
    expect(result).not.toHaveProperty('HighlightDays')
  })

  it('sorts rows without a parseable instant last', () => {
    const raw: RawResponse = {
      requests: [{
        path: '/Visits/VisitsList/LoadUpcoming', method: 'POST', status: 200, contentType: 'application/json',
        body: {
          LaterVisitsList: [{ Csn: 'TBD', Instant: '', PrimaryDate: '' }, { Csn: 'B', Instant: instant('2025-05-01T00:00:00Z') }],
          NextNDaysVisits: [{ Csn: 'A', Instant: instant('2025-04-01T00:00:00Z') }],
          InProgressVisits: [],
        },
      }],
    }
    expect(upcomingVisitsProcessor.standard(raw)!.visits.map((v) => v.Csn)).toEqual(['A', 'B', 'TBD'])
  })

  it('records the requests and renders every mode', async () => {
    const body = { LaterVisitsList: [{ Csn: 'L', VisitTypeName: 'Annual Physical', PrimaryProviderName: 'Dr. Example', Organization: { OrganizationName: 'Example Health' } }], NextNDaysVisits: [], InProgressVisits: [], HasPVG: false }
    const req = mockRequest([TOKEN, { body: JSON.stringify(body) }])
    const raw = await fetchUpcomingVisitsRaw(req)

    expect(raw.requests.map((r) => [r.path, r.method])).toEqual([
      ['/Visits/VisitsList', 'GET'],
      ['/Visits/VisitsList/LoadUpcoming?timeZone=America%2FNew_York&ComponentNumber=5', 'POST'],
    ])
    expect(raw.requests[1]!.requestBody).toBeUndefined()
    expect(renderOutput(upcomingVisitsProcessor, raw, 'raw')).toEqual(body)

    const json = renderOutput(upcomingVisitsProcessor, raw, 'json') as { count: number; visits: Record<string, unknown>[] }
    expect(json.count).toBe(1)
    expect(json.visits[0]!.organizationName).toBe('Example Health')
    expect(json.visits[0]!.bucket).toBe('later')

    const concise = upcomingVisitsProcessor.concise(upcomingVisitsProcessor.standard(raw)) as { visits: Record<string, unknown>[] }
    expect(Object.keys(concise.visits[0]!)).toEqual([
      'Csn', 'PrimaryDate', 'IsTimeToBeDetermined', 'IsHideVisitTime', 'AdmissionDateRange', 'DischargeDate',
      'VisitTypeName', 'ChiefComplaint', 'Diagnoses', 'SurgicalProcedures', 'PrimaryProviderName', 'PrimaryDepartment',
      'organizationName', 'status', 'IsClinicalNoteAvailable', 'IsVisitSummaryEnabled', 'bucket',
    ])
    expect(renderOutput(upcomingVisitsProcessor, raw, 'standard')).toContain('Dr. Example')
    expect(renderOutput(upcomingVisitsProcessor, raw, 'concise')).toContain('Annual Physical')
  })

  it('passes a literal null body through as null in every mode', () => {
    const raw: RawResponse = { requests: [{ path: '/Visits/VisitsList/LoadUpcoming', method: 'POST', status: 200, contentType: 'application/json', body: null }] }
    expect(upcomingVisitsProcessor.standard(raw)).toBeNull()
    expect(upcomingVisitsProcessor.concise(null)).toBeNull()
    expect(renderOutput(upcomingVisitsProcessor, raw, 'json')).toBeNull()
  })

  it('sends LoadUpcoming with no body and no Content-Type (F5 WAF regression)', async () => {
    const { req, calls } = mockRecordingRequest([TOKEN, { body: JSON.stringify({}) }])
    await upcomingVisits(req)

    expect(calls[1]!.init?.method).toBe('POST')
    const headers = calls[1]!.init!.headers as Record<string, string>
    expect(headers['__requestverificationtoken']).toBe('csrf_token')
    // Pin the WAF-safe shape: no body, no Content-Type. On Node's undici fetch,
    // an empty-string body would still trigger Content-Type: text/plain.
    expect(calls[1]!.init?.body).toBeUndefined()
    expect(headers['content-type']).toBeUndefined()
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('throws a descriptive error when the WAF answers with HTML instead of JSON', async () => {
    const req = mockRequest([TOKEN, { body: '<html>Request Rejected</html>', contentType: 'text/html', server: 'volt-adc' }])
    await expect(upcomingVisits(req)).rejects.toThrow(/WAF.*rejected/)
  })
})

describe('pastVisits', () => {
  const OLDEST = new Date('2023-01-01T00:00:00.000Z')

  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>', contentType: 'text/html' }])
    await expect(pastVisits(req, OLDEST)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('returns the standard container, newest first, every row completed', async () => {
    const page = pastPage([
      { Csn: 'B', VisitTypeName: 'Lab Work', Instant: instant('2024-11-15T14:00:00Z'), PrimaryProviderName: 'Dr. Chen' },
      {
        Csn: 'A', VisitTypeName: 'Office Visit', Instant: instant('2024-12-01T19:00:00Z'), PrimaryProviderName: 'Dr. Williams',
        PrimaryDepartment: { Name: 'Internal Medicine' }, Diagnoses: [{ Code: 'J00', Description: 'Common Cold' }], IsPastVisit: false,
      },
    ])
    const req = mockRequest([TOKEN, { body: JSON.stringify(page) }])

    const result = await pastVisits(req, OLDEST)
    expect(result).toMatchObject({ count: 2, hasOlderVisits: false })
    expect(result!.visits.map((v) => v.Csn)).toEqual(['A', 'B'])
    expect(result!.visits[0]!.status).toBe('completed')
    expect(result!.visits[0]!.organizationName).toBe('Example Health')
    expect(result!.visits[0]!.Diagnoses).toEqual([{ Code: 'J00', Description: 'Common Cold' }])
    expect(result!.visits[0]!.PrimaryDepartment.Name).toBe('Internal Medicine')
    expect(result).not.toHaveProperty('List')
  })

  it('sends LoadPast with no body and no Content-Type (F5 WAF regression)', async () => {
    const { req, calls } = mockRecordingRequest([TOKEN, { body: JSON.stringify(pastPage([])) }])
    const oldestDate = new Date('2023-06-15T00:00:00.000Z')
    await pastVisits(req, oldestDate)

    expect(calls[1]!.url).toContain('oldestRenderedDate=')
    expect(calls[1]!.url).toContain('2023-06-15')
    expect(calls[1]!.init?.method).toBe('POST')
    expect(calls[1]!.init?.body).toBeUndefined()
    const loadPastHeaders = calls[1]!.init?.headers as Record<string, string> | undefined
    expect(loadPastHeaders?.['__requestverificationtoken']).toBe('csrf_token')
    expect(loadPastHeaders?.['content-type']).toBeUndefined()
    expect(loadPastHeaders?.['Content-Type']).toBeUndefined()
  })

  it('flattens visits from multiple organizations with each organization on its row', async () => {
    // Org A's row carries its own Organization (as real rows do); Org B's rows
    // fall back to the container's, the same fact one level up.
    const page = {
      SerializedIndex: '',
      List: {
        'Org-A': { Organization: { OrganizationName: 'Org A' }, List: [{ Csn: 'A1', Instant: instant('2024-12-01T00:00:00Z'), Organization: { OrganizationName: 'Org A' } }], HasMoreData: false },
        'Org-B': {
          Organization: { OrganizationName: 'Org B' },
          List: [{ Csn: 'B1', Instant: instant('2024-11-01T00:00:00Z') }, { Csn: 'B2', Instant: instant('2024-10-01T00:00:00Z') }],
          HasMoreData: false,
        },
      },
    }
    const req = mockRequest([TOKEN, { body: JSON.stringify(page) }])
    const result = await pastVisits(req, OLDEST)
    expect(result!.visits.map((v) => [v.Csn, v.organizationName])).toEqual([['A1', 'Org A'], ['B1', 'Org B'], ['B2', 'Org B']])
  })

  it('follows the continuation cursor, records every page, and merges them in the processor', async () => {
    const page1 = pastPage([{ Csn: 'V1', Instant: instant('2024-12-01T00:00:00Z') }], { hasMore: true, cursor: 'cursor-1' })
    const page2 = pastPage([{ Csn: 'V2', Instant: instant('2024-06-01T00:00:00Z') }], { hasMore: true, cursor: 'cursor-2' })
    const page3 = pastPage([{ Csn: 'V3', Instant: instant('2024-01-01T00:00:00Z') }], { hasMore: false, cursor: 'cursor-3' })
    const { req, calls } = mockRecordingRequest([TOKEN, { body: JSON.stringify(page1) }, { body: JSON.stringify(page2) }, { body: JSON.stringify(page3) }])

    const raw = await fetchPastVisitsRaw(req, OLDEST)
    expect(raw.requests).toHaveLength(4)
    expect(raw.requests.slice(1).map((r) => r.path)).toEqual([
      '/Visits/VisitsList/LoadPast?loadpast=1&searchString=&oldestRenderedDate=2023-01-01T00:00:00.000Z&ComponentNumber=7',
      '/Visits/VisitsList/LoadPast?loadpast=1&searchString=&oldestRenderedDate=2023-01-01T00:00:00.000Z&ComponentNumber=7&serializedIndex=cursor-1',
      '/Visits/VisitsList/LoadPast?loadpast=1&searchString=&oldestRenderedDate=2023-01-01T00:00:00.000Z&ComponentNumber=7&serializedIndex=cursor-2',
    ])
    expect(calls[2]!.url).toContain('serializedIndex=cursor-1')
    expect(calls[3]!.url).toContain('serializedIndex=cursor-2')

    // raw mode is the whole envelope for a multi-request scrape
    expect(renderOutput(pastVisitsProcessor, raw, 'raw')).toBe(raw)

    const standard = pastVisitsProcessor.standard(raw)!
    expect(standard.count).toBe(3)
    expect(standard.hasOlderVisits).toBe(false)
    expect(standard.visits.map((v) => v.Csn)).toEqual(['V1', 'V2', 'V3'])
  })

  it('stops paging once every visit on the latest page predates the cutoff, and reports older visits remain', async () => {
    const page1 = pastPage([{ Csn: 'NEW', Instant: instant('2024-12-01T00:00:00Z') }], { hasMore: true, cursor: 'c1' })
    const page2 = pastPage([{ Csn: 'OLD', Instant: instant('2020-01-01T00:00:00Z') }], { hasMore: true, cursor: 'c2' })
    const req = mockRequest([TOKEN, { body: JSON.stringify(page1) }, { body: JSON.stringify(page2) }])

    const result = await pastVisits(req, OLDEST)
    expect(result!.count).toBe(2)
    expect(result!.hasOlderVisits).toBe(true)
  })

  it('stops when the cursor stops advancing and does not count the repeated page twice', async () => {
    const page1 = pastPage([{ Csn: 'V1', Id: 'I1', Instant: instant('2024-12-01T00:00:00Z') }], { hasMore: true, cursor: 'stuck' })
    const req = mockRequest([TOKEN, { body: JSON.stringify(page1) }, { body: JSON.stringify(page1) }])

    const raw = await fetchPastVisitsRaw(req, OLDEST)
    expect(raw.requests).toHaveLength(3)
    const result = pastVisitsProcessor.standard(raw)!
    expect(result.count).toBe(1)
    expect(result.hasOlderVisits).toBe(true)
  })

  it('stops when a page carries no continuation token', async () => {
    const page1 = pastPage([{ Csn: 'V1', Instant: instant('2024-12-01T00:00:00Z') }], { hasMore: true, cursor: '' })
    const req = mockRequest([TOKEN, { body: JSON.stringify(page1) }])
    const raw = await fetchPastVisitsRaw(req, OLDEST)
    expect(raw.requests).toHaveLength(2)
  })

  it('takes hasOlderVisits from each organization\'s last fetched page', () => {
    const raw: RawResponse = {
      requests: [
        { path: '/Visits/VisitsList/LoadPast?x=1', method: 'POST', status: 200, contentType: 'application/json', body: pastPage([{ Csn: 'A' }], { hasMore: true }) },
        { path: '/Visits/VisitsList/LoadPast?x=2', method: 'POST', status: 200, contentType: 'application/json', body: pastPage([{ Csn: 'B' }], { hasMore: false }) },
      ],
    }
    expect(pastVisitsProcessor.standard(raw)!.hasOlderVisits).toBe(false)
  })

  it('passes a literal null body through as null, and an envelope with no page as null', () => {
    const raw: RawResponse = { requests: [{ path: '/Visits/VisitsList/LoadPast', method: 'POST', status: 200, contentType: 'application/json', body: null }] }
    expect(pastVisitsProcessor.standard(raw)).toBeNull()
    expect(pastVisitsProcessor.concise(null)).toBeNull()
    expect(pastVisitsProcessor.standard({ requests: [] })).toBeNull()
  })

  it('renders concise with only the concise field list', async () => {
    const page = pastPage([{ Csn: 'A', VisitTypeName: 'Office Visit', ChiefComplaint: 'Cough', SurgicalProcedures: [{ Name: 'X', Instructions: 'secret' }], IsClinicalNoteAvailable: true }])
    const req = mockRequest([TOKEN, { body: JSON.stringify(page) }])
    const raw = await fetchPastVisitsRaw(req, OLDEST)
    const concise = pastVisitsProcessor.concise(pastVisitsProcessor.standard(raw)) as { count: number; hasOlderVisits: boolean; visits: Record<string, unknown>[] }
    expect(concise.count).toBe(1)
    expect(concise.visits[0]).toEqual({
      Csn: 'A',
      PrimaryDate: null,
      IsTimeToBeDetermined: null,
      IsHideVisitTime: null,
      AdmissionDateRange: null,
      DischargeDate: null,
      VisitTypeName: 'Office Visit',
      ChiefComplaint: 'Cough',
      Diagnoses: [],
      SurgicalProcedures: [{ Name: 'X' }],
      PrimaryProviderName: null,
      PrimaryDepartment: { Name: null },
      organizationName: 'Example Health',
      status: 'completed',
      IsClinicalNoteAvailable: true,
      IsVisitSummaryEnabled: null,
    })
    expect(renderOutput(pastVisitsProcessor, raw, 'concise')).toContain('Office Visit')
  })

  it('throws a descriptive error when the session has expired and HTML comes back', async () => {
    const req = mockRequest([TOKEN, { body: '<html>login</html>', contentType: 'text/html' }])
    await expect(pastVisits(req, OLDEST)).rejects.toThrow(/Expected JSON/)
  })
})
