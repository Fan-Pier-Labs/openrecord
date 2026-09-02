/**
 * Integration tests that run all scrapers against the fake-mychart server.
 *
 * The fake-mychart Next.js server must be running on localhost:4000 before
 * these tests are executed. In CI this is handled by the workflow; locally
 * run `cd fake-mychart && PORT=4000 bun run dev` first.
 *
 * Run with: bun test scrapers/myChart/__tests__/fake-mychart/
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { inflateSync } from 'zlib'
import type { MyChartRequest } from '../../core/myChartRequest'
import { readPatientPosition, sortImagesByPatientPosition } from '../../clo-image-parser/sortByPatientPosition'
import { parseWrapper } from '../../clo-image-parser/clo_to_bitmap'
import { Amf3Reader } from '../../eunity/amf3Reader'
import { platformFetch } from '../../../http'
import { setMountMode, resetFakeMyChart, type MountMode } from './mountMode'
import { myChartUserPassLogin, myChartPasskeyLogin } from '../../auth/login'
import { setupPasskey } from '../../auth/setupPasskey'
import { passkeyLoginWithCounterRetry } from '../../auth/passkeyLoginRetry'

// Scrapers
import { getMyChartProfile, getEmail } from '../../chart/profile'
import { getHealthSummary } from '../../chart/healthSummary'
import { getMedications } from '../../chart/medications'
import { getAllergies } from '../../chart/allergies'
import { getHealthIssues } from '../../chart/healthIssues'
import { getImmunizations } from '../../chart/immunizations'
import { getVitals } from '../../chart/vitals'
import { getInsurance } from '../../chart/insurance'
import { getCareTeam } from '../../chart/careTeam'
import { getReferrals } from '../../chart/referrals'
import { getMedicalHistory } from '../../chart/medicalHistory'
import { getPreventiveCare } from '../../chart/preventiveCare'
import { getLetters } from '../../chart/letters'
import { getEmergencyContacts, addEmergencyContact, updateEmergencyContact, removeEmergencyContact } from '../../chart/emergencyContacts'
import { getGoals } from '../../chart/goals'
import { getDocuments } from '../../chart/documents'
import { getUpcomingOrders } from '../../chart/upcomingOrders'
import { getQuestionnaires } from '../../chart/questionnaires'
import { getCareJourneys } from '../../chart/careJourneys'
import { getActivityFeed } from '../../chart/activityFeed'
import { getEducationMaterials } from '../../chart/educationMaterials'
import { getEhiExportTemplates } from '../../chart/ehiExport'
import { upcomingVisits, pastVisits } from '../../chart/visits/visits'
import { isVisitsScrapeError, type Visit } from '../../chart/visits/types'
import { getVisitNotes, getNoteContent, getVisitAVS } from '../../chart/notes'
import { listLabResults } from '../../chart/labs/labResults'
import { getBillingHistory } from '../../chart/bills/bills'
import { listConversations } from '../../chart/messages/conversations'
import { getConversationMessages } from '../../chart/messages/messageThreads'
import { requestMedicationRefill } from '../../chart/medicationRefill'
import { getImagingResults } from '../../chart/labs/labResults'
import { followSamlChain } from '../../eunity/imagingViewer'
import { downloadImagingStudyDirect } from '../../eunity/imagingDirectDownload'
const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

// One fake server stands in for both real MyChart deployment shapes, so every
// scraper runs against each. setMountMode flips it; the session is established
// afterwards, because login is where the path prefix gets discovered.
const MOUNT_MODES: MountMode[] = ['prefixed', 'root']

for (const mode of MOUNT_MODES) {
  describe(`fake-mychart integration (${mode} mount)`, () => {
    let session: MyChartRequest

    beforeAll(async () => {
      // Server state is global to the fake; don't inherit whatever ran last.
      await resetFakeMyChart(HOST)
      await setMountMode(HOST, mode)
      const result = await myChartUserPassLogin({
        hostname: HOST,
        user: 'homer',
        pass: 'donuts123',
        protocol: 'http',
      })
      expect(result.state).toBe('logged_in')
      session = result.mychartRequest
    }, 30_000)

    it('serves the root redirect this deployment shape implies', async () => {
      const res = await fetch(`http://${HOST}/`, { redirect: 'manual' })
      expect(res.status).toBe(302)
      if (mode === 'root') {
        // Byte-for-byte what mychart.clevelandclinic.org sends — the relative
        // form and the trailing "?" are both part of the real response.
        expect(res.headers.get('location')).toBe('./Authentication/Login?')
      } else {
        expect(res.headers.get('location')).toContain('/MyChart/')
      }
    })

    it('serves MyChart routes at the domain root only when root-mounted', async () => {
      const res = await fetch(`http://${HOST}/Authentication/Login`, { redirect: 'manual' })
      expect(res.status).toBe(mode === 'root' ? 200 : 404)
    })

    it('discovers the right firstPathPart', () => {
      expect(session.firstPathPart).toBe(mode === 'root' ? null : 'MyChart')
    })

    it('builds URLs without a doubled route segment or a double slash', async () => {
      const requested: string[] = []
      // Spy on the URLs but still hit the real server: platformFetch is what
      // this session would have resolved to anyway.
      session.transport = (url, init) => {
        requested.push(url)
        return platformFetch(url, init)
      }
      try {
        expect(await getMyChartProfile(session)).not.toBeNull()
      } finally {
        session.transport = null
      }

      expect(requested.length).toBeGreaterThan(0)
      for (const url of requested) {
        expect(url).not.toContain('/Authentication/Authentication/')
        // No `//` beyond the one in `http://`.
        expect(url.slice('http://'.length)).not.toContain('//')
      }
    }, 15_000)

    it('getMyChartProfile returns Homer Simpson', async () => {
      const result = await getMyChartProfile(session)
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Homer Jay Simpson')
      expect(result!.dob).toBe('05/12/1956')
      expect(result!.mrn).toBe('742')
      expect(result!.pcp).toBe('Dr. Julius Hibbert, MD')
    }, 10_000)

    it('getEmail returns email', async () => {
      const result = await getEmail(session)
      expect(result).not.toBeNull()
      expect(result).toContain('@')
    }, 10_000)

    it('getHealthSummary returns Homer data', async () => {
      const result = await getHealthSummary(session)
      expect(result).toBeDefined()
      expect(result.patientAge).toBe('69')
      expect(result.bloodType).toBe('O+')
      expect(result.patientFirstName).toBe('Homer')
    }, 10_000)

    it('getMedications returns medications', async () => {
      const result = await getMedications(session)
      expect(result).toBeDefined()
      expect(Array.isArray(result.medications)).toBe(true)
      expect(result.medications.length).toBeGreaterThan(0)
      expect(result.patientFirstName).toBe('Homer')
      const names = result.medications.map((m: { name: string }) => m.name)
      expect(names).toContain('Duff Beer Extract 500mg')
    }, 10_000)

    it('getAllergies returns allergies', async () => {
      const result = await getAllergies(session)
      expect(result).toBeDefined()
      expect(Array.isArray(result.allergies)).toBe(true)
      expect(result.allergies.length).toBeGreaterThan(0)
      const names = result.allergies.map((a: { name: string }) => a.name)
      expect(names).toContain('Vegetables')
    }, 10_000)

    it('getHealthIssues returns health issues', async () => {
      const result = await getHealthIssues(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      const names = result.map((h: { name: string }) => h.name)
      expect(names).toContain('Obesity')
    }, 10_000)

    it('getImmunizations returns immunizations', async () => {
      const result = await getImmunizations(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getVitals returns vitals, values included', async () => {
      const result = await getVitals(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)

      // Every reading must carry its value. Numeric rows (Pulse, Weight) arrive
      // as numericValue next to an EMPTY stringValue, which used to blank them
      // while a plain length check still passed.
      for (const fs of result) {
        expect(fs.readings.length).toBeGreaterThan(0)
        for (const r of fs.readings) expect(r.value).not.toBe('')
      }
      expect(result.find(f => f.name === 'Weight')!.readings[0]!.value).toBe('260')
      expect(result.find(f => f.name === 'Pulse')!.readings[0]!.value).toBe('88')
      expect(result.find(f => f.name === 'Blood Pressure')!.readings[0]!.value).toBe('145/95')
    }, 10_000)

    it('getInsurance returns insurance data', async () => {
      const result = await getInsurance(session)
      expect(result).toBeDefined()
      expect(Array.isArray(result.coverages)).toBe(true)
      expect(result.coverages.length).toBeGreaterThan(0)
      expect(result.hasCoverages).toBe(true)
    }, 10_000)

    it('getCareTeam returns internal and external providers', async () => {
      const result = await getCareTeam(session)
      expect(result.externalProvidersUnavailable).toBe(false)
      const pcp = result.members.find(m => m.relation === 'Primary Care Provider')
      expect(pcp?.name).toBeTruthy()
      expect(pcp?.specialty).toBeTruthy()
      expect(pcp?.isExternal).toBe(false)
      expect(result.members.some(m => m.isExternal)).toBe(true)

      // A real care team is not all clinicians: one instance listed the
      // patient's insurance payer, with no NPI and no specialty.
      const payer = result.members.find(m => m.relation === 'Payer')
      expect(payer?.name).toBeTruthy()
      expect(payer?.nationalProviderId).toBe('')
      expect(payer?.specialty).toBe('')
    }, 10_000)

    it('getReferrals returns referrals', async () => {
      const result = await getReferrals(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getMedicalHistory returns structured history', async () => {
      const result = await getMedicalHistory(session)
      expect(result).toBeDefined()
      expect(result.medicalHistory).toBeDefined()
      expect(result.surgicalHistory).toBeDefined()
      expect(result.familyHistory).toBeDefined()
      expect(Array.isArray(result.medicalHistory.diagnoses)).toBe(true)
      expect(Array.isArray(result.surgicalHistory.surgeries)).toBe(true)
      expect(Array.isArray(result.familyHistory.familyMembers)).toBe(true)
    }, 10_000)

    it('getPreventiveCare returns one item per screening, none run together', async () => {
      const result = await getPreventiveCare(session)
      expect(result).toEqual([
        { name: 'Colonoscopy', status: 'overdue', overdueSince: '01/01/2024', notDueUntil: '', previouslyDone: [], completedDate: '' },
        { name: 'Influenza Vaccine', status: 'not_due', overdueSince: '', notDueUntil: '10/01/2026', previouslyDone: [], completedDate: '' },
        { name: 'Lipid Panel', status: 'completed', overdueSince: '', notDueUntil: '', previouslyDone: [], completedDate: '01/10/2026' },
      ])
    }, 10_000)

    it('getLetters returns letters sorted newest-first with undated last', async () => {
      const result = await getLetters(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(3)

      // Fake-mychart serves these in [Nov-2025, undated, Jan-2026] order.
      // The scraper must reorder them: newest first, undated tail.
      expect(result[0]!.dateISO).toBe('2026-01-10T16:00:00Z')
      expect(result[0]!.reason).toContain('Annual Physical')
      expect(result[1]!.dateISO).toBe('2025-11-20T16:00:00Z')
      expect(result[1]!.reason).toContain('ER Visit')
      expect(result[2]!.dateISO).toBe('')
      expect(result[2]!.reason).toContain('Sector 7G')
    }, 10_000)

    it('getEmergencyContacts returns contacts', async () => {
      const result = await getEmergencyContacts(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      expect(result[0]!.name).toBe('Marge Simpson')
      expect(result[0]!.id).toBeDefined()
    }, 10_000)

    it('addEmergencyContact adds a new contact', async () => {
      const result = await addEmergencyContact(session, {
        name: 'Ned Flanders',
        relationshipType: 'Neighbor',
        phoneNumber: '(555) 636-2900',
      })
      expect(result.success).toBe(true)

      const contacts = await getEmergencyContacts(session)
      const ned = contacts.find(c => c.name === 'Ned Flanders')
      expect(ned).toBeDefined()
      expect(ned!.relationshipType).toBe('Neighbor')
      expect(ned!.phoneNumber).toBe('(555) 636-2900')
    }, 10_000)

    it('updateEmergencyContact updates an existing contact', async () => {
      const contacts = await getEmergencyContacts(session)
      const barney = contacts.find(c => c.name === 'Barney Gumble')
      expect(barney).toBeDefined()

      const result = await updateEmergencyContact(session, {
        id: barney!.id!,
        phoneNumber: '(555) 999-0000',
      })
      expect(result.success).toBe(true)

      const updated = await getEmergencyContacts(session)
      const updatedBarney = updated.find(c => c.name === 'Barney Gumble')
      expect(updatedBarney!.phoneNumber).toBe('(555) 999-0000')
    }, 10_000)

    it('removeEmergencyContact removes a contact', async () => {
      const contacts = await getEmergencyContacts(session)
      const ned = contacts.find(c => c.name === 'Ned Flanders')
      expect(ned).toBeDefined()

      const result = await removeEmergencyContact(session, ned!.id!)
      expect(result.success).toBe(true)

      const after = await getEmergencyContacts(session)
      expect(after.find(c => c.name === 'Ned Flanders')).toBeUndefined()
    }, 10_000)

    it('getGoals returns goals', async () => {
      const result = await getGoals(session)
      expect(result).toBeDefined()
      expect(Array.isArray(result.careTeamGoals)).toBe(true)
      expect(Array.isArray(result.patientGoals)).toBe(true)
      expect(result.careTeamGoals.length).toBeGreaterThan(0)
      expect(result.patientGoals.length).toBeGreaterThan(0)
    }, 10_000)

    it('getDocuments returns documents', async () => {
      const result = await getDocuments(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getUpcomingOrders returns orders', async () => {
      const result = await getUpcomingOrders(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getQuestionnaires returns questionnaires', async () => {
      const result = await getQuestionnaires(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getCareJourneys returns care journeys', async () => {
      const result = await getCareJourneys(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getActivityFeed returns feed items', async () => {
      const result = await getActivityFeed(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getEducationMaterials returns materials', async () => {
      const result = await getEducationMaterials(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    it('getEhiExportTemplates returns templates', async () => {
      const result = await getEhiExportTemplates(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 10_000)

    // What a consumer actually reads off a visit. These came back as empty
    // strings on every row (the data was only in PrimaryDate and in keys Epic
    // doesn't have), so a reader of the obvious name saw a blank and concluded
    // the patient had nothing scheduled — and `expect(result).toBeDefined()` on
    // the container is what let that through. So assert on the row.
    //
    // Only that the route serves them, not that they agree with each other:
    // the fixture's internal consistency is owned by
    // fake-mychart/src/data/__tests__/visits.unit.test.ts, which can check it
    // without a second hand-written date parser living here.
    const DISPLAY_FIELDS = [
      'PrimaryDate', 'Date', 'Time', 'ShortDate', 'VisitTypeName',
      'PrimaryProviderName', 'Csn',
    ] as const

    function expectVisitIsReadable(visit: Visit) {
      expect(DISPLAY_FIELDS.filter(f => !visit[f])).toEqual([])
      expect(visit.Providers[0]?.Name).toBeTruthy()
      expect(visit.PrimaryDepartment.Name).toBeTruthy()
    }

    it('upcomingVisits returns visits whose display fields carry the appointment', async () => {
      const result = await upcomingVisits(session)
      if (isVisitsScrapeError(result)) throw new Error(`upcomingVisits errored: ${result.error}`)

      const visits = [...result.InProgressVisits, ...result.NextNDaysVisits, ...result.LaterVisitsList]
      expect(visits.length).toBeGreaterThan(0)
      for (const visit of visits) expectVisitIsReadable(visit)
    }, 10_000)

    it('pastVisits returns visits whose display fields carry the encounter', async () => {
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      const result = await pastVisits(session, twoYearsAgo)
      if (isVisitsScrapeError(result)) throw new Error(`pastVisits errored: ${result.error}`)

      const visits = Object.values(result.List).flatMap(org => org.List)
      expect(visits.length).toBeGreaterThan(0)
      for (const visit of visits) expectVisitIsReadable(visit)
    }, 10_000)

    // The fake enforces the WebAuthn signature counter the way real MyChart
    // does: each passkey assertion must present a counter strictly greater than
    // the last accepted one. This proves (a) the enforcement, and (b) that the
    // shared passkeyLoginWithCounterRetry recovers when the stored counter has
    // fallen behind the server (the bug behind the passkey-login failures shared
    // by the CLI and the Expo app).
    it('enforces the passkey signature counter and recovers via retry', async () => {
      // Register a fresh passkey using the password-authenticated session.
      const credential = await setupPasskey(session)
      expect(credential).not.toBeNull()
      const cred = credential!
      expect(cred.signCount).toBe(0)

      // First login advances the server's counter to 1 (assertion sends 0+1).
      const first = await myChartPasskeyLogin({ hostname: HOST, credential: { ...cred }, protocol: 'http' })
      expect(first.state).toBe('logged_in')

      // A stale credential (counter reset to 0) replays counter 1, which the
      // server has already seen — must be rejected.
      const replay = await myChartPasskeyLogin({ hostname: HOST, credential: { ...cred, signCount: 0 }, protocol: 'http' })
      expect(replay.state).toBe('invalid_login')

      // The retry helper bumps the counter (sends 2 > 1) and recovers, leaving
      // the credential at the accepted value for the caller to persist.
      const retryCred = { ...cred, signCount: 0 }
      const recovered = await passkeyLoginWithCounterRetry(
        (c) => myChartPasskeyLogin({ hostname: HOST, credential: c, protocol: 'http' }),
        retryCred,
      )
      expect(recovered.state).toBe('logged_in')
      expect(retryCred.signCount).toBe(2)
    }, 15_000)

    // Regression test for issue #189: pastVisits must follow MyChart's
    // LoadPast pagination (HasMoreData + SerializedIndex) rather than stopping
    // after the first page. The fake serves 22 visits at the real MyChart page
    // size of 10, so a correct implementation walks 3 pages and returns all of
    // them. We pass a far-past cutoff so the date window never short-circuits the
    // loop — this isolates the pagination behaviour and keeps the count stable
    // regardless of when the test runs.
    it('pastVisits paginates past the first page and returns the full history', async () => {
      const longAgo = new Date('2000-01-01T00:00:00Z')
      const result = await pastVisits(session, longAgo)

      if ('error' in result) throw new Error(`pastVisits errored: ${result.error}`)
      expect(result.List).toBeDefined()

      const allVisits = Object.values(result.List).flatMap(org => org.List)
      // 22 fixture visits — far more than a single 10-visit page would yield.
      expect(allVisits.length).toBe(22)

      // The oldest visit (CSN-HOMER-023, only reachable on the third page)
      // confirms we didn't stop early at the first or second page.
      const csns = allVisits.map(v => v.Csn)
      expect(csns).toContain('CSN-HOMER-023')

      // No org should still be flagged as having more data once we've drained it.
      expect(Object.values(result.List).every(org => !org.HasMoreData)).toBe(true)
    }, 10_000)

    it('getVisitNotes returns the 3 ED notes for the Donut Incident visit', async () => {
      const result = await getVisitNotes(session, 'CSN-HOMER-003')
      expect(result.csn).toBe('CSN-HOMER-003')
      expect(result.lrpId).toBe('LRP-HOMER-003')
      expect(result.depPhoneNumber).toBe('555-0123')
      expect(result.notes.length).toBe(3)
      const titles = result.notes.map(n => n.displayName).sort()
      expect(titles).toEqual(['Discharge Summary', 'ED Provider Note', 'ED Triage Note'])

      // Verify per-note normalization: scraper reads uppercase wire keys
      // (hnoID/hnoDAT/magicID) and emits camelCase. Regression-proof the casing.
      const triage = result.notes.find(n => n.displayName === 'ED Triage Note')!
      expect(triage.hnoId).toBe('HNO-HOMER-003-A')
      expect(triage.hnoDat).toBe('67890')
      expect(triage.iso).toBe('2025-11-20T14:15:00Z')
      expect(triage.isAddendum).toBe(false)
      expect(triage.isNoteSensitive).toBe(false)
      expect(triage.providerName).toBe('Nick Riviera, MD')
      expect(triage.providerMagicId).toBe('PROV-NICK')
    }, 10_000)

    it('getVisitNotes returns an empty list for a visit with no notes', async () => {
      const result = await getVisitNotes(session, 'CSN-HOMER-004')
      expect(result.csn).toBe('CSN-HOMER-004')
      expect(result.notes.length).toBe(0)
    }, 10_000)

    it('getNoteContent returns the ED Provider note body', async () => {
      const notes = await getVisitNotes(session, 'CSN-HOMER-003')
      const provNote = notes.notes.find(n => n.displayName === 'ED Provider Note')
      expect(provNote).toBeDefined()
      const content = await getNoteContent(session, {
        csn: 'CSN-HOMER-003',
        lrpId: notes.lrpId,
        hnoId: provNote!.hnoId,
        hnoDat: provNote!.hnoDat,
      })
      expect(content.contentHtml).toContain('Nick Riviera')
      expect(content.contentHtml).toContain('gastric distention')
      expect(content.contentCss).toBe('')
    }, 10_000)

    it('getVisitAVS returns the AVS for the annual physical', async () => {
      const result = await getVisitAVS(session, 'CSN-HOMER-002')
      expect(result.contentHtml).toContain('After Visit Summary')
      expect(result.contentHtml).toContain('Hibbert')
      expect(result.contentHtml).toContain('Annual Physical')
      expect(result.contentCss).toBe('')
    }, 10_000)

    it('getVisitAVS returns the radiation-screening AVS for CSN-HOMER-004', async () => {
      const result = await getVisitAVS(session, 'CSN-HOMER-004')
      expect(result.contentHtml).toContain('Radiation Exposure Screening')
      expect(result.contentHtml).toContain('Sector 7G')
      expect(result.contentCss).toBe('')
    }, 10_000)

    it('listLabResults returns lab results', async () => {
      const result = await listLabResults(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 30_000)

    it('listLabResults returns distinct details per lab order, not one panel repeated', async () => {
      const result = await listLabResults(session)

      const names = result.map(r => r.orderName)
      expect(names).toContain('Comprehensive Metabolic Panel')
      expect(names).toContain('Lipid Panel')
      expect(names).toContain('Complete Blood Count')

      const cmp = result.find(r => r.orderName === 'Comprehensive Metabolic Panel')
      const lipid = result.find(r => r.orderName === 'Lipid Panel')
      const cbc = result.find(r => r.orderName === 'Complete Blood Count')
      expect(cmp!.key).toBe('RES-CMP')
      expect(lipid!.key).toBe('RES-LIPID')
      expect(cbc!.key).toBe('RES-CBC')

      const componentNames = (r: typeof cmp) => r!.results[0]!.resultComponents.map(c => c.componentInfo.name)
      expect(componentNames(cmp)).toContain('Glucose')
      expect(componentNames(lipid)).toContain('Total Cholesterol')
      expect(componentNames(cbc)).toContain('Hemoglobin')
    }, 30_000)

    it('listConversations returns conversations, inlining only the newest page of each', async () => {
      const result = await listConversations(session)
      expect(result).toBeDefined()
      const conversations = result!.conversations!
      expect(conversations.length).toBeGreaterThan(0)

      // Real MyChart inlines at most five messages per thread and flags the
      // rest with hasMoreMessages; the long fixture thread is the one that
      // makes a client page.
      const long = conversations.find(c => c.hthId === 'CONV-003')!
      expect(long.messages).toHaveLength(5)
      expect(long.hasMoreMessages).toBe(true)
      const short = conversations.find(c => c.hthId === 'CONV-001')!
      expect(short.hasMoreMessages).toBe(false)

      // Names live in the users / viewers maps, never on the message itself.
      expect(long.messages!.every(m => (m.author?.displayName ?? '') === '')).toBe(true)
    }, 10_000)

    it('getConversationMessages pages past the listing to return the whole thread', async () => {
      const result = await getConversationMessages(session, 'CONV-003')

      expect(result.conversationId).toBe('CONV-003')
      expect(result.subject).toBe('Back pain after the bowling tournament')
      // Eight messages, five to a page — the listing alone would have shown five.
      expect(result.messages.map(m => m.messageId)).toEqual([
        'MSG-010', 'MSG-011', 'MSG-012', 'MSG-013', 'MSG-014', 'MSG-015', 'MSG-016', 'MSG-017',
      ])
      expect(result.messages.every((m, i) => i === 0 || result.messages[i - 1]!.sentDate <= m.sentDate)).toBe(true)

      // Sender names come from the users / viewers maps, with the thread's
      // userOverrideNames winning for the imaging department.
      expect(result.messages[0]!.senderName).toBe('Homer Simpson')
      expect(result.messages[0]!.isFromPatient).toBe(true)
      expect(result.messages[1]!.senderName).toBe('Julius Hibbert, MD')
      expect(result.messages[1]!.isFromPatient).toBe(false)
      expect(result.messages[4]!.senderName).toBe('Springfield Spine Clinic')
      expect(result.messages.every(m => m.messageBody !== '' && m.sentDate !== '')).toBe(true)
    }, 15_000)

    it('getConversationMessages returns a short thread in one page', async () => {
      const result = await getConversationMessages(session, 'CONV-002')
      expect(result.subject).toBe('Discount Surgery Consultation')
      expect(result.messages.map(m => m.messageId)).toEqual(['MSG-004', 'MSG-005'])
    }, 10_000)

    // GetConversationDetails answers an unknown id with 200 and a literal null,
    // not an error status — so this is the case a status-only check waves
    // through and then reports as a conversation with nothing in it.
    it('getConversationMessages refuses an unknown conversation id rather than reporting it empty', async () => {
      await expect(getConversationMessages(session, 'CONV-DOES-NOT-EXIST')).rejects.toThrow(
        /No conversation CONV-DOES-NOT-EXIST/,
      )
    }, 10_000)

    it('getBillingHistory returns billing data', async () => {
      const result = await getBillingHistory(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    }, 30_000)

    it('requestMedicationRefill succeeds', async () => {
      const result = await requestMedicationRefill(session, 'FAKE-MED-KEY-001')
      expect(result.success).toBe(true)
    }, 10_000)

    it('getImagingResults returns X-ray and CT studies with report text', async () => {
      const result = await getImagingResults(session)
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThanOrEqual(2)

      // X-ray result
      const xray = result.find(r => r.orderName.includes('XR'))
      expect(xray).toBeDefined()
      expect(xray!.reportText).toContain('Calvarium')
      expect(xray!.fdiContext).toBeDefined()
      expect(xray!.fdiContext!.fdi).toBe('FDI-XRAY-001')
      expect(xray!.samlUrl).toBeDefined()

      // CT result
      const ct = result.find(r => r.orderName.includes('CT'))
      expect(ct).toBeDefined()
      expect(ct!.reportText).toContain('crayon')
      expect(ct!.fdiContext).toBeDefined()
      expect(ct!.fdiContext!.fdi).toBe('FDI-CT-001')
      expect(ct!.samlUrl).toBeDefined()
    }, 30_000)

    it('followSamlChain reaches eUnity viewer', async () => {
      // Get imaging result with FDI context
      const results = await getImagingResults(session)
      const xray = results.find(r => r.fdiContext)
      expect(xray?.samlUrl).toBeDefined()

      const viewerSession = await followSamlChain(session, xray!.samlUrl!)
      expect(viewerSession).not.toBeNull()
      expect(viewerSession!.viewerUrl).toContain('/e/viewer')
      // jsessionId may be empty if Set-Cookie isn't propagated via fetch
      expect(viewerSession!.jsessionId).toBeDefined()
      // Viewer body should contain study params
      expect(viewerSession!.viewerBody).toContain('accessionNumber')
    }, 30_000)

    it('downloadImagingStudyDirect downloads X-ray CLO image data', async () => {
      const results = await getImagingResults(session)
      const xray = results.find(r => r.fdiContext && r.orderName.includes('XR'))
      expect(xray?.fdiContext).toBeDefined()

      const result = await downloadImagingStudyDirect(
        session,
        xray!.fdiContext!,
        'Homer Skull XRay',
        '/tmp/fake-mychart-test-images',
        { skipFileWrite: true },
      )

      expect(result.studyName).toBe('Homer Skull XRay')
      expect(result.errors).toHaveLength(0)
      expect(result.images.length).toBeGreaterThan(0)
      const img = result.images[0]
      expect(img!.format).toBe('CLHAAR')
      expect(img!.pixelData).toBeDefined()
      expect(img!.pixelData!.length).toBeGreaterThan(0)
    }, 60_000)

    it('downloadImagingStudyDirect downloads CT multi-slice images', async () => {
      const results = await getImagingResults(session)
      const ct = results.find(r => r.fdiContext && r.orderName.includes('CT'))
      expect(ct?.fdiContext).toBeDefined()

      const result = await downloadImagingStudyDirect(
        session,
        ct!.fdiContext!,
        'Homer CT Head',
        '/tmp/fake-mychart-test-ct',
        { skipFileWrite: true },
      )

      expect(result.studyName).toBe('Homer CT Head')
      expect(result.errors).toHaveLength(0)
      // CT should have multiple images (multi-slice)
      expect(result.images.length).toBeGreaterThan(2)
      // All should be CLHAAR format
      for (const img of result.images) {
        expect(img.format).toBe('CLHAAR')
        expect(img.pixelData).toBeDefined()
        expect(img.pixelData!.length).toBeGreaterThan(0)
      }
      // Should have multiple series
      expect(result.seriesList).toBeDefined()
      expect(result.seriesList!.length).toBeGreaterThanOrEqual(2)
      // The fake mirrors real eUnity: the study metadata carries a
      // "SeriesSelector" pseudo-series (the viewer's UI construct), but its
      // instances answer CLOERROR and must never come back as images.
      const pseudo = result.seriesList!.find((s) => s.description === 'SeriesSelector')
      expect(pseudo).toBeDefined()
      expect(pseudo!.instanceCount).toBe(3)
      for (const img of result.images) {
        expect(img.seriesDescription).not.toBe('SeriesSelector')
      }
    }, 60_000)

    it('CT slices carry per-instance wrappers that sort them anatomically', async () => {
      const results = await getImagingResults(session)
      const ct = results.find(r => r.fdiContext && r.orderName.includes('CT'))
      const result = await downloadImagingStudyDirect(
        session,
        ct!.fdiContext!,
        'Homer CT Head',
        '/tmp/fake-mychart-test-ct-order',
        { skipFileWrite: true },
      )
      expect(result.errors).toHaveLength(0)

      // A real eUnity server answers CLOWRAPPER per *instance*, not per
      // series, so each slice carries its own position.
      const axialBase = '1.3.51.0.7.100000001.11111.22222.33333.44444.55555.66666'
      const axial = result.images.filter(i => i.seriesDescription === 'AXIAL')
      expect(axial.length).toBe(5)
      expect(new Set(axial.map(i => Buffer.from(i.wrapperData!).toString('base64'))).size).toBe(5)

      // The fake serves AXIAL z DESCENDING against instance number, so
      // anatomical order is the reverse of instance order — a sort that
      // silently no-ops (wrappers stop decoding, positions stop being read)
      // fails right here.
      const sortedAxial = sortImagesByPatientPosition(axial)
      expect(sortedAxial.map(i => i.instanceUID)).toEqual(
        [5, 4, 3, 2, 1].map(n => `${axialBase}.${n}`),
      )
      expect(sortedAxial.map(i => readPatientPosition(i.wrapperData!)!.z)).toEqual([40, 80, 120, 160, 200])

      // BONE RECON runs z ASCENDING with instance number — the other
      // direction, where a correct sort is a no-op. Asserting it too is what
      // separates "sorted anatomically" from "reversed unconditionally".
      const boneBase = '1.3.51.0.7.200000002.77777.88888.99999.11111.22222.33333'
      const bone = result.images.filter(i => i.seriesDescription === 'BONE RECON')
      expect(bone.length).toBe(3)
      expect(sortImagesByPatientPosition(bone).map(i => i.instanceUID)).toEqual(
        [1, 2, 3].map(n => `${boneBase}.${n}`),
      )

      // SCOUT is a projection image served from the shared per-series wrapper
      // — no patient position, and the sort must leave it alone.
      const scout = result.images.find(i => i.seriesDescription === 'SCOUT')
      expect(readPatientPosition(scout!.wrapperData!)).toBeNull()
    }, 60_000)

    it('CT wrappers decode the constructs only real wrappers carry', async () => {
      // The AXIAL wrappers additionally carry a byte-array VOI LUT,
      // externalizable ArrayCollection overlays, and ImagePhaseInfo -1
      // sentinels. Each is a decode path the flat scalar wrappers never
      // reach, and all three must survive the strict reader.
      const results = await getImagingResults(session)
      const ct = results.find(r => r.fdiContext && r.orderName.includes('CT'))
      const result = await downloadImagingStudyDirect(
        session,
        ct!.fdiContext!,
        'Homer CT Head',
        '/tmp/fake-mychart-test-ct-rich',
        { skipFileWrite: true },
      )

      const axial = result.images.find(i => i.seriesDescription === 'AXIAL')!
      const tree = new Amf3Reader(
        inflateSync(Buffer.from(axial.wrapperData!).subarray(16)),
      ).readValue() as {
        voiLut: { lut: unknown; elements: number }
        annotationOverlay: { bottomLeft: { __class: string; value: string[] } }
        imagePhaseInfo: { inStackPositionNumber: number; numberOfTemporalPositions: number }
      }

      // VOI LUT table arrives as an AMF3 byte array.
      expect(Buffer.isBuffer(tree.voiLut.lut)).toBe(true)
      expect(tree.voiLut.elements).toBe(4096)
      // Overlays arrive inside externalizable ArrayCollection nodes.
      expect(tree.annotationOverlay.bottomLeft.__class).toBe('flex.messaging.io.ArrayCollection')
      expect(tree.annotationOverlay.bottomLeft.value).toContain('SE #: %SERIES_NUMBER%')
      // Sentinels sign-extend to -1, not 536870911.
      expect(tree.imagePhaseInfo.inStackPositionNumber).toBe(-1)
      expect(tree.imagePhaseInfo.numberOfTemporalPositions).toBe(-1)

      // And parseWrapper still reads the display metadata through all of it.
      expect(parseWrapper(Buffer.from(axial.wrapperData!)).photometric).toBe('MONOCHROME2')
    }, 60_000)
  })
}

// Leave the server in its default shape for anything that runs after this file.
afterAll(async () => {
  await setMountMode(HOST, 'prefixed')
})
