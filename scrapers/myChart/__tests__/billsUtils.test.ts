import { describe, it, expect } from 'bun:test'
import { dte2date, date2dte } from '../bills/utils'

/**
 * MyChart serialises billing dates as "dte" — whole days since 1840-12-31, the
 * mainframe epoch, which sits 47,117 days before the Unix epoch.
 */
const UNIX_EPOCH_AS_DTE = 47117

describe('dte2date', () => {
  it('maps the mainframe/Unix epoch offset to 1970-01-01', () => {
    const date = dte2date(UNIX_EPOCH_AS_DTE)
    expect(date.getFullYear()).toBe(1970)
    expect(date.getMonth()).toBe(0)
    expect(date.getDate()).toBe(1)
  })

  it('returns local midnight, not a time-of-day', () => {
    const date = dte2date(UNIX_EPOCH_AS_DTE + 12345)
    expect([date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()]).toEqual([
      0, 0, 0, 0,
    ])
  })

  it('advances exactly one calendar day per unit', () => {
    const first = dte2date(UNIX_EPOCH_AS_DTE + 100)
    const next = dte2date(UNIX_EPOCH_AS_DTE + 101)

    expect(next.getDate()).toBe(first.getDate() + 1)
  })

  it('handles dates before the Unix epoch', () => {
    // 1841-01-01 is one day after the mainframe epoch itself.
    const date = dte2date(1)
    expect(date.getFullYear()).toBe(1841)
    expect(date.getMonth()).toBe(0)
    expect(date.getDate()).toBe(1)
  })

  it('crosses a leap day correctly', () => {
    const feb29 = date2dte(new Date(2024, 1, 29))
    const roundTripped = dte2date(feb29)

    expect(roundTripped.getFullYear()).toBe(2024)
    expect(roundTripped.getMonth()).toBe(1)
    expect(roundTripped.getDate()).toBe(29)
  })
})

describe('date2dte', () => {
  it('maps 1970-01-01 back to the epoch offset', () => {
    expect(date2dte(new Date(1970, 0, 1))).toBe(UNIX_EPOCH_AS_DTE)
  })

  it('ignores the time component of the input', () => {
    const morning = date2dte(new Date(2024, 5, 15, 1, 2, 3, 4))
    const evening = date2dte(new Date(2024, 5, 15, 23, 59, 59, 999))

    expect(morning).toBe(evening)
  })

  it('returns a whole number of days', () => {
    expect(Number.isInteger(date2dte(new Date(2024, 5, 15)))).toBe(true)
  })

  it('increases by one per calendar day', () => {
    expect(date2dte(new Date(2024, 5, 16)) - date2dte(new Date(2024, 5, 15))).toBe(1)
  })
})

describe('dte round-trip', () => {
  it('preserves the calendar date across a range of years', () => {
    const samples = [
      new Date(1900, 0, 1),
      new Date(1969, 11, 31),
      new Date(1970, 0, 1),
      new Date(2000, 1, 29),
      new Date(2024, 6, 4),
      new Date(2099, 11, 31),
    ]

    for (const original of samples) {
      const roundTripped = dte2date(date2dte(original))
      expect([
        roundTripped.getFullYear(),
        roundTripped.getMonth(),
        roundTripped.getDate(),
      ]).toEqual([original.getFullYear(), original.getMonth(), original.getDate()])
    }
  })
})
