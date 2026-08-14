import { describe, it, expect } from 'bun:test';
import { child, oidToString, parseDer, readInteger, stripPadding, TAG_OCTET_STRING, TAG_SEQUENCE } from '../der';

/** Build a DER node: tag + definite length + content. */
function node(tag: number, content: Buffer): Buffer {
  if (content.length < 0x80) return Buffer.concat([Buffer.from([tag, content.length]), content]);
  const lengthBytes: number[] = [];
  let remaining = content.length;
  while (remaining > 0) {
    lengthBytes.unshift(remaining & 0xff);
    remaining = Math.floor(remaining / 256);
  }
  return Buffer.concat([Buffer.from([tag, 0x80 | lengthBytes.length, ...lengthBytes]), content]);
}

describe('parseDer', () => {
  it('reads a nested sequence', () => {
    const inner = node(TAG_OCTET_STRING, Buffer.from([1, 2, 3]));
    const parsed = parseDer(node(TAG_SEQUENCE, inner));

    expect(parsed.tag).toBe(TAG_SEQUENCE);
    expect(parsed.children).toHaveLength(1);
    expect([...child(parsed, 0).content]).toEqual([1, 2, 3]);
  });

  it('reads long-form lengths, which every real key blob uses', () => {
    const payload = Buffer.alloc(300, 7);
    const parsed = parseDer(node(TAG_OCTET_STRING, payload));

    expect(parsed.content.length).toBe(300);
    expect(parsed.content.every(byte => byte === 7)).toBe(true);
  });

  it('walks sibling children by their own lengths', () => {
    const parsed = parseDer(
      node(TAG_SEQUENCE, Buffer.concat([
        node(TAG_OCTET_STRING, Buffer.alloc(16, 0xaa)),
        node(TAG_OCTET_STRING, Buffer.alloc(8, 0xbb)),
        node(TAG_OCTET_STRING, Buffer.alloc(32, 0xcc)),
      ])),
    );

    expect(parsed.children).toHaveLength(3);
    expect(child(parsed, 1).content.length).toBe(8);
    expect(child(parsed, 2).content[0]).toBe(0xcc);
  });

  it('refuses a node that claims more bytes than it has', () => {
    expect(() => parseDer(Buffer.from([TAG_OCTET_STRING, 0x40, 1, 2]))).toThrow(/past end/);
  });

  it('names the missing index when a child is absent', () => {
    const parsed = parseDer(node(TAG_SEQUENCE, node(TAG_OCTET_STRING, Buffer.from([1]))));
    expect(() => child(parsed, 4)).toThrow(/index 4/);
  });
});

describe('oidToString', () => {
  // The two ciphers Firefox actually names in a saved login.
  it('decodes aes-256-CBC', () => {
    expect(oidToString(Buffer.from('60864801650304012a', 'hex'))).toBe('2.16.840.1.101.3.4.1.42');
  });

  it('decodes des-ede3-cbc', () => {
    expect(oidToString(Buffer.from('2a864886f70d0307', 'hex'))).toBe('1.2.840.113549.3.7');
  });

  it('decodes PBES2, whose arc needs multi-byte components', () => {
    expect(oidToString(Buffer.from('2a864886f70d01050d', 'hex'))).toBe('1.2.840.113549.1.5.13');
  });
});

describe('readInteger', () => {
  it('reads an iteration count that needs three bytes', () => {
    expect(readInteger({ tag: 2, content: Buffer.from([0x01, 0x86, 0xa0]), end: 0 })).toBe(100_000);
  });

  it('treats an empty integer as zero', () => {
    expect(readInteger({ tag: 2, content: Buffer.alloc(0), end: 0 })).toBe(0);
  });
});

describe('stripPadding', () => {
  it('removes a full block of padding', () => {
    const padded = Buffer.concat([Buffer.alloc(24, 1), Buffer.alloc(8, 8)]);
    expect(stripPadding(padded, 16).length).toBe(24);
  });

  it('leaves data alone when the trailing bytes are not valid padding', () => {
    // Last byte says 4, but the preceding bytes are not all 4 — so it is data.
    const notPadded = Buffer.from([9, 9, 9, 9, 1, 2, 3, 4]);
    expect(stripPadding(notPadded, 8).length).toBe(8);
  });

  it('does not strip when the claimed length exceeds the block size', () => {
    const data = Buffer.concat([Buffer.alloc(8, 1), Buffer.from([0x20])]);
    expect(stripPadding(data, 16).length).toBe(9);
  });
});
