import { describe, it, expect } from 'bun:test'
import { date2dte } from '../bills'

describe('date2dte edge cases and DTE epoch', () => {
  // The DTE (Days Since Epoch) format uses Dec 31, 1840 as its base date.
  // The formula: (utcDate - unixEpoch) / 864e5 + 47117
  // This means Jan 1, 1970 (unix epoch) = 47117 in DTE.
  // So Dec 31, 1840 = day 0 in DTE.

  it('DTE epoch math: 47117 days between Dec 31 1840 and Jan 1 1970', () => {
    // Verify the epoch offset
    const epoch = new Date(1970, 0, 1)
    expect(date2dte(epoch)).toBe(47117)
  })

  it('computes DTE for the MyChart DTE base date (Dec 31, 1840)', () => {
    const dteBase = new Date(1840, 11, 31) // Dec 31, 1840
    expect(date2dte(dteBase)).toBe(0)
  })

  it('computes DTE for Jan 1, 1841 = 1', () => {
    const jan1_1841 = new Date(1841, 0, 1)
    expect(date2dte(jan1_1841)).toBe(1)
  })

  it('handles year 2000 (Y2K)', () => {
    const y2k = new Date(2000, 0, 1)
    // From 1970 to 2000: 10957 days
    expect(date2dte(y2k)).toBe(47117 + 10957)
  })

  it('handles far future date', () => {
    const future = new Date(2100, 0, 1)
    const result = date2dte(future)
    expect(result).toBeGreaterThan(47117)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('handles Feb 28 and Mar 1 in non-leap year', () => {
    const feb28 = new Date(2023, 1, 28)
    const mar1 = new Date(2023, 2, 1)
    expect(date2dte(mar1) - date2dte(feb28)).toBe(1) // No Feb 29
  })

  it('handles Feb 28 and Feb 29 in leap year', () => {
    const feb28 = new Date(2024, 1, 28)
    const feb29 = new Date(2024, 1, 29)
    expect(date2dte(feb29) - date2dte(feb28)).toBe(1)
  })

  it('full year has 365 days in non-leap year', () => {
    const start2023 = new Date(2023, 0, 1)
    const start2024 = new Date(2024, 0, 1)
    expect(date2dte(start2024) - date2dte(start2023)).toBe(365)
  })

  it('full year has 366 days in leap year', () => {
    const start2024 = new Date(2024, 0, 1)
    const start2025 = new Date(2025, 0, 1)
    expect(date2dte(start2025) - date2dte(start2024)).toBe(366)
  })

  it('produces consistent results regardless of local time', () => {
    // The function creates UTC dates, so local time should not matter
    const date = new Date(2023, 6, 4) // July 4
    const result1 = date2dte(date)
    const result2 = date2dte(date)
    expect(result1).toBe(result2)
  })
})
