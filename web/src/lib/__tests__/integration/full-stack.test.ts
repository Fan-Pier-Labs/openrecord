/**
 * Full-stack integration tests: PostgreSQL + fake-mychart + scrapers.
 *
 * Requires services to be running:
 *   docker compose up -d
 *
 * Or run manually with env vars:
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/mychart_test \
 *   ENCRYPTION_KEY=000...001 \
 *   BETTER_AUTH_SECRET=ci-test-secret-32chars-minimum-length \
 *   FAKE_MYCHART_HOST=localhost:4000 \
 *   cd web && bun test src/lib/__tests__/integration/full-stack.test.ts
 *
 * Tests soft-skip (return early) when DATABASE_URL is not set, so they
 * are safe to include in the regular test suite.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Pool } from 'pg'
import { createMyChartInstance, getMyChartInstances } from '../../db'
import { myChartUserPassLogin } from '../../mychart/login'
import { getMyChartProfile } from '../../mychart/profile'
import { getMedications } from '../../mychart/medications'
import { listLabResults } from '../../mychart/labs/labResults'
import { listConversations } from '../../mychart/messages/conversations'

const DATABASE_URL = process.env.DATABASE_URL
const FAKE_MYCHART_HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'
const hasServices = !!DATABASE_URL

let pool: Pool
let testUserId: string
let instanceId: string

beforeAll(async () => {
  if (!hasServices) return

  pool = new Pool({ connectionString: DATABASE_URL, ssl: false })
  testUserId = crypto.randomUUID()

  // Insert a test user directly. BetterAuth creates the "user" table via
  // runMigrations() on web startup. Column names follow snake_case convention.
  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, NOW(), NOW())`,
    [testUserId, 'CI Test User', `ci-${testUserId}@integration.test`]
  )
}, 30_000)

afterAll(async () => {
  if (!hasServices) return
  // ON DELETE CASCADE on mychart_instances means this cleans up everything
  await pool.query('DELETE FROM "user" WHERE id = $1', [testUserId])
  await pool.end()
})

describe('full-stack integration', () => {
  describe('credential storage (PostgreSQL + encryption)', () => {
    it('creates a mychart instance with encrypted credentials', async () => {
      if (!hasServices) return
      const instance = await createMyChartInstance(testUserId, {
        hostname: FAKE_MYCHART_HOST,
        username: 'homer',
        password: 'donuts123',
      })
      instanceId = instance.id
      expect(instance.hostname).toBe(FAKE_MYCHART_HOST)
      expect(instance.username).toBe('homer')
      // Password should be returned decrypted
      expect(instance.password).toBe('donuts123')
      expect(instance.userId).toBe(testUserId)
      expect(instance.totpSecret).toBeNull()
    }, 15_000)

    it('retrieves and decrypts credentials from the database', async () => {
      if (!hasServices) return
      const instances = await getMyChartInstances(testUserId)
      expect(instances.length).toBeGreaterThanOrEqual(1)
      const found = instances.find(i => i.id === instanceId)
      expect(found).toBeDefined()
      // Round-trip: encrypt on write, decrypt on read
      expect(found!.password).toBe('donuts123')
      expect(found!.hostname).toBe(FAKE_MYCHART_HOST)
    }, 10_000)
  })

  describe('scraper integration (fake-mychart + stored credentials)', () => {
    it('logs into fake-mychart using stored credentials', async () => {
      if (!hasServices) return
      const [instance] = await getMyChartInstances(testUserId)
      const result = await myChartUserPassLogin({
        hostname: instance.hostname,
        user: instance.username,
        pass: instance.password,
        protocol: 'http',
      })
      expect(result.state).toBe('logged_in')
    }, 30_000)

    it('getMyChartProfile returns Homer Simpson', async () => {
      if (!hasServices) return
      const [instance] = await getMyChartInstances(testUserId)
      const loginResult = await myChartUserPassLogin({
        hostname: instance.hostname,
        user: instance.username,
        pass: instance.password,
        protocol: 'http',
      })
      const profile = await getMyChartProfile(loginResult.mychartRequest)
      expect(profile).not.toBeNull()
      expect(profile!.name).toBe('Homer Jay Simpson')
      expect(profile!.dob).toBe('05/12/1956')
      expect(profile!.mrn).toBe('742')
      expect(profile!.pcp).toBe('Dr. Julius Hibbert, MD')
    }, 30_000)

    it('getMedications returns Homer medications', async () => {
      if (!hasServices) return
      const [instance] = await getMyChartInstances(testUserId)
      const loginResult = await myChartUserPassLogin({
        hostname: instance.hostname,
        user: instance.username,
        pass: instance.password,
        protocol: 'http',
      })
      const result = await getMedications(loginResult.mychartRequest)
      expect(result).toBeDefined()
      expect(Array.isArray(result.medications)).toBe(true)
      expect(result.medications.length).toBeGreaterThan(0)
      const names = result.medications.map((m: { name: string }) => m.name)
      expect(names.some((n: string) => n.includes('Duff Beer Extract'))).toBe(true)
    }, 30_000)

    it('listLabResults returns lab results', async () => {
      if (!hasServices) return
      const [instance] = await getMyChartInstances(testUserId)
      const loginResult = await myChartUserPassLogin({
        hostname: instance.hostname,
        user: instance.username,
        pass: instance.password,
        protocol: 'http',
      })
      const results = await listLabResults(loginResult.mychartRequest)
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
    }, 30_000)

    it('listConversations returns message conversations', async () => {
      if (!hasServices) return
      const [instance] = await getMyChartInstances(testUserId)
      const loginResult = await myChartUserPassLogin({
        hostname: instance.hostname,
        user: instance.username,
        pass: instance.password,
        protocol: 'http',
      })
      const result = await listConversations(loginResult.mychartRequest)
      expect(result).toBeDefined()
    }, 30_000)
  })
})
