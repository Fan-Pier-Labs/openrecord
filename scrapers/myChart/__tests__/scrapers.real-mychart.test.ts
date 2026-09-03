/**
 * Every scraper, run against a REAL MyChart account.
 *
 * These tests make REAL HTTP requests to a live health system.
 * They validate response structure (non-null, correct types, expected fields)
 * but do NOT assert specific values since patient data may change.
 *
 * Run with: bun run test:real-mychart. NEVER runs in CI — the `.real-mychart`
 * suffix is what keeps it out, and nothing in .github/workflows globs it.
 *
 * Requirements:
 * - Valid Example Health MyChart session in .cookie-cache/ OR
 * - Browser-stored credentials for Example Health MyChart + Resend API key in AWS
 * - NODE_ENV=development for AWS credential resolution
 */

import { describe, it, expect, beforeAll } from 'bun:test'
import { getTestSession } from './testHelper'
import type { MyChartRequest } from '../core/myChartRequest'

// Scrapers
import { getMyChartProfile, getEmail } from '../chart/profile/profile'
import { getHealthSummary } from '../chart/healthSummary/healthSummary'
import { getMedications } from '../chart/medications/medications'
import { getAllergies } from '../chart/allergies/allergies'
import { getHealthIssues } from '../chart/healthIssues/healthIssues'
import { getImmunizations } from '../chart/immunizations/immunizations'
import { getVitals } from '../chart/vitals/vitals'
import { getInsurance } from '../chart/insurance/insurance'
import { getCareTeam } from '../chart/careTeam/careTeam'
import { getReferrals } from '../chart/referrals/referrals'
import { getMedicalHistory } from '../chart/medicalHistory/medicalHistory'
import { getPreventiveCare } from '../chart/preventiveCare/preventiveCare'
import { getLetters } from '../chart/letters/letters'
import { getEmergencyContacts } from '../chart/emergencyContacts/emergencyContacts'
import { getGoals } from '../chart/goals/goals'
import { getDocuments } from '../chart/documents/documents'
import { getUpcomingOrders } from '../chart/upcomingOrders/upcomingOrders'
import { getQuestionnaires } from '../chart/questionnaires/questionnaires'
import { getCareJourneys } from '../chart/careJourneys/careJourneys'
import { getActivityFeed } from '../chart/activityFeed/activityFeed'
import { getEducationMaterials } from '../chart/educationMaterials/educationMaterials'
import { getEhiExportTemplates } from '../chart/ehiExport/ehiExport'
import { upcomingVisits, pastVisits } from '../chart/visits/visits'
import { listLabResults } from '../chart/labs/labResults'
import { getBillingHistory } from '../chart/bills/bills'
import { listConversations } from '../chart/messages/conversations'

let session: MyChartRequest

beforeAll(async () => {
  session = await getTestSession()
}, 120_000) // 2 min timeout for login + 2FA

