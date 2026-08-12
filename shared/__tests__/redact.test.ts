import { describe, it, expect } from 'bun:test'
import {
  isSensitiveKey,
  redactBody,
  redactHeaders,
  redactJson,
  redactSecret,
  redactUrl,
  redactValue,
} from '../redact'

/** A TOTP secret shaped like the ones /api/secondary-validation/TotpQrCode returns. */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const CSRF_TOKEN = 'CfDJ8ExampleTokenValue-abcdefghijklmnop1234567890'

describe('isSensitiveKey', () => {
  it('flags the key names MyChart returns secrets under', () => {
    for (const key of [
      'encodedSecretKey', 'EncodedSecretKey', 'SecretKey', 'ManualEntryKey',
      'Password', 'password', '__RequestVerificationToken', 'Token',
      'set-cookie', 'Cookie', 'authorization', 'Challenge', 'signature',
      'rawId', 'clientDataJSON', 'TwoFactorCode',
    ]) {
      expect(isSensitiveKey(key)).toBe(true)
    }
  })

  it('leaves ordinary diagnostic keys alone', () => {
    for (const key of ['status', 'RpId', 'Success', 'name', 'DisplayName', 'Message']) {
      expect(isSensitiveKey(key)).toBe(false)
    }
  })

  it('over-matches boolean flags like IsPasswordValid, which survive anyway', () => {
    // The name matcher is deliberately broad, so `IsPasswordValid` and
    // `IsTotpEnabled` are treated as sensitive — but booleans pass through
    // redaction untouched, so the diagnostic value is not lost.
    expect(isSensitiveKey('IsPasswordValid')).toBe(true)
    const out = redactValue({ IsPasswordValid: false, IsTotpEnabled: true }) as Record<string, unknown>
    expect(out.IsPasswordValid).toBe('false')
    expect(out.IsTotpEnabled).toBe('true')
  })
})

describe('redactSecret', () => {
  it('keeps the length and drops the value', () => {
    expect(redactSecret(TOTP_SECRET)).toBe(`[redacted ${TOTP_SECRET.length} chars]`)
    expect(redactSecret(TOTP_SECRET)).not.toContain(TOTP_SECRET)
  })

  it('distinguishes absent from empty', () => {
    expect(redactSecret(undefined)).toBe('[absent]')
    expect(redactSecret(null)).toBe('[absent]')
    expect(redactSecret('')).toBe('[empty]')
  })

  it('keeps booleans — a flag is not a secret', () => {
    expect(redactSecret(true)).toBe('true')
  })

  it('redacts numbers, which can be one-time codes', () => {
    expect(redactSecret(123456)).toBe('[redacted]')
  })
})

describe('redactValue', () => {
  it('strips the secret out of a TotpQrCode payload but keeps the shape', () => {
    const qrResult = {
      encodedSecretKey: TOTP_SECRET,
      QrCodeUrl: `otpauth://totp/MyChart?secret=${TOTP_SECRET}`,
      Success: true,
      Issuer: 'Example Health',
    }
    const out = redactValue(qrResult) as Record<string, unknown>
    expect(out.encodedSecretKey).toBe(`[redacted ${TOTP_SECRET.length} chars]`)
    expect(out.Success).toBe(true)
    expect(out.Issuer).toBe('Example Health')
    expect(JSON.stringify(out)).not.toContain(TOTP_SECRET)
  })

  it('reaches into nested objects and arrays', () => {
    const out = redactValue({
      data: { challenge: 'abc123', allowCredentials: [{ id: 'x', rawId: 'sensitive-raw-id' }] },
    })
    expect(JSON.stringify(out)).not.toContain('abc123')
    expect(JSON.stringify(out)).not.toContain('sensitive-raw-id')
  })

  it('survives cycles', () => {
    const cyclic: Record<string, unknown> = { name: 'a' }
    cyclic.self = cyclic
    expect(() => redactValue(cyclic)).not.toThrow()
    expect(JSON.stringify(redactValue(cyclic))).toContain('[circular]')
  })

  it('does not call a repeated sibling object circular', () => {
    const shared = { name: 'shared' }
    const out = JSON.stringify(redactValue({ a: shared, b: shared }))
    expect(out).not.toContain('[circular]')
  })
})

describe('redactJson', () => {
  it('never emits a secret', () => {
    expect(redactJson({ SecretKey: TOTP_SECRET })).not.toContain(TOTP_SECRET)
  })

  it('truncates and says so', () => {
    const out = redactJson({ note: 'x'.repeat(200) }, 50)
    expect(out.length).toBeLessThan(120)
    expect(out).toContain('truncated')
  })
})

describe('redactBody', () => {
  it('scrubs the hidden CSRF input out of a login page', () => {
    const html = `<html><body><form>
      <input type="hidden" name="__RequestVerificationToken" value="${CSRF_TOKEN}" />
      <input type="text" name="Login" value="homer" />
      <button>Sign in</button>
    </form></body></html>`
    const out = redactBody(html, 2000)
    expect(out).not.toContain(CSRF_TOKEN)
    expect(out).toContain('__RequestVerificationToken')
    expect(out).toContain('Sign in')
  })

  it('scrubs a JSON body by key', () => {
    const out = redactBody(JSON.stringify({ Success: false, Token: CSRF_TOKEN, Message: 'nope' }))
    expect(out).not.toContain(CSRF_TOKEN)
    expect(out).toContain('nope')
    expect(out).toContain('false')
  })

  it('scrubs a secret embedded in an inline script', () => {
    const out = redactBody(`<script>var cfg = {"secretKey":"${TOTP_SECRET}","locale":"en"};</script>`, 2000)
    expect(out).not.toContain(TOTP_SECRET)
    expect(out).toContain('locale')
  })

  it('scrubs form-encoded credentials', () => {
    const out = redactBody(`__RequestVerificationToken=${CSRF_TOKEN}&TwoFactorCode=123456&RememberMe=checked`)
    expect(out).not.toContain(CSRF_TOKEN)
    expect(out).not.toContain('123456')
    expect(out).toContain('RememberMe=checked')
  })

  it('reports empty and absent bodies plainly', () => {
    expect(redactBody('')).toBe('[empty body]')
    expect(redactBody('   ')).toBe('[empty body]')
    expect(redactBody(undefined)).toBe('[absent]')
  })

  it('notes the full length when it truncates', () => {
    const out = redactBody('y'.repeat(5000), 100)
    expect(out).toContain('5000 chars total')
  })
})

describe('redactHeaders', () => {
  it('drops Set-Cookie and Authorization but keeps the rest', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'set-cookie': 'EPICSESSION=abcdef123456; Path=/; HttpOnly',
      'authorization': 'Bearer sometoken',
    })
    const out = redactHeaders(headers)
    expect(JSON.stringify(out)).not.toContain('EPICSESSION=abcdef123456')
    expect(JSON.stringify(out)).not.toContain('sometoken')
    expect(out['content-type']).toBe('application/json')
  })
})

describe('redactUrl', () => {
  it('keeps the path and drops sensitive query values', () => {
    const out = redactUrl(`https://mychart.example.org/MyChart/Home?token=${CSRF_TOKEN}&noCache=0.5`)
    expect(out).toContain('/MyChart/Home')
    expect(out).toContain('noCache=0.5')
    expect(out).not.toContain(CSRF_TOKEN)
  })

  it('leaves a query-less URL untouched', () => {
    expect(redactUrl('https://mychart.example.org/MyChart/Home')).toBe('https://mychart.example.org/MyChart/Home')
  })
})
