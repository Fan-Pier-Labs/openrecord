import { describe, it, expect, mock } from 'bun:test'
import { getPreventiveCare } from '../preventiveCare'
import { MyChartRequest } from '../myChartRequest'

function mockRequest(body: string) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.fetchWithCookieJar = mock(async () => {
    return new Response(body, { status: 200 })
  }) as typeof req.fetchWithCookieJar
  return req
}

describe('getPreventiveCare', () => {
  it('parses overdue items', async () => {
    const html = `
      <html><body>
        Overdue
        Colonoscopy
        Overdue since 01/01/2023
        Previously done: 03/15/2013
      </body></html>
    `
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      name: 'Colonoscopy',
      status: 'overdue',
      overdueSince: '01/01/2023',
      notDueUntil: '',
      previouslyDone: ['03/15/2013'],
      completedDate: '',
    })
  })

  it('parses not-due items', async () => {
    const html = `
      <html><body>
        Flu Vaccine
        Not due until 10/01/2025
      </body></html>
    `
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Flu Vaccine')
    expect(result[0].status).toBe('not_due')
    expect(result[0].notDueUntil).toBe('10/01/2025')
  })

  it('parses completed items', async () => {
    const html = `
      <html><body>
        Eye Exam
        Completed on 06/15/2024
      </body></html>
    `
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('completed')
    expect(result[0].completedDate).toBe('06/15/2024')
  })

  it('parses multiple previously done dates', async () => {
    const html = `
      <html><body>
        Mammogram
        Overdue since 01/01/2024
        Previously done: 01/01/2022, 01/01/2020, 01/01/2018
      </body></html>
    `
    const result = await getPreventiveCare(mockRequest(html))
    expect(result[0].previouslyDone).toEqual(['01/01/2022', '01/01/2020', '01/01/2018'])
  })

  it('handles multiple items with different statuses', async () => {
    const html = `
      <html><body>
        Overdue
        Item A
        Overdue
        Item B
        Not due until 2025
        Item C
        Completed on 2024
      </body></html>
    `
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('Item A')
    expect(result[0].status).toBe('overdue')
    expect(result[1].name).toBe('Item B')
    expect(result[1].status).toBe('not_due')
    expect(result[2].name).toBe('Item C')
    expect(result[2].status).toBe('completed')
  })

  it('returns empty for page with no items', async () => {
    const html = '<html><body><p>No preventive care items.</p></body></html>'
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toEqual([])
  })
})
