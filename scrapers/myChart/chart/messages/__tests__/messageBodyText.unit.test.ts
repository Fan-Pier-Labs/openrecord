import { describe, it, expect } from 'bun:test'
import { messageBodyToText } from '../messageBodyText'

/**
 * The wrapper a real instance serves around a message, as captured from
 * GetConversationList: a `div.fmtConv`, one `div[data-paragraph]` per
 * paragraph, the words inside an inline-styled span, and `\r\n` between the
 * paragraph divs.
 */
const SPAN = 'font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;'

function paragraph(words: string): string {
  return `<div data-paragraph="1"><span style="${SPAN}" lang="en">${words}</span></div>`
}

function epicBody(...paragraphs: string[]): string {
  const divs = paragraphs.map(
    (words, i) => `<div data-paragraph="${i + 1}"><span style="${SPAN}" lang="en">${words}</span></div>`,
  )
  return `<div class="fmtConv" style="line-height: normal; font-family: Arial; widows: 1; orphans: 1;">${divs.join('\r\n')}</div>`
}

describe('messageBodyToText', () => {
  it('returns the words of a real Epic body and none of the markup', () => {
    expect(messageBodyToText(epicBody('Thanks doc'))).toBe('Thanks doc')
  })

  it('is the whole point: a nine-character message stops costing 200 bytes', () => {
    const wrapped = epicBody('Thanks doc')
    expect(wrapped.length).toBeGreaterThan(150)
    expect(messageBodyToText(wrapped).length).toBe('Thanks doc'.length)
  })

  it('keeps paragraph structure as newlines', () => {
    expect(messageBodyToText(epicBody('First.', 'Second.'))).toBe('First.\nSecond.')
  })

  it('renders an &nbsp;-only paragraph as the blank line the sender typed', () => {
    expect(messageBodyToText(epicBody('First.', '&nbsp;', 'Second.'))).toBe('First.\n\nSecond.')
  })

  it('collapses a run of blank paragraphs rather than emitting them all', () => {
    expect(messageBodyToText(epicBody('A', '&nbsp;', '&nbsp;', '&nbsp;', 'B'))).toBe('A\n\nB')
  })

  it('decodes the entities Epic escapes on the way out', () => {
    expect(messageBodyToText(paragraph('Tests &amp; results &lt;5 mg/dL'))).toBe('Tests & results <5 mg/dL')
  })

  it('breaks a line at a <br>', () => {
    expect(messageBodyToText(paragraph('Line one<br />Line two'))).toBe('Line one\nLine two')
  })

  it('keeps a link destination the words alone would lose', () => {
    expect(messageBodyToText(paragraph('See <a href="https://example.org/forms">this form</a>')))
      .toBe('See this form (https://example.org/forms)')
  })

  it('leaves a link alone when its text already is the destination', () => {
    expect(messageBodyToText(paragraph('<a href="https://example.org">https://example.org</a>')))
      .toBe('https://example.org')
  })

  it('drops a script rather than reading its source as words', () => {
    expect(messageBodyToText(`${paragraph('Hello')}<script>alert(1)</script>`)).toBe('Hello')
  })

  it('passes plain text through, for an instance that never wrapped it', () => {
    expect(messageBodyToText('Much better, thanks.')).toBe('Much better, thanks.')
  })

  it('round-trips a long plain body exactly, character for character', () => {
    const body = 'w'.repeat(500)
    expect(messageBodyToText(epicBody(body))).toBe(body)
  })

  it('has no answer to invent for an absent body', () => {
    expect(messageBodyToText(undefined)).toBe('')
    expect(messageBodyToText('')).toBe('')
  })

  it('reads a table body as lines instead of running the cells together', () => {
    const table = '<table><tr><td>Glucose</td><td>98</td></tr><tr><td>A1c</td><td>5.4</td></tr></table>'
    expect(messageBodyToText(table)).toBe('Glucose\n98\nA1c\n5.4')
  })
})
