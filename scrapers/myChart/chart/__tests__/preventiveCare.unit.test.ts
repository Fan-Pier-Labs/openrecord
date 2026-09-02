import { describe, it, expect, mock } from 'bun:test'
import { getPreventiveCare } from '../preventiveCare'
import { MyChartRequest } from '../../core/myChartRequest'

function mockRequest(body: string) {
  const req = new MyChartRequest('mychart.example.com')
  req.firstPathPart = 'MyChart'
  req.transport = mock(async () => {
    return new Response(body, { status: 200 })
  })
  return req
}

// The advisories page as MyChart renders it: a heading, a nav sidebar, and one
// table row per screening. Every one of those is a block element, so `.text()`
// glues them into a single line unless the parser separates them.
function tablePage(rows: string): string {
  return `
    <html><body>
      <nav><a href="/MyChart/HealthAdvisories">Preventive Care</a></nav>
      <h1>Preventive Care</h1>
      <table>
        <tr><th>Screening</th><th>Status</th><th>Details</th></tr>
        ${rows}
      </table>
    </body></html>
  `
}

describe('getPreventiveCare', () => {
  it('parses a table of screenings without merging rows together', async () => {
    const html = tablePage(`
      <tr><td><strong>Colonoscopy</strong></td><td><span class="badge">Overdue</span></td><td>Overdue since 01/01/2024</td></tr>
      <tr><td><strong>Influenza Vaccine</strong></td><td><span class="badge">Due</span></td><td>Not due until 10/01/2026</td></tr>
      <tr><td><strong>Lipid Panel</strong></td><td><span class="badge">Completed</span></td><td>Completed on 01/10/2026</td></tr>
    `)
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toEqual([
      { name: 'Colonoscopy', status: 'overdue', overdueSince: '01/01/2024', notDueUntil: '', previouslyDone: [], completedDate: '' },
      { name: 'Influenza Vaccine', status: 'not_due', overdueSince: '', notDueUntil: '10/01/2026', previouslyDone: [], completedDate: '' },
      { name: 'Lipid Panel', status: 'completed', overdueSince: '', notDueUntil: '', previouslyDone: [], completedDate: '01/10/2026' },
    ])
  })

  it('does not emit a synthetic row built from the page heading and the whole table', async () => {
    const html = tablePage(`
      <tr><td>Colonoscopy</td><td>Overdue</td><td>Overdue since 01/01/2024</td></tr>
      <tr><td>Influenza Vaccine</td><td>Due</td><td>Not due until 10/01/2026</td></tr>
    `)
    const result = await getPreventiveCare(mockRequest(html))
    expect(result.map(i => i.name)).toEqual(['Colonoscopy', 'Influenza Vaccine'])
    // The artifact concatenated unrelated records into one field.
    for (const item of result) {
      expect(item.overdueSince).not.toContain('Influenza')
      expect(item.notDueUntil).not.toContain('Lipid')
    }
  })

  it('ignores column headers and unrelated tables on the page', async () => {
    const html = tablePage(`
      <tr><td>Mammogram</td><td>Overdue</td><td>Overdue since 01/01/2024</td></tr>
      </table>
      <table>
        <tr><th>Provider</th><th>Phone</th></tr>
        <tr><td>Springfield General</td><td>555-0100</td></tr>
      </table>
      <table>
    `)
    const result = await getPreventiveCare(mockRequest(html))
    expect(result.map(i => i.name)).toEqual(['Mammogram'])
  })

  it('parses previously done dates from a table row', async () => {
    const html = tablePage(`
      <tr><td>Mammogram</td><td>Overdue</td><td>Overdue since 01/01/2024<br>Previously done: 01/01/2022, 01/01/2020, 01/01/2018</td></tr>
    `)
    const result = await getPreventiveCare(mockRequest(html))
    expect(result[0]!.previouslyDone).toEqual(['01/01/2022', '01/01/2020', '01/01/2018'])
  })

  it('falls back to line pairing when the page has no table', async () => {
    const html = `
      <html><body>
        <div class="healthAdvisories">
          <div>Colonoscopy</div>
          <div>Overdue since 01/01/2023</div>
          <div>Previously done: 03/15/2013</div>
          <div>Flu Vaccine</div>
          <div>Not due until 10/01/2025</div>
          <div>Eye Exam</div>
          <div>Completed on 06/15/2024</div>
        </div>
      </body></html>
    `
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toEqual([
      { name: 'Colonoscopy', status: 'overdue', overdueSince: '01/01/2023', notDueUntil: '', previouslyDone: ['03/15/2013'], completedDate: '' },
      { name: 'Flu Vaccine', status: 'not_due', overdueSince: '', notDueUntil: '10/01/2025', previouslyDone: [], completedDate: '' },
      { name: 'Eye Exam', status: 'completed', overdueSince: '', notDueUntil: '', previouslyDone: [], completedDate: '06/15/2024' },
    ])
  })

  it('does not treat a status badge as the name of the next screening', async () => {
    const html = `
      <html><body>
        <div>Overdue</div>
        <div>Item A</div>
        <div>Overdue since 01/01/2024</div>
        <div>Not due</div>
        <div>Item B</div>
        <div>Not due until 2027</div>
      </body></html>
    `
    const result = await getPreventiveCare(mockRequest(html))
    expect(result.map(i => i.name)).toEqual(['Item A', 'Item B'])
    expect(result.map(i => i.status)).toEqual(['overdue', 'not_due'])
  })

  it('returns empty for page with no items', async () => {
    const html = '<html><body><p>No preventive care items.</p></body></html>'
    const result = await getPreventiveCare(mockRequest(html))
    expect(result).toEqual([])
  })
})
