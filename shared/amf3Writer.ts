/**
 * The repo's only AMF3 (Action Message Format 3) writer.
 *
 * Two very different things encode AMF3 here, and both must agree byte-for-byte
 * with what a real ClientOutlook/eUnity server accepts:
 *
 * - the scraper, building `AmfServicesServlet` request frames
 *   (`scrapers/myChart/eunity/amf.ts`)
 * - fake-mychart, answering those frames and synthesizing the CLO wrappers its
 *   image servlet serves — plus `generate_clo.ts`, which writes the committed
 *   `.clo` fixtures fake-mychart serves for single-wrapper series
 *
 * They used to be three separate copies of this class, and they drifted: the
 * fixture writer emitted no string reference table (so a reader bug in
 * reference handling could not be caught by any fixture) and named the wrapper
 * root class `ImageDescription` where real servers send
 * `com.clientoutlook.data.ImageDescription`. Nothing failed, because every
 * reader in the repo matches on member names and never on the class name.
 *
 * The counterpart reader lives at `scrapers/myChart/eunity/amf3Reader.ts` — it
 * stays scraper-side because nothing else decodes AMF3. That the two are not
 * mirror images of one shared misreading is pinned by `GOLDEN_FRAME_HEX` in
 * `scrapers/myChart/eunity/__tests__/amf.unit.test.ts`: the
 * exact bytes of a request frame a real eUnity server accepted.
 *
 * Two writing styles are supported, because the callers genuinely differ:
 *
 * - **callback style** (`writeTypedObject(className, members, [w => …])`) —
 *   exact control over every marker, which is what request frames and faithful
 *   server responses need (integer vs double is observable on the wire).
 * - **value style** (`writeValue(literal)`) — a plain JS object tree using the
 *   `_class` / `_externalizable` / `_value` conventions, for fixture-shaped
 *   code where readability beats marker-level control. Wrap a number in
 *   {@link amf3Double} where the double marker is load-bearing.
 */

/** A number that must go out as an AMF3 double, even when it is integral. */
export interface Amf3Double {
  readonly __amf3Double: number;
}

/** Force the double marker (0x05) for a value {@link Amf3Writer.writeValue} would otherwise write as an integer. */
export function amf3Double(value: number): Amf3Double {
  return { __amf3Double: value };
}

function isAmf3Double(v: unknown): v is Amf3Double {
  return typeof v === 'object' && v !== null && typeof (v as Amf3Double).__amf3Double === 'number';
}

/** An object literal for {@link Amf3Writer.writeValue}. `_class` names the AMF3 class; every other key is a sealed member. */
export interface Amf3ObjectLiteral {
  /** AMF3 class name ('' or absent for an anonymous object). */
  _class?: string;
  /** Marks an externalizable class whose body is exactly one wrapped value (ArrayCollection, ObjectProxy). */
  _externalizable?: boolean;
  /** The wrapped value, for `_externalizable` literals. */
  _value?: Amf3Value;
  [member: string]: Amf3Value | undefined;
}

/** Anything {@link Amf3Writer.writeValue} can encode. */
export type Amf3Value =
  | null
  | undefined
  | boolean
  | number
  | string
  | Buffer
  | Amf3Double
  | Amf3Value[]
  | Amf3ObjectLiteral;

/** An externalizable ArrayCollection literal — how eUnity wraps every object list. */
export function amf3ArrayCollection(items: Amf3Value[]): Amf3ObjectLiteral {
  return { _class: 'flex.messaging.io.ArrayCollection', _externalizable: true, _value: items };
}

export class Amf3Writer {
  private readonly buf: number[] = [];
  private readonly stringTable: string[] = [];

