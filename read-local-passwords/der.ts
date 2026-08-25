/**
 * The sliver of ASN.1 DER that Firefox's NSS key store is written in.
 *
 * Only what the key-unwrapping path actually walks: definite-length SEQUENCEs,
 * OCTET STRINGs, INTEGERs and OBJECT IDENTIFIERs. Indefinite lengths, BER and
 * every other tag are out of scope — NSS never emits them here.
 */

export interface DerNode {
  tag: number;
  /** The node's contents, excluding tag and length bytes. */
  content: Buffer;
  /** Offset just past this node, relative to the buffer it was parsed from. */
  end: number;
  /** Present for constructed types (SEQUENCE, SET). */
  children?: DerNode[];
}

export const TAG_INTEGER = 0x02;
export const TAG_OCTET_STRING = 0x04;
export const TAG_OID = 0x06;
export const TAG_SEQUENCE = 0x30;
const TAG_SET = 0x31;

/** Parse one DER node at `offset`. */
export function parseDer(buffer: Buffer, offset = 0): DerNode {
  const tag = buffer[offset];
  if (tag === undefined) throw new Error('der: read past end of buffer');

  let length = buffer[offset + 1];
  if (length === undefined) throw new Error('der: truncated length');
  let cursor = offset + 2;

  // Long form: the low 7 bits say how many bytes carry the real length.
  if (length & 0x80) {
    const byteCount = length & 0x7f;
    if (byteCount === 0 || byteCount > 4) throw new Error('der: unsupported length encoding');
    length = 0;
    for (let i = 0; i < byteCount; i++) {
      const byte = buffer[cursor++];
      if (byte === undefined) throw new Error('der: truncated long-form length');
      length = length * 256 + byte;
    }
  }

  const end = cursor + length;
  if (end > buffer.length) throw new Error('der: node runs past end of buffer');
  const content = buffer.subarray(cursor, end);

  const node: DerNode = { tag, content, end };
  if (tag === TAG_SEQUENCE || tag === TAG_SET) {
    node.children = [];
    let inner = 0;
    while (inner < content.length) {
      const element = parseDer(content, inner);
      node.children.push(element);
      inner = element.end;
    }
  }
  return node;
}

/** Fetch a required child by index, with a message that says what was missing. */
export function child(node: DerNode, ...indexes: number[]): DerNode {
  let current = node;
  for (const index of indexes) {
    const next = current.children?.[index];
    if (!next) throw new Error(`der: expected a child at index ${index}`);
    current = next;
  }
  return current;
}

/** Render an OBJECT IDENTIFIER's contents in dotted-decimal form. */
export function oidToString(content: Buffer): string {
  const first = content[0];
  if (first === undefined) return '';

  // The first byte packs the two leading arcs as 40 * a + b.
  const parts = [Math.floor(first / 40), first % 40];
  let accumulator = 0;
  for (let i = 1; i < content.length; i++) {
    const byte = content[i]!;
    accumulator = accumulator * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      parts.push(accumulator);
      accumulator = 0;
    }
  }
  return parts.join('.');
}

/** Read a DER INTEGER that is known to be small (iteration counts, key sizes). */
export function readInteger(node: DerNode): number {
  if (node.content.length === 0) return 0;
  if (node.content.length > 6) throw new Error('der: integer too large');
  return node.content.readUIntBE(0, node.content.length);
}

/**
 * Strip PKCS#7 padding.
 *
 * Kept separate from the ciphers because NSS pads plaintext that is already a
 * whole number of blocks with a full block, and a naive "last byte is the
 * count" strip on unpadded data would silently truncate a key.
 */
export function stripPadding(plaintext: Buffer, blockSize: number): Buffer {
  const padLength = plaintext[plaintext.length - 1];
  if (padLength === undefined || padLength === 0 || padLength > blockSize || padLength > plaintext.length) {
    return plaintext;
  }
  for (let i = plaintext.length - padLength; i < plaintext.length; i++) {
    if (plaintext[i] !== padLength) return plaintext;
  }
  return plaintext.subarray(0, plaintext.length - padLength);
}
