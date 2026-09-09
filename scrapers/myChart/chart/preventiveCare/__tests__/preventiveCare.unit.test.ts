import { describe, it, expect, mock } from 'bun:test'
import {
  getPreventiveCare,
  fetchPreventiveCareRaw,
  preventiveCareProcessor,
  statusFromCode,
  GET_TOPICS_PATH,
} from '../preventiveCare'
import { MyChartRequest } from '../../../core/myChartRequest'
import { renderOutput } from '../../../processors/processor'

const TOKEN = '<input name="__RequestVerificationToken" type="hidden" value="tok-123" />'

/**
 * Serve the activity page to the GET and `topics` to the GetTopics POST, the
 * way the two-request exchange actually runs. `topics` may be a JSON envelope,
 * or a status to answer the POST with.
 */
function mockRequest(page: string, topics: unknown = { status: 500 }) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.transport = mock(async (url: string) => {
    if (!url.includes('GetTopics')) return new Response(page, { status: 200 })
    if (typeof topics === 'object' && topics !== null && 'status' in topics) {
      return new Response('<html>Runtime Error</html>', {
        status: (topics as { status: number }).status,
        headers: { 'content-type': 'text/html' },
      })
    }
    return new Response(JSON.stringify(topics), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  return req
}

/** The activity page as the captured instance serves it: a shell, no advisory markup. */
const SHELL_PAGE = `
  <html><body>
    <div class='hidden'>${TOKEN}</div>
    <h1>Preventive Care</h1>
    <div id="hm-list-activity">
    <!-- Health Maintenance topic list goes here -->
    </div>
  </body></html>
`

/** A GetTopics envelope, shaped as the capture has it. */
function envelope(...topics: Array<Record<string, unknown>>) {
  return {
    HealthAdvisoryViewModelList: topics,
    HealthAdvisorySettings: { HasApptDetailsSecurity: true, HasUpcomingApptSecurity: true },
  }
}

describe('getPreventiveCare', () => {
  it('reads the topics from GetTopics, normalizing StatusCode and keeping every MyChart field', async () => {
    const result = await getPreventiveCare(
      mockRequest(
        SHELL_PAGE,
        envelope(
          { TopicId: '32', Name: 'Colonoscopy', StatusCode: '100_OVERDUE', Status: 'Overdue', FormattedDueDate: 'January 1, 2024', FormattedDoneDates: ['January 1, 2014'] },
          { TopicId: '9', Name: 'Influenza Vaccine', StatusCode: '500_NOTDUE', Status: 'Not due', FormattedDueDate: 'October 1, 2026' },
        ),
      ),
    )

    expect(result.unavailable).toEqual([])
    expect(result.settings).toEqual({ HasApptDetailsSecurity: true, HasUpcomingApptSecurity: true })
    expect(result.items.map((i) => i.dueStatus)).toEqual(['overdue', 'not_due'])
    // Pass-through: MyChart's own names, casing and values survive.
    expect(result.items[0]).toEqual({
      TopicId: '32',
      Name: 'Colonoscopy',
      StatusCode: '100_OVERDUE',
      Status: 'Overdue',
      FormattedDueDate: 'January 1, 2024',
      FormattedDoneDates: ['January 1, 2014'],
      dueStatus: 'overdue',
    })
  })

  it('reports a null topic list as no advisories, not as a gap', async () => {
    const result = await getPreventiveCare(
      mockRequest(SHELL_PAGE, { HealthAdvisoryViewModelList: null, HealthAdvisorySettings: {} }),
    )
    expect(result.items).toEqual([])
    expect(result.unavailable).toEqual([])
  })

  it('names GetTopics as unavailable rather than reporting an empty chart when the API fails', async () => {
    const result = await getPreventiveCare(mockRequest(SHELL_PAGE))
    expect(result.items).toEqual([])
    expect(result.unavailable).toEqual([GET_TOPICS_PATH])
  })

  // The bug: the activity page carries no advisory markup at all, so parsing it
  // for a table found nothing and returned "no screenings due" for a chart with
  // thirteen advisories.
  it('never reports an empty chart from the client-rendered shell page alone', async () => {
    const result = await getPreventiveCare(mockRequest(SHELL_PAGE))
    expect(result.unavailable.length).toBeGreaterThan(0)
  })

  it('treats a non-empty Text as the error surface the controller reads it as', async () => {
    const result = await getPreventiveCare(
      mockRequest(SHELL_PAGE, { Text: 'An error occurred.', HealthAdvisoryViewModelList: [] }),
    )
    expect(result.unavailable).toEqual([GET_TOPICS_PATH])
  })

  it('treats an envelope without the topic list as a gap, not as an empty list', async () => {
    const result = await getPreventiveCare(mockRequest(SHELL_PAGE, { HealthAdvisorySettings: {} }))
    expect(result.items).toEqual([])
    expect(result.unavailable).toEqual([GET_TOPICS_PATH])
  })

  it('records the token page and the payload, and keeps only the payload in raw', async () => {
    const topics = envelope({ TopicId: '32', Name: 'Colonoscopy', StatusCode: '100_OVERDUE' })
    const raw = await fetchPreventiveCareRaw(mockRequest(SHELL_PAGE, topics))

    expect(raw.requests.map((r) => [r.method, r.path])).toEqual([
      ['GET', '/HealthAdvisories'],
      ['POST', '/HealthAdvisories/GetTopics'],
    ])
    expect(raw.requests[0]!.purpose).toBe('token')
    expect(raw.requests[1]!.requestBody).toBe('registryID=')
    expect(renderOutput(preventiveCareProcessor, raw, 'raw')).toEqual(topics)

    const concise = renderOutput(preventiveCareProcessor, raw, 'concise') as string
    expect(concise).toContain('overdue')
    expect(concise).not.toContain('<')
  })

  it('sends the antiforgery token as a header, which is what the endpoint accepts', async () => {
    const req = mockRequest(SHELL_PAGE, envelope())
    await fetchPreventiveCareRaw(req)
    const post = (req.transport as ReturnType<typeof mock>).mock.calls.find(([url]) => String(url).includes('GetTopics'))!
    const headers = (post[1] as { headers: Record<string, string> }).headers
    expect(headers['__RequestVerificationToken']).toBe('tok-123')
    expect(String(post[0])).not.toContain('__RequestVerificationToken=')
  })
})

describe('statusFromCode', () => {
  it('maps the controller\'s codes and refuses to guess at anything else', () => {
    expect(statusFromCode('100_OVERDUE')).toBe('overdue')
    expect(statusFromCode('500_NOTDUE')).toBe('not_due')
    expect(statusFromCode('700_SATISFIED')).toBe('satisfied')
    expect(statusFromCode('800_AGED_OUT')).toBe('aged_out')
    // Epic's custom `<code>^<display text>` form, and anything unrecognized.
    expect(statusFromCode('CUSTOM^Ask your doctor')).toBe('unknown')
    expect(statusFromCode(undefined)).toBe('unknown')
  })
})
