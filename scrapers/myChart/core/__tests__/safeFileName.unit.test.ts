import { describe, expect, it } from 'bun:test'
import { safeFileName } from '../safeFileName'

describe('safeFileName', () => {
  it('keeps an ordinary name', () => {
    expect(safeFileName('proof of coverage.pdf', 'attachment.pdf')).toBe('proof of coverage.pdf')
  })

  it('cannot name a path: separators and reserved characters become underscores', () => {
    expect(safeFileName('../../evil/../x:y.pdf', 'attachment.pdf')).toBe('_.._evil_.._x_y.pdf')
  })

  it('drops control characters and leading dots, and collapses whitespace', () => {
    expect(safeFileName('\x00..  a  b.png', 'attachment.png')).toBe('a b.png')
  })

  it('falls back when nothing usable is left', () => {
    expect(safeFileName('', 'attachment.pdf')).toBe('attachment.pdf')
    expect(safeFileName('   ', 'attachment')).toBe('attachment')
  })

  it('caps the length at 120 characters', () => {
    expect(safeFileName('x'.repeat(200) + '.pdf', 'attachment.pdf')).toHaveLength(120)
  })
})
