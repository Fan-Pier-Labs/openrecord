/**
 * Minimal AMF3 (Action Message Format 3) binary reader.
 *
 * Decodes the raw AMF3 typed-object stream eUnity's AmfServicesServlet
 * returns (see docs/EUNITY_PROTOCOL.md — no AMF0 envelope, no Flex
 * RemotingMessage). This is the counterpart of the AMF3Writer in
 * imagingDirectDownload.ts, and exists so the getStudyListMeta response can
 * be parsed *structurally* — Study → Series → Image — instead of scanning the
 * binary for UID-shaped strings and guessing which is which. The guessing
 * broke on Mass General Brigham multi-slice studies, where a series'
 * frameOfReferenceUID was mistaken for the series UID and every download
 * came back CLOERROR ("Failed to find image in any supplied providers").
 *
 * Implements the full AMF3 value grammar (spec §3): reference tables for
 * strings, complex objects and traits; sealed + dynamic objects; dates,
 * arrays, byte arrays, vectors and dictionaries. Externalizable classes
 * carry custom binary bodies that cannot be skipped generically, so only the
 * ones eUnity actually sends are supported (flex.messaging.io.ArrayCollection
 * and ObjectProxy wrap a single AMF3 value; StudyListRequest and
 * StudyListResponse have their own layouts, below); an unknown externalizable
 * class throws, and callers fall back to their own recovery path.
 *
 * This is the repo's ONLY AMF3 reader, and every caller decodes strictly —
 * there is no lenient mode. Resilience belongs at the call site, where each
 * caller knows what a failed decode should cost:
 *
 * - getStudyListMeta responses (imagingDirectDownload.ts): a throw falls back
 *   to the heuristic UID scan. A misdecoded UID must surface as an error,
 *   never as a plausible-but-wrong download request.
 * - CLO wrapper metadata (clo-image-parser/clo_to_bitmap.ts parseWrapper and
 *   sortByPatientPosition.ts): a throw falls back to text-based photometric
 *   detection / the server's image order. The image still renders; only
 *   windowing or slice order degrades, and the fallback logs itself.
 *
 * The writer test (__tests__/imagingDirectDownload.unit.test.ts) also decodes
 * frames with this class. What keeps that from being an encoder checked
 * against its own mirror image is the pinned GOLDEN_FRAME_HEX fixture there:
 * the exact bytes of a frame a real eUnity server accepted. A shared
 * misreading of the AMF3 spec between writer and reader cannot survive a
 * byte-for-byte comparison against a server-verified capture.
 */

/** A decoded AMF3 typed object. Sealed and dynamic members become plain properties. */
export interface Amf3Object {
  /** The AMF3 class name ('' for anonymous objects). */
  __class: string;
  [member: string]: unknown;
}

/** A decoded externalizable object (e.g. ArrayCollection wrapping an array). */
export interface Amf3Externalizable {
  __class: string;
  /** Distinguishes the wrapper from a sealed object that happens to have a `value` member. */
  __externalizable: true;
  /** The value produced by the class's registered body reader. */
  value: unknown;
}

interface Traits {
  className: string;
  externalizable: boolean;
  dynamic: boolean;
  members: string[];
}

/**
 * Body readers for externalizable classes. Each consumes the class's custom
 * serialization from the stream and returns the decoded value.
 */
const EXTERNALIZABLE_READERS: Record<string, (r: Amf3Reader) => unknown> = {
  // ArrayCollection and ObjectProxy both externalize as exactly one wrapped AMF3 value.
  'flex.messaging.io.ArrayCollection': (r) => r.readValue(),
  'flex.messaging.io.ObjectProxy': (r) => r.readValue(),
  // StudyListRequest externalizes as: a 4-byte big-endian format header
  // (value 2), a method-qualifier string ("getStudyList"), a version string
  // ("1.2.0"), then the payload object. Mirrors the layout the AMF3Writer in
  // imagingDirectDownload.ts emits; the writer test decodes its frames back
  // through this reader.
  'com.clientoutlook.web.metaservices.StudyListRequest': (r) => ({
    header: r.readBE32(),
    qualifier: r.readValue(),
    version: r.readValue(),
    payload: r.readValue(),
  }),
  // StudyListResponse externalizes as: a 4-byte big-endian format header
  // (observed value 2, matching the StudyListRequest the writer builds), a
  // DataRequestStatus value, a version string ("1.0.0"), a second 4-byte
  // big-endian word (opaque; observed 0xEB), then the payload object whose
  // members include studyList/relevantStudyList. Observed on Mass General
  // Brigham's eUnity (getStudyListMeta). A response that deviates throws,
  // and the caller falls back to the heuristic UID scan.
  'com.clientoutlook.web.metaservices.StudyListResponse': (r) => ({
    header: r.readBE32(),
    status: r.readValue(),
    version: r.readValue(),
    flags: r.readBE32(),
    payload: r.readValue(),
  }),
};

