import { describe, it, expect, mock } from 'bun:test'
import { getImmunizations } from '../immunizations'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(responses: Array<{ body: string }>) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  let i = 0
  req.fetchWithCookieJar = mock(async () => {
    const r = responses[i++]
    return new Response(r.body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
  return req
}

describe('getImmunizations', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getImmunizations(req)).toEqual([])
  })

  it('parses immunizations grouped by organization', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          organizationImmunizationList: [
            {
              organization: { organizationName: 'Example Hospital' },
              orgImmunizations: [
                { name: 'COVID-19 Pfizer', id: 'I1', formattedAdministeredDates: ['01/15/2021', '02/15/2021'] },
                { name: 'Influenza', id: 'I2', formattedAdministeredDates: ['10/01/2023'] },
              ],
            },
            {
              organization: { organizationName: 'Example Pharmacy' },
              orgImmunizations: [
                { name: 'Tdap', id: 'I3', formattedAdministeredDates: ['03/20/2019'] },
              ],
            },
          ],
        }),
      },
    ])

    const result = await getImmunizations(req)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({
      name: 'COVID-19 Pfizer',
      id: 'I1',
      administeredDates: ['01/15/2021', '02/15/2021'],
      organizationName: 'Example Hospital',
    })
    expect(result[2].organizationName).toBe('Example Pharmacy')
  })

  it('handles missing organization name', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          organizationImmunizationList: [
            { organization: {}, orgImmunizations: [{ name: 'Flu', id: 'F1', formattedAdministeredDates: [] }] },
          ],
        }),
      },
    ])
    const result = await getImmunizations(req)
    expect(result[0].organizationName).toBe('')
  })

  it('handles empty list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ organizationImmunizationList: [] }) },
    ])
    expect(await getImmunizations(req)).toEqual([])
  })
})
