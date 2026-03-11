import { describe, test, expect } from 'bun:test';
import { generateTotpCode, parseTotpUri } from '../totp';

describe('generateTotpCode', () => {
  test('generates a 6-digit code from a Base32 secret', async () => {
    const secret = 'JBSWY3DPEHPK3PXP'; // standard test secret
    const code = await generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  test('handles secrets with spaces', async () => {
    const secret = 'JBSW Y3DP EHPK 3PXP';
    const code = await generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  test('handles lowercase secrets', async () => {
    const secret = 'jbswy3dpehpk3pxp';
    const code = await generateTotpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  test('generates consistent codes for the same secret at the same time', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const code1 = await generateTotpCode(secret);
    const code2 = await generateTotpCode(secret);
    expect(code1).toBe(code2);
  });
});

describe('parseTotpUri', () => {
  test('parses a standard otpauth URI', () => {
    const uri = 'otpauth://totp/MyChart:ryan@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyChart';
    const result = parseTotpUri(uri);
    expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result.issuer).toBe('MyChart');
    expect(result.account).toBe('MyChart:ryan@example.com');
  });

  test('parses URI without issuer', () => {
    const uri = 'otpauth://totp/MyAccount?secret=ABC123';
    const result = parseTotpUri(uri);
    expect(result.secret).toBe('ABC123');
    expect(result.issuer).toBe('');
    expect(result.account).toBe('MyAccount');
  });
});
