import { describe, it, expect } from 'bun:test'

import {
  rec,
  list,
  text,
  textOrNull,
  bool,
  boolOrNull,
  num,
  strings,
  epicInstantMs,
  isoFromMs,
} from '../read'

/**
 * Every value an Epic release has been seen to put where a processor expects
 * something else. Each reader has to turn all of these into its empty value.
 */
const HOSTILE = [
  undefined,
  null,
  '',
  'text',
  0,
  1,
  NaN,
  Infinity,
  -Infinity,
  true,
  false,
  [],
  ['a'],
  {},
  { a: 1 },
  () => {},
  Symbol('s'),
  123n,
  new Date(0),
]

describe('untyped payload readers', () => {
  it('never throws, whatever the instance sent', () => {
    for (const value of HOSTILE) {
      expect(() => rec(value)).not.toThrow()
      expect(() => list(value)).not.toThrow()
      expect(() => text(value)).not.toThrow()
      expect(() => textOrNull(value)).not.toThrow()
      expect(() => bool(value)).not.toThrow()
      expect(() => boolOrNull(value)).not.toThrow()
      expect(() => num(value)).not.toThrow()
      expect(() => strings(value)).not.toThrow()
      expect(() => epicInstantMs(value)).not.toThrow()
    }
  })

  describe('rec', () => {
    it('passes a plain object through by reference', () => {
      const payload = { a: 1 }
      expect(rec(payload)).toBe(payload)
    })

    it('rejects arrays and null, which are also typeof object', () => {
      expect(rec([1, 2])).toEqual({})
      expect(rec(null)).toEqual({})
    })

    it('returns an empty object for every non-object', () => {
      expect(rec(undefined)).toEqual({})
      expect(rec('a')).toEqual({})
      expect(rec(0)).toEqual({})
    })
  })

  describe('list', () => {
    it('passes an array through by reference', () => {
      const payload = [1, 2]
      expect(list(payload)).toBe(payload)
    })

    it('does not wrap a single value into a one-element array', () => {
      expect(list('a')).toEqual([])
      expect(list({ 0: 'a', length: 1 })).toEqual([])
    })
  })

  describe('text', () => {
    it('keeps a string, empty string included', () => {
      expect(text('a')).toBe('a')
      expect(text('')).toBe('')
    })

    it('does not stringify a number or a boolean', () => {
      expect(text(0)).toBe('')
      expect(text(12)).toBe('')
      expect(text(true)).toBe('')
    })
  })

  describe('textOrNull', () => {
    it('distinguishes an empty string from an absent field', () => {
      expect(textOrNull('')).toBe('')
      expect(textOrNull(undefined)).toBeNull()
      expect(textOrNull(null)).toBeNull()
    })
  })

  describe('bool', () => {
    it('is true only for the boolean true, never for a truthy value', () => {
      expect(bool(true)).toBe(true)
      expect(bool('true')).toBe(false)
      expect(bool(1)).toBe(false)
      expect(bool({})).toBe(false)
    })
  })

  describe('boolOrNull', () => {
    it('keeps false, and reports an absent field as null', () => {
      expect(boolOrNull(false)).toBe(false)
      expect(boolOrNull(true)).toBe(true)
      expect(boolOrNull(undefined)).toBeNull()
      expect(boolOrNull('true')).toBeNull()
    })
  })

  describe('num', () => {
    it('keeps finite numbers, zero and negatives included', () => {
      expect(num(0)).toBe(0)
      expect(num(-1.5)).toBe(-1.5)
    })

    it('rejects the non-finite ones rather than passing NaN downstream', () => {
      expect(num(NaN)).toBeNull()
      expect(num(Infinity)).toBeNull()
      expect(num(-Infinity)).toBeNull()
    })

    it('does not parse a numeric string', () => {
      expect(num('12')).toBeNull()
    })
  })

  describe('strings', () => {
    it('drops the non-strings instead of failing the whole list', () => {
      expect(strings(['a', 1, null, 'b', undefined, {}])).toEqual(['a', 'b'])
    })

    it('keeps empty strings, which are values MyChart does send', () => {
      expect(strings(['', 'a'])).toEqual(['', 'a'])
    })

    it('is empty for a non-array', () => {
      expect(strings('abc')).toEqual([])
    })
  })

  describe('epicInstantMs', () => {
    it('reads Epic’s wrapped-millis format', () => {
      expect(epicInstantMs('/Date(1761851400000)/')).toBe(1761851400000)
    })

    it('reads the epoch and pre-epoch negatives', () => {
      expect(epicInstantMs('/Date(0)/')).toBe(0)
      expect(epicInstantMs('/Date(-86400000)/')).toBe(-86400000)
    })

    // The regex wants `)` straight after the digits, so a trailing offset does
    // not parse. Not known to be sent by any instance we have captured; pinned
    // so a change to the pattern is a deliberate one.
    it('is null for a stamp carrying a trailing timezone offset', () => {
      expect(epicInstantMs('/Date(1761851400000-0500)/')).toBeNull()
    })

    it('is null for a bare number or an ISO string', () => {
      expect(epicInstantMs(1761851400000)).toBeNull()
      expect(epicInstantMs('2025-10-30T18:30:00Z')).toBeNull()
      expect(epicInstantMs('/Date()/')).toBeNull()
    })
  })

  describe('isoFromMs', () => {
    it('formats epoch millis as ISO-8601 UTC', () => {
      expect(isoFromMs(0)).toBe('1970-01-01T00:00:00.000Z')
      expect(isoFromMs(1761851400000)).toBe('2025-10-30T19:10:00.000Z')
    })

    it('passes null through', () => {
      expect(isoFromMs(null)).toBeNull()
    })

    it('composes with epicInstantMs, which is how processors use it', () => {
      expect(isoFromMs(epicInstantMs('/Date(1761851400000)/'))).toBe('2025-10-30T19:10:00.000Z')
      expect(isoFromMs(epicInstantMs(undefined))).toBeNull()
    })
  })
})
