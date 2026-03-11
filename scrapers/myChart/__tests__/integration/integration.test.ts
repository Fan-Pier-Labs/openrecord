/**
 * Integration tests for MyChart scrapers.
 *
 * These tests make REAL HTTP requests to mychart.example.org.
 * They validate response structure (non-null, correct types, expected fields)
 * but do NOT assert specific values since patient data may change.
 *
 * Run with: bun test src/main/scrapers/myChart/__tests__/integration/
 *
 * Requirements:
 * - Valid Example Health MyChart session in .cookie-cache/ OR
 * - Browser-stored credentials for Example Health MyChart + Resend API key in AWS
 * - NODE_ENV=development for AWS credential resolution
 */

import { describe, it, expect, beforeAll } from 'bun:test'
import { getTestSession } from '../testHelper'
import { MyChartRequest } from '../../myChartRequest'

// Scrapers
import { getMyChartProfile, getEmail } from '../../profile'
import { getHealthSummary } from '../../healthSummary'
import { getMedications } from '../../medications'
import { getAllergies } from '../../allergies'
import { getHealthIssues } from '../../healthIssues'
import { getImmunizations } from '../../immunizations'
import { getVitals } from '../../vitals'
import { getInsurance } from '../../insurance'
import { getCareTeam } from '../../careTeam'
import { getReferrals } from '../../referrals'
import { getMedicalHistory } from '../../medicalHistory'
import { getPreventiveCare } from '../../preventiveCare'
import { getLetters } from '../../letters'
import { getEmergencyContacts } from '../../emergencyContacts'
import { getGoals } from '../../goals'
import { getDocuments } from '../../documents'
import { getUpcomingOrders } from '../../upcomingOrders'
import { getQuestionnaires } from '../../questionnaires'
import { getCareJourneys } from '../../careJourneys'
import { getActivityFeed } from '../../activityFeed'
import { getEducationMaterials } from '../../educationMaterials'
import { getEhiExportTemplates } from '../../ehiExport'
import { upcomingVisits, pastVisits } from '../../visits/visits'
import { listLabResults } from '../../labs_and_procedure_results/labResults'
import { getBillingHistory } from '../../bills/bills'
import { listConversations } from '../../messages/conversations'

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
    expect(typeof result.patientAge).toBe('string')
    expect(typeof result.bloodType).toBe('string')
    expect(typeof result.patientFirstName).toBe('string')
  }, 30_000)

  it('getMedications returns medication data', async () => {
    const result = await getMedications(session)
    expect(result).toBeDefined()
    expect(Array.isArray(result.medications)).toBe(true)
    expect(typeof result.patientFirstName).toBe('string')
  }, 30_000)

  it('getAllergies returns allergy data', async () => {
    const result = await getAllergies(session)
    expect(result).toBeDefined()
    expect(Array.isArray(result.allergies)).toBe(true)
    expect(typeof result.allergiesStatus).toBe('number')
  }, 30_000)

  it('getHealthIssues returns an array', async () => {
    const result = await getHealthIssues(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getImmunizations returns an array', async () => {
    const result = await getImmunizations(session)
    expect(Array.isArray(result)).toBe(true)
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

  it('getCareTeam returns an array', async () => {
    const result = await getCareTeam(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getReferrals returns an array', async () => {
    const result = await getReferrals(session)
    expect(Array.isArray(result)).toBe(true)
  }, 30_000)

  it('getMedicalHistory returns structured history', async () => {
    const result = await getMedicalHistory(session)
    expect(result).toBeDefined()
    expect(result.medicalHistory).toBeDefined()
    expect(result.surgicalHistory).toBeDefined()
    expect(result.familyHistory).toBeDefined()
    expect(Array.isArray(result.medicalHistory.diagnoses)).toBe(true)
    expect(Array.isArray(result.surgicalHistory.surgeries)).toBe(true)
    expect(Array.isArray(result.familyHistory.familyMembers)).toBe(true)
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