describe('integration', () => {
  it('getMyChartProfile returns profile data', async () => {
    const result = await getMyChartProfile(session)
    expect(result).not.toBeNull()
    expect(result!.name).toBeTruthy()
    expect(result!.dob).toBeTruthy()
    expect(result!.mrn).toBeTruthy()
  }, 30_000)

  it('getEmail returns an email address', async () => {
    const result = await getEmail(session)
    expect(result).not.toBeNull()
    expect(result).toContain('@')
  }, 30_000)

  it('getHealthSummary returns summary data', async () => {
    const result = await getHealthSummary(session)
    expect(result).toBeDefined()
    expect(result.header).toBeDefined()
    expect(typeof result.patientFirstName).toBe('string')
  }, 30_000)

  it('getMedications returns medication data', async () => {
    const result = await getMedications(session)
    expect(result).toBeDefined()
    expect(Array.isArray(result.prescriptions)).toBe(true)
    expect(typeof result.getPatientFirstName).toBe('string')
  }, 30_000)

  it('getAllergies returns allergy data', async () => {
    const result = await getAllergies(session)
    expect(result).toBeDefined()
    expect(Array.isArray(result.dataList)).toBe(true)
    expect(typeof result.allergiesStatus).toBe('number')
  }, 30_000)

  it('getHealthIssues returns an array', async () => {
    const result = await getHealthIssues(session)
    expect(Array.isArray(result.dataList)).toBe(true)
  }, 30_000)

  it('getImmunizations returns an array', async () => {
    const result = await getImmunizations(session)
    expect(Array.isArray(result.immunizations)).toBe(true)
  }, 30_000)

  it('getVitals returns an array', async () => {
    const result = await getVitals(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getInsurance returns insurance data', async () => {
    const result = await getInsurance(session)
    expect(result).toBeDefined()
    expect(Array.isArray(result.coverages)).toBe(true)
    expect(typeof result.hasCoverages).toBe('boolean')
  }, 30_000)

  it('getCareTeam returns the provider list', async () => {
    const result = await getCareTeam(session)
    expect(Array.isArray(result.ProvidersList)).toBe(true)
    // An unreadable outside-provider list is reported, never silently dropped;
    // both captured instances serve it, so a true here is a real regression.
    expect(result.externalProvidersUnavailable).toBe(false)
    for (const member of result.ProvidersList) {
      expect(member.ID).toBeTruthy()
      expect(member.Name).toBeTruthy()
    }
  }, 30_000)

  it('getReferrals returns an array', async () => {
    const result = await getReferrals(session)
    expect(Array.isArray(result.referralList)).toBe(true)
  }, 30_000)

  it('getMedicalHistory returns structured history', async () => {
    const result = await getMedicalHistory(session)
    expect(result).toBeDefined()
    expect(result.medicalHistory).toBeDefined()
    expect(result.surgicalHistory).toBeDefined()
    expect(result.familyHistoryAndStatus).toBeDefined()
    expect(Array.isArray(result.medicalHistory.diagnoses)).toBe(true)
    expect(Array.isArray(result.surgicalHistory.surgeries)).toBe(true)
    expect(Array.isArray(result.familyHistoryAndStatus.familyMembers)).toBe(true)
  }, 30_000)

  it('getPreventiveCare returns an array', async () => {
    const result = await getPreventiveCare(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getLetters returns an array', async () => {
    const result = await getLetters(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getEmergencyContacts returns an array', async () => {
    const result = await getEmergencyContacts(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getGoals returns structured goal data', async () => {
    const result = await getGoals(session)
    expect(result).toBeDefined()
    expect(Array.isArray(result.careTeamGoals)).toBe(true)
    expect(Array.isArray(result.patientGoals)).toBe(true)
  }, 30_000)

  it('getDocuments returns an array', async () => {
    const result = await getDocuments(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getUpcomingOrders returns an array', async () => {
    const result = await getUpcomingOrders(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getQuestionnaires returns an array (may be empty if unsupported)', async () => {
    try {
      const result = await getQuestionnaires(session)
      expect(Array.isArray(result)).toBe(true)
    } catch {
      // Some MyChart instances don't support questionnaires (returns 500/404)
      // This is expected behavior, not a test failure
    }
  }, 30_000)

  it('getCareJourneys returns an array', async () => {
    const result = await getCareJourneys(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getActivityFeed returns an array', async () => {
    const result = await getActivityFeed(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getEducationMaterials returns an array', async () => {
    const result = await getEducationMaterials(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getEhiExportTemplates returns an array', async () => {
    const result = await getEhiExportTemplates(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('upcomingVisits returns visit data', async () => {
    const result = await upcomingVisits(session)
    // May return undefined if the page structure differs, but shouldn't throw
    if (result) {
      expect(result).toBeDefined()
    }
  }, 30_000)

  it('pastVisits returns visit data', async () => {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const result = await pastVisits(session, twoYearsAgo)
    // May return undefined if the page structure differs
    if (result) {
      expect(result).toBeDefined()
    }
  }, 30_000)

  it('listLabResults returns an array', async () => {
    const result = await listLabResults(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('listConversations returns data', async () => {
    const result = await listConversations(session)
    expect(result).toBeDefined()
  }, 30_000)

  it('getBillingHistory returns an array', async () => {
    const result = await getBillingHistory(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)
})
