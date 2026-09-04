/**
 * A server error must never read as an empty chart.
 *
 * `fake-mychart`'s `failingEndpoints` knob makes one data endpoint answer with
 * the active release's error surface — the FiveHundred → `/Home/Error?code=14`
 * redirect dance that ends in a **200** HTML page on November 2025, a bare 500
 * on August 2025 — exactly what an unhandled exception in that action produces
 * on a real instance. Every output mode of the capability behind it has to
 * throw the same `MyChartResponseError`; none may render "no allergies on
 * file". The 200-page shape is the one a status check alone would miss, which
 * is why both releases are exercised.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 * Run with: bun run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { myChartUserPassLogin } from '../../auth/login'
import type { MyChartRequest } from '../../core/myChartRequest'
import { MyChartResponseError } from '../../core/rawResponse'
import { OUTPUT_MODES, type OutputMode } from '../../processors/processor'
import { executeCapability } from '../../../../shared/capabilities'
import { resetFakeMyChart, setFailingEndpoints } from './mountMode'

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000'

type EpicVersion = 'November 2025' | 'August 2025'

async function setEpicVersion(version: EpicVersion): Promise<void> {
  const res = await fetch(`http://${HOST}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ epicVersion: version }),
  })
  if (!res.ok) throw new Error(`setEpicVersion failed: ${res.status}`)
}

/** The thrown error, or null when the capability answered. */
async function failureOf(session: MyChartRequest, id: string, mode: OutputMode): Promise<MyChartResponseError | null> {
  return executeCapability(session, id, { mode }).then(
    () => null,
    (err: unknown) => {
      if (!(err instanceof MyChartResponseError)) throw err
      return err
    },
  )
}

describe('a failing data endpoint is an error in every output mode', () => {
  let session: MyChartRequest

  beforeAll(async () => {
    await resetFakeMyChart(HOST)
    const result = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' })
    expect(result.state).toBe('logged_in')
    session = result.mychartRequest
  }, 30_000)

  afterAll(async () => {
    await setFailingEndpoints(HOST, [])
    await setEpicVersion('November 2025')
  })

  // The capabilities whose processors never looked at the status before this.
  // One JSON `/api/*` route and one legacy form-posted one, so both surfaces
  // are covered; `get_allergies` is the example the bug was described with.
  const cases: Array<{ capability: string; endpoint: string; emptyField: string }> = [
    { capability: 'get_allergies', endpoint: 'api/allergies/LoadAllergies', emptyField: 'dataList' },
    { capability: 'get_medications', endpoint: 'api/medications/LoadMedicationsPage', emptyField: 'prescriptions' },
    { capability: 'get_linked_accounts', endpoint: 'Community/Shared/LoadCommunityLinks', emptyField: 'OrgList' },
  ]

  for (const release of ['August 2025', 'November 2025'] as const) {
    describe(`on the ${release} release`, () => {
      beforeAll(() => setEpicVersion(release))

      it('fails the way a real instance does', async () => {
        await setFailingEndpoints(HOST, [cases[0]!.endpoint])
        const res = await session.makeRequest({
          path: `/${cases[0]!.endpoint}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', __RequestVerificationToken: 'tok-test' },
          body: '{}',
        })
        const body = await res.text()
        expect(body).toContain('An error has occurred')
        if (release === 'August 2025') {
          expect(res.status).toBe(500)
        } else {
          // The shape a status check cannot see: the failure was two redirects
          // ago, and what arrived is a 200 page.
          expect(res.status).toBe(200)
          expect(res.url).toMatch(/\/Home\/Error\?code=14$/)
        }
      })

      for (const { capability, endpoint, emptyField } of cases) {
        for (const mode of OUTPUT_MODES) {
          it(`${capability} in ${mode} mode throws MyChartResponseError`, async () => {
            await setFailingEndpoints(HOST, [endpoint])
            const error = await failureOf(session, capability, mode)
            expect(error).toBeInstanceOf(MyChartResponseError)
            expect(error!.path.toLowerCase()).toBe(`/${endpoint.toLowerCase()}`)
            expect(error!.message).toContain('An error has occurred')
            expect(error!.message).toContain('not an empty result')
            if (release === 'August 2025') {
              expect(error!.status).toBe(500)
              expect(error!.message).toContain('HTTP 500')
            } else {
              expect(error!.status).toBe(200)
              expect(error!.message).toMatch(/HTTP 200 from its error page .*\/Home\/Error\?code=14/)
            }
          })
        }

        it(`${capability} answers again once the endpoint is back, with a non-empty ${emptyField}`, async () => {
          await setFailingEndpoints(HOST, [])
          const standard = (await executeCapability(session, capability, { mode: 'json' })) as Record<string, unknown>
          expect(Array.isArray(standard[emptyField])).toBe(true)
          expect((standard[emptyField] as unknown[]).length).toBeGreaterThan(0)
          const concise = (await executeCapability(session, capability, { mode: 'concise' })) as string
          expect(typeof concise).toBe('string')
          expect(concise.length).toBeGreaterThan(0)
        })
      }
    })
  }

  it('a failing token page is the same error, not "no token"', async () => {
    await setFailingEndpoints(HOST, ['Clinical/Allergies'])
    const error = await failureOf(session, 'get_allergies', 'concise')
    expect(error).toBeInstanceOf(MyChartResponseError)
    expect(error!.method).toBe('GET')
    expect(error!.path.toLowerCase()).toBe('/clinical/allergies')
  })

  it('an optional endpoint failing is a reported gap, not a failed read', async () => {
    // Care Everywhere is optional per deployment: the care team is still the
    // care team, flagged as incomplete, when only LoadExternal is down.
    await setFailingEndpoints(HOST, ['Clinical/CareTeam/LoadExternal'])
    const standard = (await executeCapability(session, 'get_care_team', { mode: 'json' })) as Record<string, unknown>
    expect(standard.externalProvidersUnavailable).toBe(true)
    expect((standard.ProvidersList as unknown[]).length).toBeGreaterThan(0)

    // But the payload endpoint failing is a failure.
    await setFailingEndpoints(HOST, ['Clinical/CareTeam/Load'])
    const error = await failureOf(session, 'get_care_team', 'concise')
    expect(error).toBeInstanceOf(MyChartResponseError)
  })
})
