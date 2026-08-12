/**
 * Tests for fake-mychart's server-side TOTP: real RFC 6238, checked against
 * the published test vectors rather than against itself.
 *
 * The other half of the contract — that this agrees with the `totp-generator`
 * client the scrapers use — lives in `scrapers/myChart/__tests__/totp.test.ts`.
 * It has to, because nothing under `fake-mychart/` may import from outside it:
 * the Docker build context is this directory alone, so such an import resolves
 * above the image root.
 */

import { describe, it, expect } from 'bun:test'
import { base32Decode, base32Encode, generateTotpSecret, generateTotpCode, verifyTotpCode } from '../totp'

// RFC 6238 Appendix B: the SHA-1 vectors use the ASCII secret
// "12345678901234567890", which is this in Base32.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'))

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0x00, 0x01, 0x7f, 0x80, 0xff, 0xab, 0xcd])
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes)
  })

  it('encodes the RFC 4648 test secret to the expected string', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  })

  it('tolerates lowercase, whitespace and padding, the way MyChart secrets arrive', () => {
    const expected = base32Decode('JBSWY3DPEHPK3PXP')
    expect(base32Decode('jbswy3dp ehpk3pxp')).toEqual(expected)
    expect(base32Decode('JBSW Y3DP EHPK 3PXP')).toEqual(expected)
    expect(base32Decode('JBSWY3DPEHPK3PXP===')).toEqual(expected)
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('JBSWY3DP1EHPK')).toThrow()
  })
})

describe('generateTotpCode', () => {
  // RFC 6238 Appendix B, SHA-1 rows. The RFC prints 8 digits; a 6-digit code
  // is the low 6 of the same truncation.
  const vectors: Array<[seconds: number, eightDigits: string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ]

  for (const [seconds, eightDigits] of vectors) {
    it(`matches the RFC 6238 vector at T=${seconds}`, () => {
      expect(generateTotpCode(RFC_SECRET, seconds * 1000)).toBe(eightDigits.slice(-6))
    })
  }

  it('always produces six digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTotpCode(RFC_SECRET, i * 30_000)).toMatch(/^\d{6}$/)
    }
  })

  it('holds the same code for a whole 30-second step and changes at the boundary', () => {
    const stepStart = 1_700_000_000_000 - (1_700_000_000_000 % 30_000)
    expect(generateTotpCode(RFC_SECRET, stepStart)).toBe(generateTotpCode(RFC_SECRET, stepStart + 29_999))
    expect(generateTotpCode(RFC_SECRET, stepStart)).not.toBe(generateTotpCode(RFC_SECRET, stepStart + 30_000))
  })
})

describe('verifyTotpCode', () => {
  const now = 1_700_000_000_000

  it('accepts the code for the current step', () => {
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, now), now)).toBe(true)
  })

  it('accepts the neighbouring steps, so a code in flight across a boundary still lands', () => {
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, now - 30_000), now)).toBe(true)
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, now + 30_000), now)).toBe(true)
  })

  it('rejects a code two steps away', () => {
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, now - 60_000), now)).toBe(false)
    expect(verifyTotpCode(RFC_SECRET, generateTotpCode(RFC_SECRET, now + 60_000), now)).toBe(false)
  })

  it('rejects a valid code for a different secret', () => {
    const other = generateTotpCode('JBSWY3DPEHPK3PXP', now)
    // Guard against the fluke where both secrets happen to yield the same code.
    if (other !== generateTotpCode(RFC_SECRET, now)) {
      expect(verifyTotpCode(RFC_SECRET, other, now)).toBe(false)
    }
  })

  it('rejects anything that is not six digits', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 34 56', '000000x']) {
      expect(verifyTotpCode(RFC_SECRET, bad, now)).toBe(false)
    }
  })

  it('ignores surrounding whitespace, which users paste in', () => {
    const code = generateTotpCode(RFC_SECRET, now)
    expect(verifyTotpCode(RFC_SECRET, `  ${code} `, now)).toBe(true)
  })
})

describe('generateTotpSecret', () => {
  it('produces a decodable 160-bit Base32 secret', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(secret).length).toBe(20)
  })

  it('produces a different secret each time', () => {
    const secrets = new Set(Array.from({ length: 50 }, generateTotpSecret))
    expect(secrets.size).toBe(50)
  })
})
