import { describe, test, expect } from 'bun:test';
import { generateTotpCode, parseTotpUri } from '../totp';
import {
  generateTotpCode as fakeServerGenerateTotpCode,
  generateTotpSecret as fakeServerGenerateTotpSecret,
} from '../../../../fake-mychart/src/lib/totp';

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
    // Pin timestamp to avoid flakiness at 30-second TOTP boundary
    const timestamp = 1700000000000;
    const code1 = await generateTotpCode(secret, timestamp);
    const code2 = await generateTotpCode(secret, timestamp);
    expect(code1).toBe(code2);
  });
});

describe('agreement with fake-mychart’s server-side TOTP', () => {
  // fake-mychart validates the codes this client produces during TOTP setup,
  // so the two implementations have to agree exactly. If they drift, CI fails
  // in the integration suite looking like a scraper bug — these cases name the
  // real cause instead.
  //
  // The direction of the import matters: the check lives here, not under
  // fake-mychart/, because nothing in that package may reach outside it (its
  // Docker build context is that directory alone).
  //
  // Agreement alone isn't enough — both could be wrong together — so the
  // fake's side is separately pinned to the published RFC 6238 vectors in
  // fake-mychart/src/lib/__tests__/totp.test.ts.
  const secrets = [
    'JBSWY3DPEHPK3PXP',
    'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', // RFC 6238's "12345678901234567890"
    fakeServerGenerateTotpSecret(), // a freshly minted 160-bit secret
  ];
  const timestamps = [0, 59_000, 1_234_567_890_000, 1_700_000_000_000, 2_000_000_000_000];

  for (const secret of secrets) {
    for (const timestamp of timestamps) {
      test(`matches for a ${secret.length}-char secret at t=${timestamp}`, async () => {
        expect(await generateTotpCode(secret, timestamp))
          .toBe(fakeServerGenerateTotpCode(secret, timestamp));
      });
    }
  }
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
