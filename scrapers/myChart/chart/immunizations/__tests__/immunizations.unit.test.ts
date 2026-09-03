import { describe, it, expect, mock } from 'bun:test'
import { getImmunizations, fetchImmunizationsRaw, immunizationsProcessor } from '../immunizations'
import { MyChartRequest } from '../../../core/myChartRequest'
import { MissingVerificationTokenError } from '../../../core/util'
import { renderOutput } from '../../../processors/processor'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.transport = mock(async () => {
    const r = responses[i++]
    return new Response(r!.body, { status: 200 })
  })
  return req
}

const TOKEN = { body: '<input name="__RequestVerificationToken" value="t" />' }

describe('getImmunizations', () => {
  it('throws when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    await expect(getImmunizations(req)).rejects.toBeInstanceOf(MissingVerificationTokenError)
  })

  it('flattens immunizations across organizations, lifting the organization name', async () => {
    const req = mockRequest([
      TOKEN,
      {
        body: JSON.stringify({
          organizationImmunizationList: [
            {
              organization: { organizationName: 'Springfield General', logoUrl: 'x' },
              orgImmunizations: [
                { name: 'Influenza', id: 'I1', formattedAdministeredDates: ['10/01/2024', '10/01/2023'] },
                { name: 'Tdap', id: 'I2', formattedAdministeredDates: ['05/01/2019'] },
              ],
              showViewDetailsLink: true,
            },
            { organization: { organizationName: 'Shelbyville Clinic' }, orgImmunizations: [{ name: 'COVID-19', id: 'I3', formattedAdministeredDates: [] }] },
          ],
          immunizationsUrl: '/x',
        }),
      },
    ])
    const result = await getImmunizations(req)
    expect(result.immunizations).toEqual([
      { name: 'Influenza', formattedAdministeredDates: ['10/01/2024', '10/01/2023'], id: 'I1', organizationName: 'Springfield General' },
      { name: 'Tdap', formattedAdministeredDates: ['05/01/2019'], id: 'I2', organizationName: 'Springfield General' },
      { name: 'COVID-19', formattedAdministeredDates: [], id: 'I3', organizationName: 'Shelbyville Clinic' },
    ])
  })

  it('handles a missing organization name and an empty list', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ organizationImmunizationList: [{ orgImmunizations: [{ name: 'X' }] }] }) }])
    expect((await getImmunizations(req)).immunizations[0]).toEqual({ name: 'X', formattedAdministeredDates: [], id: null, organizationName: null })

    const empty = mockRequest([TOKEN, { body: JSON.stringify({ organizationImmunizationList: [] }) }])
    expect(await getImmunizations(empty)).toEqual({ immunizations: [] })
  })

  it('renders every mode from the envelope', async () => {
    const req = mockRequest([TOKEN, { body: JSON.stringify({ organizationImmunizationList: [{ orgImmunizations: [{ name: 'Tdap', id: 'I2', formattedAdministeredDates: ['05/01/2019'] }] }] }) }])
    const raw = await fetchImmunizationsRaw(req)
    expect(raw.requests.map((r) => r.path)).toEqual(['/Clinical/Immunizations', '/api/immunizations/LoadImmunizations'])
    expect(renderOutput(immunizationsProcessor, raw, 'concise')).toBe('\n## immunizations (1)\n\n| name | formattedAdministeredDates |\n| - | - |\n| Tdap | 05/01/2019 |\n'.trimStart())
    expect(renderOutput(immunizationsProcessor, raw, 'standard')).toContain('| id |')
  })
})