  /** Variable-length 29-bit unsigned integer (1–4 bytes; the 4th byte contributes 8 bits). */
  private writeU29(value: number) {
    if (value < 0x80) {
      this.buf.push(value);
    } else if (value < 0x4000) {
      this.buf.push(((value >> 7) & 0x7f) | 0x80, value & 0x7f);
    } else if (value < 0x200000) {
      this.buf.push(((value >> 14) & 0x7f) | 0x80, ((value >> 7) & 0x7f) | 0x80, value & 0x7f);
    } else {
      this.buf.push(
        ((value >> 22) & 0x7f) | 0x80,
        ((value >> 15) & 0x7f) | 0x80,
        ((value >> 8) & 0x7f) | 0x80,
        value & 0xff,
      );
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

  writeDouble(value: number) {
    this.buf.push(0x05);
    const b = Buffer.alloc(8);
    b.writeDoubleBE(value);
    this.buf.push(...b);
  }

  writeString(str: string) { this.buf.push(0x06); this.writeStringValue(str); }

  /** AMF3 byte array — how real wrappers carry a VOI LUT table. */
  writeByteArray(bytes: Buffer) {
    this.buf.push(0x0c);
    this.writeU29((bytes.length << 1) | 1);
    for (const b of bytes) this.buf.push(b);
  }

  /**
   * String value without the 0x06 marker; maintains the reference table.
   * Class names and member names go through here too, exactly as the reader
   * pushes them onto its own table — the two orders must stay in step.
   */
  private writeStringValue(str: string) {
    if (str === '') {
      // The empty string is never a reference (spec §1.3.2): U29 = 1, length 0.
      this.writeU29(1);
      return;
    }
    const ref = this.stringTable.indexOf(str);
    if (ref >= 0) {
      this.writeU29(ref << 1); // reference: index << 1, inline bit clear
      return;
    }
    this.stringTable.push(str);
    const bytes = Buffer.from(str, 'utf-8');
    this.writeU29((bytes.length << 1) | 1);
    this.buf.push(...bytes);
  }

  /** Raw 4-byte big-endian word (externalizable bodies such as StudyListRequest use these). */
  writeBE32(value: number) {
    this.buf.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
  }

  /**
   * Sealed typed object: class name, member names, then member values in order.
   * Traits bits: 0x03 | (memberCount << 4).
   */
  writeTypedObject(className: string, members: string[], values: ((w: Amf3Writer) => void)[]) {
    this.buf.push(0x0a);
    this.writeU29(0x03 | (members.length << 4));
    this.writeStringValue(className);
    for (const name of members) this.writeStringValue(name);
    for (const value of values) value(this);
  }

  /**
   * Dynamic object: sealed members followed by key/value pairs, terminated by
   * the empty string. Traits bits: 0x0B (inline traits + dynamic) | (sealedCount << 4).
   */
  writeDynamicObject(
    className: string,
    sealedMembers: string[],
    sealedValues: ((w: Amf3Writer) => void)[],
    dynamicPairs: [string, (w: Amf3Writer) => void][],
  ) {
    this.buf.push(0x0a);
    this.writeU29(0x0b | (sealedMembers.length << 4));
    this.writeStringValue(className);
    for (const name of sealedMembers) this.writeStringValue(name);
    for (const value of sealedValues) value(this);
    for (const [key, value] of dynamicPairs) {
      this.writeStringValue(key);
      value(this);
    }
    this.writeStringValue('');
  }

  /**
   * Externalizable object: class name followed by a custom binary body.
   * Traits bits: 0x07 (inline object + inline traits + externalizable).
   */
  writeExternalizableObject(className: string, body: (w: Amf3Writer) => void) {
    this.buf.push(0x0a);
    this.writeU29(0x07);
    this.writeStringValue(className);
    body(this);
  }

  /** Dense array with an empty associative section. */
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

  /**
   * Write a plain JS value tree (the value style described at the top of this
   * file). Integral numbers in AMF3 integer range take the integer marker —
   * wrap them with {@link amf3Double} where the double marker matters.
   */
  writeValue(value: Amf3Value) {
    if (value === null || value === undefined) {
      this.writeNull();
    } else if (Buffer.isBuffer(value)) {
      this.writeByteArray(value);
    } else if (typeof value === 'boolean') {
      if (value) this.writeTrue();
      else this.writeFalse();
    } else if (isAmf3Double(value)) {
      this.writeDouble(value.__amf3Double);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value) && value >= -0x10000000 && value < 0x20000000) this.writeInteger(value);
      else this.writeDouble(value);
    } else if (typeof value === 'string') {
      this.writeString(value);
    } else if (Array.isArray(value)) {
      this.writeArray(value.map((item) => (w: Amf3Writer) => w.writeValue(item)));
    } else {
      this.writeObjectLiteral(value);
    }
  }

  private writeObjectLiteral(obj: Amf3ObjectLiteral) {
    const className = obj._class ?? '';
    if (obj._externalizable) {
      // The only externalizable body shape real CLO wrappers use: exactly one
      // wrapped AMF3 value (ArrayCollection, ObjectProxy).
      this.writeExternalizableObject(className, (w) => w.writeValue(obj._value));
      return;
    }
    const members = Object.keys(obj).filter((key) => key !== '_class');
    this.writeTypedObject(
      className,
      members,
      members.map((key) => (w: Amf3Writer) => w.writeValue(obj[key])),
    );
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buf);
  }
}