export class Amf3Reader {
  private pos = 0;
  private readonly strings: string[] = [];
  private readonly objects: unknown[] = [];
  private readonly traitsTable: Traits[] = [];

  constructor(private readonly buf: Buffer) {}

  /** Bytes consumed so far. */
  get offset(): number {
    return this.pos;
  }

  private byte(): number {
    if (this.pos >= this.buf.length) throw new Error('AMF3: unexpected end of buffer');
    return this.buf[this.pos++]!; // bounds-checked above; noUncheckedIndexedAccess
  }

  /** Variable-length 29-bit unsigned integer (1–4 bytes; the 4th byte contributes 8 bits). */
  private readU29(): number {
    let value = 0;
    for (let i = 0; i < 3; i++) {
      const b = this.byte();
      if ((b & 0x80) === 0) return (value << 7) | b;
      value = (value << 7) | (b & 0x7f);
    }
    return (value << 8) | this.byte();
  }

  /** Raw 4-byte big-endian word (used inside externalizable bodies). */
  readBE32(): number {
    if (this.pos + 4 > this.buf.length) throw new Error('AMF3: unexpected end of buffer');
    const v = this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }

  private readDoubleValue(): number {
    if (this.pos + 8 > this.buf.length) throw new Error('AMF3: unexpected end of buffer');
    const v = this.buf.readDoubleBE(this.pos);
    this.pos += 8;
    return v;
  }

  /** String value without the 0x06 marker (used for member/class names too). */
  readStringValue(): string {
    const u29 = this.readU29();
    if ((u29 & 1) === 0) {
      const ref = u29 >> 1;
      if (ref >= this.strings.length) throw new Error(`AMF3: string reference ${ref} out of range`);
      return this.strings[ref]!; // ref bounds-checked above
    }
    const len = u29 >> 1;
    if (this.pos + len > this.buf.length) throw new Error('AMF3: unexpected end of buffer');
    const s = this.buf.toString('utf-8', this.pos, this.pos + len);
    this.pos += len;
    // The empty string is never added to the reference table (spec §1.3.2).
    if (len > 0) this.strings.push(s);
    return s;
  }

  /** Read one complete AMF3 value from the current position. */
  readValue(): unknown {
    const marker = this.byte();
    switch (marker) {
      case 0x00: return undefined;
      case 0x01: return null;
      case 0x02: return false;
      case 0x03: return true;
      case 0x04: {
        // U29 sign-extended from 29 bits
        const u = this.readU29();
        return u & 0x10000000 ? u - 0x20000000 : u;
      }
      case 0x05: return this.readDoubleValue();
      case 0x06: return this.readStringValue();
      case 0x07: // xml-doc — string-shaped, but referenced via the object table
      case 0x0b: { // xml
        const u29 = this.readU29();
        if ((u29 & 1) === 0) return this.objects[u29 >> 1];
        const len = u29 >> 1;
        const s = this.buf.toString('utf-8', this.pos, this.pos + len);
        this.pos += len;
        this.objects.push(s);
        return s;
      }
      case 0x08: { // date
        const u29 = this.readU29();
        if ((u29 & 1) === 0) return this.objects[u29 >> 1];
        const d = new Date(this.readDoubleValue());
        this.objects.push(d);
        return d;
      }
      case 0x09: return this.readArray();
      case 0x0a: return this.readObject();
      case 0x0c: { // byte array
        const u29 = this.readU29();
        if ((u29 & 1) === 0) return this.objects[u29 >> 1];
        const len = u29 >> 1;
        if (this.pos + len > this.buf.length) throw new Error('AMF3: unexpected end of buffer');
        const bytes = Buffer.from(this.buf.subarray(this.pos, this.pos + len));
        this.pos += len;
        this.objects.push(bytes);
        return bytes;
      }
      case 0x0d: // vector<int>
      case 0x0e: { // vector<uint>
        const u29 = this.readU29();
        if ((u29 & 1) === 0) return this.objects[u29 >> 1];
        const count = u29 >> 1;
        this.byte(); // fixed-length flag
        const items: number[] = [];
        this.objects.push(items);
        for (let i = 0; i < count; i++) {
          const v = this.buf.readUInt32BE(this.pos);
          this.pos += 4;
          items.push(marker === 0x0d && v > 0x7fffffff ? v - 0x100000000 : v);
        }
        return items;
      }
      case 0x0f: { // vector<double>
        const u29 = this.readU29();
        if ((u29 & 1) === 0) return this.objects[u29 >> 1];
        const count = u29 >> 1;
        this.byte(); // fixed-length flag
        const items: number[] = [];
        this.objects.push(items);
        for (let i = 0; i < count; i++) items.push(this.readDoubleValue());
        return items;
      }
      case 0x10: { // vector<object>
        const u29 = this.readU29();
        if ((u29 & 1) === 0) return this.objects[u29 >> 1];
        const count = u29 >> 1;
        this.byte(); // fixed-length flag
        this.readStringValue(); // object type name
        const items: unknown[] = [];
        this.objects.push(items);
        for (let i = 0; i < count; i++) items.push(this.readValue());
        return items;
      }
      case 0x11: { // dictionary
        const u29 = this.readU29();
        if ((u29 & 1) === 0) return this.objects[u29 >> 1];
        const count = u29 >> 1;
        this.byte(); // weak-keys flag
        const dict = new Map<unknown, unknown>();
        this.objects.push(dict);
        for (let i = 0; i < count; i++) {
          const key = this.readValue();
          dict.set(key, this.readValue());
        }
        return dict;
      }
      default:
        throw new Error(`AMF3: unsupported marker 0x${marker.toString(16)} at offset ${this.pos - 1}`);
    }
  }

