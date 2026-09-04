/**
 * Round-trips the shared AMF3 writer through the repo's AMF3 reader.
 *
 * The reader lives on the scraper side (nothing else decodes AMF3), and this
 * suite deliberately crosses that boundary: the writer's whole job is to
 * produce bytes that reader accepts. What keeps the pair from agreeing on a
 * shared misreading of the spec is GOLDEN_FRAME_HEX in
 * `scrapers/myChart/eunity/__tests__/amf.unit.test.ts`, which
 * pins the writer to bytes a real eUnity server accepted.
 */
import { describe, expect, it } from 'bun:test';
import { Amf3Writer, amf3ArrayCollection, amf3Double } from '../amf3Writer';
import { Amf3Reader } from '../../scrapers/myChart/eunity/amf3Reader';

describe('Amf3Writer — value style', () => {
  it('writes and reads back integer', () => {
    const writer = new Amf3Writer();
    writer.writeValue(42);
    expect(new Amf3Reader(writer.toBuffer()).readValue()).toBe(42);
  });

  it('writes and reads back double', () => {
    const writer = new Amf3Writer();
    writer.writeValue(3.14);
    expect(new Amf3Reader(writer.toBuffer()).readValue()).toBeCloseTo(3.14);
  });

  it('writes and reads back string', () => {
    const writer = new Amf3Writer();
    writer.writeValue('hello world');
    expect(new Amf3Reader(writer.toBuffer()).readValue()).toBe('hello world');
  });

  it('writes and reads back boolean values', () => {
    const writer = new Amf3Writer();
    writer.writeValue(true);
    writer.writeValue(false);
    const reader = new Amf3Reader(writer.toBuffer());
    expect(reader.readValue()).toBe(true);
    expect(reader.readValue()).toBe(false);
  });

  it('writes and reads back null', () => {
    const writer = new Amf3Writer();
    writer.writeValue(null);
    expect(new Amf3Reader(writer.toBuffer()).readValue()).toBeNull();
  });

  it('writes and reads back object with mixed types', () => {
    const writer = new Amf3Writer();
    writer.writeValue({ _class: 'TestClass', name: 'test', count: 42, ratio: 1.5 });
    const result = new Amf3Reader(writer.toBuffer()).readValue() as Record<string, unknown>;
    expect(result.__class).toBe('TestClass');
    expect(result.name).toBe('test');
    expect(result.count).toBe(42);
    expect(result.ratio).toBe(1.5);
  });

  it("encodes negative integers as 29-bit two's complement, and the reader sign-extends them", () => {
    const writer = new Amf3Writer();
    writer.writeValue(-1);
    writer.writeValue(-268435456); // -2^28, the most negative AMF3 integer
    writer.writeValue(-268435457); // one past the range — must fall back to double
    const buf = writer.toBuffer();
    expect(buf[0]).toBe(0x04); // integer marker, not double
    const reader = new Amf3Reader(buf);
    expect(reader.readValue()).toBe(-1);
    expect(reader.readValue()).toBe(-268435456);
    expect(reader.readValue()).toBe(-268435457);
  });

  it('keeps the double marker for an integral value wrapped in amf3Double', () => {
    // Spatial values are DICOM decimals on a real wire; a slice that happens
    // to sit at z=0 must not go out as an AMF3 integer.
    const writer = new Amf3Writer();
    writer.writeValue(amf3Double(0));
    const buf = writer.toBuffer();
    expect(buf[0]).toBe(0x05);
    expect(new Amf3Reader(buf).readValue()).toBe(0);
  });

  it('writes and reads back dense arrays', () => {
    const writer = new Amf3Writer();
    writer.writeValue(['a', 1, true]);
    expect(new Amf3Reader(writer.toBuffer()).readValue()).toEqual(['a', 1, true]);
  });

  it('writes byte arrays the reader returns as a Buffer', () => {
    const writer = new Amf3Writer();
    writer.writeValue(Buffer.from([0xaa, 0xbb, 0xcc]));
    const result = new Amf3Reader(writer.toBuffer()).readValue() as Buffer;
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(Array.from(result)).toEqual([0xaa, 0xbb, 0xcc]);
  });

  it('writes externalizable ArrayCollection nodes the strict reader unwraps', () => {
    const writer = new Amf3Writer();
    writer.writeValue(amf3ArrayCollection(['%SERIES_NUMBER%', '%WINDOW_LEVEL%']));
    const result = new Amf3Reader(writer.toBuffer()).readValue() as Record<string, unknown>;
    expect(result.__class).toBe('flex.messaging.io.ArrayCollection');
    expect(result.__externalizable).toBe(true);
    expect(result.value).toEqual(['%SERIES_NUMBER%', '%WINDOW_LEVEL%']);
  });
});

describe('Amf3Writer — string reference table', () => {
  it('emits a repeated string once and references it thereafter', () => {
    // Real servers deduplicate; a writer that doesn't leaves the reader's
    // reference table shorter than the stream expects, so any downstream
    // reference index is off by one and decodes as the wrong string.
    const writer = new Amf3Writer();
    writer.writeValue([
      { _class: 'com.clientoutlook.data.Thing', member: 'shared-value' },
      { _class: 'com.clientoutlook.data.Thing', member: 'shared-value' },
    ]);
    const buf = writer.toBuffer();
    const occurrences = buf.toString('latin1').split('com.clientoutlook.data.Thing').length - 1;
    expect(occurrences).toBe(1);

    const [first, second] = new Amf3Reader(buf).readValue() as Record<string, unknown>[];
    expect(first?.__class).toBe('com.clientoutlook.data.Thing');
    expect(second?.__class).toBe('com.clientoutlook.data.Thing');
    expect(second?.member).toBe('shared-value');
  });
});

describe('Amf3Writer — callback style', () => {
  it('round-trips sealed, dynamic and externalizable objects', () => {
    const writer = new Amf3Writer();
    writer.writeTypedObject('com.example.Sealed', ['a', 'b'], [
      (w) => w.writeString('x'),
      (w) => w.writeDynamicObject('', ['sealed'], [(w1) => w1.writeInteger(1)], [
        ['extra', (w1) => w1.writeTrue()],
      ]),
    ]);
    const obj = new Amf3Reader(writer.toBuffer()).readValue() as Record<string, unknown>;
    expect(obj.__class).toBe('com.example.Sealed');
    expect(obj.a).toBe('x');
    expect(obj.b).toMatchObject({ sealed: 1, extra: true });
  });

  it('writes ArrayCollection-wrapped arrays and raw big-endian words', () => {
    const writer = new Amf3Writer();
    writer.writeArrayCollection([(w) => w.writeInteger(7)]);
    const ext = new Amf3Reader(writer.toBuffer()).readValue() as Record<string, unknown>;
    expect(ext.__class).toBe('flex.messaging.io.ArrayCollection');
    expect(ext.value).toEqual([7]);

    const be = new Amf3Writer();
    be.writeBE32(0xeb);
    expect(be.toBuffer().readUInt32BE(0)).toBe(0xeb);
  });

  it('writes the empty string inline rather than as a reference', () => {
    // Spec §1.3.2: the empty string is never added to the reference table.
    // Getting this wrong shifts every later index by one.
    const writer = new Amf3Writer();
    writer.writeValue(['', 'a', '', 'a']);
    expect(new Amf3Reader(writer.toBuffer()).readValue()).toEqual(['', 'a', '', 'a']);
  });
});
