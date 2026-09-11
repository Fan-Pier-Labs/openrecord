import { describe, it, expect } from 'bun:test';
import {
  decodeAmf3,
  unwrapAmf3,
  isAmf3Externalizable,
  type Amf3Object,
} from '../amf3Reader';
import { Amf3Writer } from '../amf3Writer';

// The fixtures are built with the real Amf3Writer — the same code whose output
// was byte-for-byte verified against eUnity's browser traffic — so the reader
// is tested against genuine AMF3, not bytes invented in this file.

describe('decodeAmf3 — scalars and strings', () => {
  it('round-trips a sealed typed object with strings, integers and booleans', () => {
    const w = new Amf3Writer();
    w.writeTypedObject('com.example.Thing', ['name', 'count', 'good', 'missing'], [
      (w1) => w1.writeString('hello'),
      (w1) => w1.writeInteger(42),
      (w1) => w1.writeTrue(),
      (w1) => w1.writeNull(),
    ]);
    const obj = decodeAmf3(w.toBuffer()) as Amf3Object;
    expect(obj.__class).toBe('com.example.Thing');
    expect(obj.name).toBe('hello');
    expect(obj.count).toBe(42);
    expect(obj.good).toBe(true);
    expect(obj.missing).toBeNull();
  });

  it('resolves string references (same string written twice)', () => {
    const w = new Amf3Writer();
    w.writeArray([
      (w1) => w1.writeString('repeated'),
      (w1) => w1.writeString('repeated'), // writer emits a reference here
    ]);
    const arr = decodeAmf3(w.toBuffer()) as unknown[];
    expect(arr).toEqual(['repeated', 'repeated']);
  });

  it('decodes dynamic objects', () => {
    const w = new Amf3Writer();
    w.writeDynamicObject('', ['sealed'], [(w1) => w1.writeInteger(1)], [
      ['extra', (w1) => w1.writeString('dyn')],
    ]);
    const obj = decodeAmf3(w.toBuffer()) as Amf3Object;
    expect(obj.sealed).toBe(1);
    expect(obj.extra).toBe('dyn');
  });

  it('decodes doubles', () => {
    const buf = Buffer.alloc(9);
    buf[0] = 0x05;
    buf.writeDoubleBE(1.5, 1);
    expect(decodeAmf3(buf)).toBe(1.5);
  });

  it('sign-extends 29-bit negative integers', () => {
    // -1 encoded as the four-byte U29 form 0x1FFFFFFF
    expect(decodeAmf3(Buffer.from([0x04, 0xff, 0xff, 0xff, 0xff]))).toBe(-1);
  });

  it('decodes dates', () => {
    const buf = Buffer.alloc(10);
    buf[0] = 0x08;
    buf[1] = 0x01; // inline
    buf.writeDoubleBE(86400000, 2);
    const d = decodeAmf3(buf) as Date;
    expect(d.getTime()).toBe(86400000);
  });

  it('decodes byte arrays', () => {
    const bytes = decodeAmf3(Buffer.from([0x0c, 0x07, 0x01, 0x02, 0x03])) as Buffer;
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it('decodes dictionaries', () => {
    // { 'k': 5 }
    const dict = decodeAmf3(Buffer.from([0x11, 0x03, 0x00, 0x06, 0x03, 0x6b, 0x04, 0x05])) as Map<unknown, unknown>;
    expect(dict.get('k')).toBe(5);
  });

  it('decodes int vectors including negative values', () => {
    const buf = Buffer.from([0x0d, 0x05, 0x00, 0x00, 0x00, 0x00, 0x01, 0xff, 0xff, 0xff, 0xff]);
    expect(decodeAmf3(buf)).toEqual([1, -1]);
  });
});

describe('decodeAmf3 — reference tables', () => {
  it('resolves traits references (second object of the same class)', () => {
    // obj1: class T, member a = 1 (inline traits) — obj2: traits ref 0, a = 2
    const buf = Buffer.from([
      0x09, 0x05, 0x01, // array of 2
      0x0a, 0x13, 0x03, 0x54, 0x03, 0x61, 0x04, 0x01, // {__class: 'T', a: 1}
      0x0a, 0x01, 0x04, 0x02, // traits-ref → {__class: 'T', a: 2}
    ]);
    const arr = decodeAmf3(buf) as Amf3Object[];
    expect(arr[0]!.__class).toBe('T');
    expect(arr[0]!.a).toBe(1);
    expect(arr[1]!.__class).toBe('T');
    expect(arr[1]!.a).toBe(2);
  });

  it('resolves object references (same object appearing twice)', () => {
    const buf = Buffer.from([
      0x09, 0x05, 0x01, // array of 2 (object table index 0)
      0x0a, 0x13, 0x03, 0x54, 0x03, 0x61, 0x04, 0x01, // obj (object table index 1)
      0x0a, 0x02, // object reference → index 1
    ]);
    const arr = decodeAmf3(buf) as Amf3Object[];
    expect(arr[0]).toBe(arr[1]);
  });

  it('throws on an unknown externalizable class', () => {
    const w = new Amf3Writer();
    w.writeExternalizableObject('com.example.Mystery', (w1) => w1.writeBE32(0));
    expect(() => decodeAmf3(w.toBuffer())).toThrow('com.example.Mystery');
  });

  it('throws on truncated input', () => {
    expect(() => decodeAmf3(Buffer.from([0x06, 0x0b, 0x61]))).toThrow('end of buffer');
  });
});

describe('decodeAmf3 — externalizable wrappers', () => {
  it('unwraps ArrayCollection', () => {
    const w = new Amf3Writer();
    w.writeExternalizableObject('flex.messaging.io.ArrayCollection', (w1) =>
      w1.writeArray([(w2) => w2.writeInteger(7)]),
    );
    const ext = decodeAmf3(w.toBuffer());
    expect(isAmf3Externalizable(ext)).toBe(true);
    expect(unwrapAmf3(ext)).toEqual([7]);
    // Non-wrappers pass through untouched
    expect(unwrapAmf3([1])).toEqual([1]);
    expect(unwrapAmf3(null)).toBeNull();
  });
});