  private readArray(): unknown {
    const u29 = this.readU29();
    if ((u29 & 1) === 0) return this.objects[u29 >> 1];
    const denseCount = u29 >> 1;
    const arr: unknown[] & { associative?: Record<string, unknown> } = [];
    // Added to the reference table before contents are read (supports cycles).
    this.objects.push(arr);
    // Associative portion: (name, value) pairs terminated by the empty string.
    for (;;) {
      const key = this.readStringValue();
      if (key === '') break;
      (arr.associative ??= {})[key] = this.readValue();
    }
    for (let i = 0; i < denseCount; i++) arr.push(this.readValue());
    return arr;
  }

  private readObject(): unknown {
    const u29 = this.readU29();
    if ((u29 & 1) === 0) {
      const ref = u29 >> 1;
      if (ref >= this.objects.length) throw new Error(`AMF3: object reference ${ref} out of range`);
      return this.objects[ref];
    }

    let traits: Traits;
    if ((u29 & 2) === 0) {
      const ref = u29 >> 2;
      if (ref >= this.traitsTable.length) throw new Error(`AMF3: traits reference ${ref} out of range`);
      traits = this.traitsTable[ref]!; // ref bounds-checked above
    } else {
      traits = {
        externalizable: (u29 & 4) !== 0,
        dynamic: (u29 & 8) !== 0,
        className: this.readStringValue(),
        members: [],
      };
      this.traitsTable.push(traits);
      if (!traits.externalizable) {
        const memberCount = u29 >> 4;
        for (let i = 0; i < memberCount; i++) traits.members.push(this.readStringValue());
      }
    }

    if (traits.externalizable) {
      const reader = EXTERNALIZABLE_READERS[traits.className];
      if (!reader) {
        throw new Error(`AMF3: no reader registered for externalizable class ${traits.className}`);
      }
      const ext: Amf3Externalizable = { __class: traits.className, __externalizable: true, value: undefined };
      this.objects.push(ext);
      ext.value = reader(this);
      return ext;
    }

    const obj: Amf3Object = { __class: traits.className };
    // Added to the reference table before members are read (supports cycles).
    this.objects.push(obj);
    for (const member of traits.members) obj[member] = this.readValue();
    if (traits.dynamic) {
      for (;;) {
        const key = this.readStringValue();
        if (key === '') break;
        obj[key] = this.readValue();
      }
    }
    return obj;
  }
}

/** Decode a buffer containing exactly one AMF3 value (the eUnity response shape). */
export function decodeAmf3(buf: Buffer): unknown {
  return new Amf3Reader(buf).readValue();
}

/** True for values produced from externalizable classes (ArrayCollection etc.). */
export function isAmf3Externalizable(v: unknown): v is Amf3Externalizable {
  return typeof v === 'object' && v !== null &&
    (v as { __externalizable?: unknown }).__externalizable === true;
}

/**
 * Unwrap ArrayCollection/ObjectProxy-style externalizable wrappers so callers
 * can treat `series`/`images` members uniformly as arrays.
 */
export function unwrapAmf3(v: unknown): unknown {
  return isAmf3Externalizable(v) ? v.value : v;
}

/**
 * Depth-first walk over a decoded AMF3 tree, yielding every typed object with
 * the given class name. Reference-shared objects are visited once.
 */
export function collectAmf3Objects(root: unknown, className: string): Amf3Object[] {
  const found: Amf3Object[] = [];
  const seen = new Set<object>();
  const visit = (v: unknown): void => {
    if (typeof v !== 'object' || v === null) return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    if (v instanceof Map) {
      for (const [k, val] of v) {
        visit(k);
        visit(val);
      }
      return;
    }
    if (Buffer.isBuffer(v) || v instanceof Date) return;
    const obj = v as Record<string, unknown>;
    if (obj.__class === className) found.push(obj as Amf3Object);
    for (const key of Object.keys(obj)) {
      if (key === '__class') continue;
      visit(obj[key]);
    }
  };
  visit(root);
  return found;
}
