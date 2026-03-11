import { describe, it, expect, mock } from 'bun:test'
import { getEmergencyContacts } from '../emergencyContacts'
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

describe('getEmergencyContacts', () => {
  it('returns empty array when no token found', async () => {
    const req = mockRequest([{ body: '<html></html>' }])
    expect(await getEmergencyContacts(req)).toEqual([])
  })

  it('parses contacts from API response', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      {
        body: JSON.stringify({
          relationships: [
            {
              name: 'Jane Doe',
              relationshipType: 'Spouse',
              phoneNumber: '555-1234',
              isEmergencyContact: true,
            },
          ],
        }),
      },
    ])

    const result = await getEmergencyContacts(req)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'Jane Doe',
      relationshipType: 'Spouse',
      phoneNumber: '555-1234',
      isEmergencyContact: true,
    })
  })

  it('handles missing fields with defaults', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ relationships: [{}] }) },
    ])

    const result = await getEmergencyContacts(req)
    expect(result[0]).toEqual({
      name: '',
      relationshipType: '',
      phoneNumber: '',
      isEmergencyContact: false,
    })
  })

  it('handles empty relationships list', async () => {
    const req = mockRequest([
      { body: '<input name="__RequestVerificationToken" value="t" />' },
      { body: JSON.stringify({ relationships: [] }) },
    ])
    expect(await getEmergencyContacts(req)).toEqual([])
  })
})
