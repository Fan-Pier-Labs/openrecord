/**
 * The two pure pieces of the release signer.
 *
 * Both guard failures that look exactly like success: a signature block this
 * parser reads wrong would be "verified" against the wrong bytes, and a subject
 * line the summary parser does not recognize would leave the identity check
 * comparing two empty strings.
 */
import { describe, expect, test } from 'bun:test';

import { extractSignatureBlock, parseCertificateSummary } from '../sign-mcpb';

/** Appends a block in @anthropic-ai/mcpb's layout: header, uint32le, DER, footer. */
function appendSignatureBlock(content: Buffer, signature: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signature.length, 0);
  return Buffer.concat([
    content,
    Buffer.from('MCPB_SIG_V1'),
    length,
    signature,
    Buffer.from('MCPB_SIG_END'),
  ]);
}

describe('extractSignatureBlock', () => {
  const content = Buffer.from('PK a zip, more or less');
  const signature = Buffer.from([0x30, 0x82, 0x01, 0x02, 0xff, 0x00]);

  test('splits a signed bundle back into the bytes that were signed', () => {
    const block = extractSignatureBlock(appendSignatureBlock(content, signature));
    expect(block?.content).toEqual(content);
    expect(block?.signature).toEqual(signature);
  });

  test('finds nothing in an unsigned bundle', () => {
    expect(extractSignatureBlock(content)).toBeNull();
  });

  test('returns the outermost signature of a doubly-signed bundle', () => {
    const inner = appendSignatureBlock(content, signature);
    const outer = Buffer.from([0xaa, 0xbb]);
    const block = extractSignatureBlock(appendSignatureBlock(inner, outer));
    // Signing appends, so the second signature covers the first block too.
    expect(block?.content).toEqual(inner);
    expect(block?.signature).toEqual(outer);
  });

  test('refuses a block whose declared length runs past the end of the file', () => {
    const lying = Buffer.alloc(4);
    lying.writeUInt32LE(9999, 0);
    const file = Buffer.concat([
      content,
      Buffer.from('MCPB_SIG_V1'),
      lying,
      signature,
      Buffer.from('MCPB_SIG_END'),
    ]);
    expect(extractSignatureBlock(file)).toBeNull();
  });

  test('ignores a footer with no header before it', () => {
    expect(extractSignatureBlock(Buffer.concat([content, Buffer.from('MCPB_SIG_END')]))).toBeNull();
  });
});

describe('parseCertificateSummary', () => {
  // `openssl x509 -subject -enddate -fingerprint -sha256 -text`, trimmed to the
  // lines the parser reads. LibreSSL (what /usr/bin/openssl is on macOS) prints
  // slash-separated subjects.
  const libresslDeveloperId = [
    'subject= /UID=AB12CD34EF/CN=Developer ID Application: Example Co (AB12CD34EF)/OU=AB12CD34EF/O=Example Co/C=US',
    'notAfter=Apr  9 15:27:07 2031 GMT',
    'SHA256 Fingerprint=A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90',
    'Certificate:',
    '        Validity',
    '            Not After : Apr  9 15:27:07 2031 GMT',
    '            X509v3 Extended Key Usage: critical',
    '                Code Signing',
    '            X509v3 Key Usage: critical',
    '                Digital Signature',
  ].join('\n');

  test('reads the fields the signing gate asserts on', () => {
    const summary = parseCertificateSummary(libresslDeveloperId);
    expect(summary.commonName).toBe('Developer ID Application: Example Co (AB12CD34EF)');
    expect(summary.notAfter.getUTCFullYear()).toBe(2031);
    expect(summary.isCodeSigning).toBe(true);
    expect(summary.sha256).toBe(
      'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    );
  });

  test('reads a comma-separated subject too, as OpenSSL 3 prints it', () => {
    const summary = parseCertificateSummary(
      libresslDeveloperId.replace(
        /^subject=.*$/m,
        'subject=UID=AB12CD34EF, CN=Developer ID Application: Example Co (AB12CD34EF), OU=AB12CD34EF',
      ),
    );
    expect(summary.commonName).toBe('Developer ID Application: Example Co (AB12CD34EF)');
  });

  test('does not call a certificate code-signing when its usage says otherwise', () => {
    const tlsOnly = libresslDeveloperId.replace(
      'Code Signing',
      'TLS Web Server Authentication, TLS Web Client Authentication',
    );
    expect(parseCertificateSummary(tlsOnly).isCodeSigning).toBe(false);
  });

  test('leaves the common name empty rather than guessing at an unreadable subject', () => {
    const summary = parseCertificateSummary(libresslDeveloperId.replace(/^subject=.*$/m, ''));
    expect(summary.commonName).toBe('');
  });
});
