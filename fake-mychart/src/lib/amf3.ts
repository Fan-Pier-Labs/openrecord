/**
 * Minimal AMF3 writer for fake-mychart's eUnity AmfServicesServlet.
 *
 * fake-mychart is standalone (its Docker build context is this directory
 * only), so it cannot import the scrapers' AMF3Writer — this is the same
 * subset, kept in step with the response format observed on a real eUnity
 * instance (getStudyListMeta on Mass General Brigham's viewer): sealed typed
 * objects, string reference table, arrays, externalizable objects, and the
 * raw 4-byte big-endian words StudyListResponse embeds in its body.
 */
export class Amf3Writer {
  private buf: number[] = [];
  private stringTable: string[] = [];

  private writeU29(value: number) {
    if (value < 0x80) {
      this.buf.push(value);
    } else if (value < 0x4000) {
      this.buf.push(((value >> 7) & 0x7f) | 0x80, value & 0x7f);
    } else if (value < 0x200000) {
      this.buf.push(((value >> 14) & 0x7f) | 0x80, ((value >> 7) & 0x7f) | 0x80, value & 0x7f);
    } else {
      this.buf.push(((value >> 22) & 0x7f) | 0x80, ((value >> 15) & 0x7f) | 0x80, ((value >> 8) & 0x7f) | 0x80, value & 0xff);
    }
  }

  writeNull() { this.buf.push(0x01); }
  writeFalse() { this.buf.push(0x02); }
  writeTrue() { this.buf.push(0x03); }
  /**
   * AMF3 integer. Negative values go out as their 29-bit two's complement
   * (-1 → 0x1FFFFFFF), which is how real wrappers carry the ImagePhaseInfo
   * "undefined" sentinels; a spec-correct reader sign-extends them back.
   */
  writeInteger(value: number) { this.buf.push(0x04); this.writeU29(value & 0x1fffffff); }

  /** AMF3 byte array — how real wrappers carry a VOI LUT table. */
  writeByteArray(bytes: Buffer) {
    this.buf.push(0x0c);
    this.writeU29((bytes.length << 1) | 1);
    for (const b of bytes) this.buf.push(b);
  }
  writeDouble(value: number) {
    this.buf.push(0x05);
    const b = Buffer.alloc(8);
    b.writeDoubleBE(value);
    this.buf.push(...b);
  }
  writeString(str: string) { this.buf.push(0x06); this.writeStringValue(str); }

  /** String value without the 0x06 marker; maintains the reference table. */
  private writeStringValue(str: string) {
    if (str === '') {
      this.writeU29(1);
      return;
    }
    const ref = this.stringTable.indexOf(str);
    if (ref >= 0) {
      this.writeU29(ref << 1);
      return;
    }
    this.stringTable.push(str);
    const bytes = Buffer.from(str, 'utf-8');
    this.writeU29((bytes.length << 1) | 1);
    this.buf.push(...bytes);
  }

  /** Raw 4-byte big-endian word (StudyListResponse's externalizable body uses these). */
  writeBE32(value: number) {
    this.buf.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  }

  /** Sealed typed object: class name, member names, then member values in order. */
  writeTypedObject(className: string, members: string[], values: ((w: Amf3Writer) => void)[]) {
    this.buf.push(0x0a);
    this.writeU29(0x03 | (members.length << 4));
    this.writeStringValue(className);
    for (const name of members) this.writeStringValue(name);
    for (const value of values) value(this);
  }

  /** Externalizable object: class name followed by a custom binary body. */
  writeExternalizableObject(className: string, body: (w: Amf3Writer) => void) {
    this.buf.push(0x0a);
    this.writeU29(0x07);
    this.writeStringValue(className);
    body(this);
  }

  writeArray(items: ((w: Amf3Writer) => void)[]) {
    this.buf.push(0x09);
    this.writeU29((items.length << 1) | 1);
    this.writeStringValue('');
    for (const item of items) item(this);
  }

  /** ArrayCollection — how eUnity wraps every object list. */
  writeArrayCollection(items: ((w: Amf3Writer) => void)[]) {
    this.writeExternalizableObject('flex.messaging.io.ArrayCollection', (w) => w.writeArray(items));
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buf);
  }
}
