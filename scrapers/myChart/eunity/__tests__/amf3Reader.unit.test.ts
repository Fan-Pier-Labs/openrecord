import { describe, it, expect } from 'bun:test';
import {
  decodeAmf3,
  collectAmf3Objects,
  unwrapAmf3,
  isAmf3Externalizable,
  Amf3Object,
} from '../amf3Reader';
import { AMF3Writer, parseStudySeriesFromAmfStructured } from '../imagingDirectDownload';

// The fixtures are built with the real AMF3Writer — the same code whose output
// was byte-for-byte verified against eUnity's browser traffic — so the reader
// is tested against genuine AMF3, not bytes invented in this file.

describe('decodeAmf3 — scalars and strings', () => {
  it('round-trips a sealed typed object with strings, integers and booleans', () => {
    const w = new AMF3Writer();
    w.writeTypedObject('com.example.Thing', ['name', 'count', 'good', 'missing'], [
      (w) => w.writeString('hello'),
      (w) => w.writeInteger(42),
      (w) => w.writeTrue(),
      (w) => w.writeNull(),
    ]);
    const obj = decodeAmf3(w.toBuffer()) as Amf3Object;
    expect(obj.__class).toBe('com.example.Thing');
    expect(obj.name).toBe('hello');
    expect(obj.count).toBe(42);
    expect(obj.good).toBe(true);
    expect(obj.missing).toBeNull();
  });

  it('resolves string references (same string written twice)', () => {
    const w = new AMF3Writer();
    w.writeArray([
      (w) => w.writeString('repeated'),
      (w) => w.writeString('repeated'), // writer emits a reference here
    ]);
    const arr = decodeAmf3(w.toBuffer()) as unknown[];
    expect(arr).toEqual(['repeated', 'repeated']);
  });

  it('decodes dynamic objects', () => {
    const w = new AMF3Writer();
    w.writeDynamicObject('', ['sealed'], [(w) => w.writeInteger(1)], [
      ['extra', (w) => w.writeString('dyn')],
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
    expect(arr[0].__class).toBe('T');
    expect(arr[0].a).toBe(1);
    expect(arr[1].__class).toBe('T');
    expect(arr[1].a).toBe(2);
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
    const w = new AMF3Writer();
    w.writeExternalizableObject('com.example.Mystery', (w) => w.writeBE32(0));
    expect(() => decodeAmf3(w.toBuffer())).toThrow('com.example.Mystery');
  });

  it('throws on truncated input', () => {
    expect(() => decodeAmf3(Buffer.from([0x06, 0x0b, 0x61]))).toThrow('end of buffer');
  });
});

describe('decodeAmf3 — externalizable wrappers', () => {
  it('unwraps ArrayCollection', () => {
    const w = new AMF3Writer();
    w.writeExternalizableObject('flex.messaging.io.ArrayCollection', (w) =>
      w.writeArray([(w) => w.writeInteger(7)]),
    );
    const ext = decodeAmf3(w.toBuffer());
    expect(isAmf3Externalizable(ext)).toBe(true);
    expect(unwrapAmf3(ext)).toEqual([7]);
    // Non-wrappers pass through untouched
    expect(unwrapAmf3([1])).toEqual([1]);
    expect(unwrapAmf3(null)).toBeNull();
  });
});

// ─── Structured getStudyListMeta parsing ───

/** Series description → instance UIDs, in the shape eUnity nests them. */
interface FakeSeries {
  uid: string;
  description: string;
  frameOfReferenceUID?: string;
  instances: Array<{ uid: string; instanceNumber: number }>;
}

interface FakeStudy {
  uid: string;
  accessionNumber: string;
  series: FakeSeries[];
}

/**
 * Build a getStudyListMeta response with the same structure observed on Mass
 * General Brigham's eUnity: AmfServicesMessage → AmfServicesResponse →
 * StudyListResponse (externalizable: BE32, DataRequestStatus, version string,
 * BE32, payload) → studyList ArrayCollection → Study → series ArrayCollection
 * → Series → images ArrayCollection → Image.
 */
function buildStudyListMetaResponse(studies: FakeStudy[]): Buffer {
  const w = new AMF3Writer();
  const writeCollection = (items: ((w: AMF3Writer) => void)[]) => (w: AMF3Writer) =>
    w.writeExternalizableObject('flex.messaging.io.ArrayCollection', (w) => w.writeArray(items));

  const writeImage = (img: { uid: string; instanceNumber: number }) => (w: AMF3Writer) =>
    w.writeTypedObject('com.clientoutlook.data.Image', ['uid', 'instanceNumber'], [
      (w) => w.writeString(img.uid),
      (w) => w.writeInteger(img.instanceNumber),
    ]);

  const writeSeries = (s: FakeSeries) => (w: AMF3Writer) =>
    w.writeTypedObject(
      'com.clientoutlook.data.Series',
      ['uid', 'description', 'frameOfReferenceUID', 'images'],
      [
        (w) => w.writeString(s.uid),
        (w) => w.writeString(s.description),
        (w) => (s.frameOfReferenceUID ? w.writeString(s.frameOfReferenceUID) : w.writeNull()),
        writeCollection(s.instances.map(writeImage)),
      ],
    );

  const writeStudy = (st: FakeStudy) => (w: AMF3Writer) =>
    w.writeTypedObject(
      'com.clientoutlook.data.Study',
      ['uid', 'accessionNumber', 'description', 'series'],
      [
        (w) => w.writeString(st.uid),
        (w) => w.writeString(st.accessionNumber),
        (w) => w.writeString('STUDY DESCRIPTION'),
        writeCollection(st.series.map(writeSeries)),
      ],
    );

  w.writeTypedObject(
    'com.clientoutlook.web.metaservices.AmfServicesMessage',
    ['messageType', 'messageID', 'body'],
    [
      (w) => w.writeString('response'),
      (w) => w.writeString('HTTPSimpleLoader_1'),
      (w) =>
        w.writeTypedObject('com.clientoutlook.web.metaservices.AmfServicesResponse', ['code', 'response'], [
          (w) => w.writeInteger(0),
          (w) =>
            w.writeExternalizableObject('com.clientoutlook.web.metaservices.StudyListResponse', (w) => {
              w.writeBE32(2);
              w.writeTypedObject('com.clientoutlook.data.DataRequestStatus', ['statusCode'], [
                (w) => w.writeInteger(0),
              ]);
              w.writeString('1.0.0');
              w.writeBE32(0xeb);
              w.writeTypedObject('', ['studySelectors', 'seriesSelectors', 'studyList', 'hangingProtocols', 'relevantStudyList'], [
                (w) => w.writeNull(),
                (w) => w.writeNull(),
                writeCollection(studies.map(writeStudy)),
                (w) => w.writeNull(),
                (w) => w.writeNull(),
              ]);
            }),
        ]),
    ],
  );
  return w.toBuffer();
}

describe('parseStudySeriesFromAmfStructured', () => {
  // The exact shape the positional heuristic got wrong on Mass General
  // Brigham: Siemens-style UIDs where series and instance UIDs share one
  // parent prefix, plus a frameOfReferenceUID red herring. The heuristic took
  // the frame-of-reference UID for a series UID and the series UIDs for
  // instances; the structured parse must produce the exact pairs.
  const SIEMENS_ROOT = '1.3.12.2.1107.5.2.43.99999';
  const mriStudy: FakeStudy = {
    uid: '1.2.840.114350.2.362.2.123456.2.1.1',
    accessionNumber: 'E00000001',
    series: [
      {
        uid: `${SIEMENS_ROOT}.30000010101010101010100000006`,
        description: 'Scout',
        frameOfReferenceUID: `${SIEMENS_ROOT}.2.20240000000000000.0.0.0`,
        instances: [
          { uid: `${SIEMENS_ROOT}.30000010101010101010100000008`, instanceNumber: 1 },
          { uid: `${SIEMENS_ROOT}.30000010101010101010100000009`, instanceNumber: 2 },
        ],
      },
      {
        uid: `${SIEMENS_ROOT}.30000020202020202020200000028`,
        description: 'Axial',
        frameOfReferenceUID: `${SIEMENS_ROOT}.2.20240000000000000.0.0.0`,
        instances: [
          // Deliberately out of order — must sort by instanceNumber
          { uid: `${SIEMENS_ROOT}.30000020202020202020200000031`, instanceNumber: 2 },
          { uid: `${SIEMENS_ROOT}.30000020202020202020200000030`, instanceNumber: 1 },
        ],
      },
    ],
  };

  it('produces exact (seriesUID, instanceUID) pairs with real descriptions', () => {
    const result = parseStudySeriesFromAmfStructured(buildStudyListMetaResponse([mriStudy]));
    expect(result).not.toBeNull();
    expect(result!.studyUID).toBe(mriStudy.uid);
    expect(result!.series).toEqual([
      {
        seriesUID: `${SIEMENS_ROOT}.30000010101010101010100000006`,
        instanceUID: `${SIEMENS_ROOT}.30000010101010101010100000008`,
        seriesDescription: 'Scout',
      },
      {
        seriesUID: `${SIEMENS_ROOT}.30000010101010101010100000006`,
        instanceUID: `${SIEMENS_ROOT}.30000010101010101010100000009`,
        seriesDescription: 'Scout',
      },
      {
        seriesUID: `${SIEMENS_ROOT}.30000020202020202020200000028`,
        instanceUID: `${SIEMENS_ROOT}.30000020202020202020200000030`,
        seriesDescription: 'Axial',
      },
      {
        seriesUID: `${SIEMENS_ROOT}.30000020202020202020200000028`,
        instanceUID: `${SIEMENS_ROOT}.30000020202020202020200000031`,
        seriesDescription: 'Axial',
      },
    ]);
  });

  it('never uses the frameOfReferenceUID as a series or instance UID', () => {
    const result = parseStudySeriesFromAmfStructured(buildStudyListMetaResponse([mriStudy]))!;
    for (const entry of result.series) {
      expect(entry.seriesUID).not.toContain('.0.0.0');
      expect(entry.instanceUID).not.toContain('.0.0.0');
    }
  });

  it('selects the study matching the accession when priors are present', () => {
    const prior: FakeStudy = {
      uid: '1.2.840.114350.2.362.2.123456.2.9.9',
      accessionNumber: 'E00000009',
      series: [
        {
          uid: `${SIEMENS_ROOT}.40000000000000000000000000001`,
          description: 'Prior series',
          instances: [{ uid: `${SIEMENS_ROOT}.40000000000000000000000000002`, instanceNumber: 1 }],
        },
      ],
    };
    const buf = buildStudyListMetaResponse([prior, mriStudy]);
    const result = parseStudySeriesFromAmfStructured(buf, 'E00000001');
    expect(result!.studyUID).toBe(mriStudy.uid);
    // Without an accession, the first study with series wins
    expect(parseStudySeriesFromAmfStructured(buf)!.studyUID).toBe(prior.uid);
  });

  it('returns null on undecodable input so callers fall back to the heuristic', () => {
    expect(parseStudySeriesFromAmfStructured(Buffer.from('not amf at all'))).toBeNull();
    expect(parseStudySeriesFromAmfStructured(Buffer.alloc(0))).toBeNull();
  });

  it('returns null when the response has no studies or no instances', () => {
    expect(parseStudySeriesFromAmfStructured(buildStudyListMetaResponse([]))).toBeNull();
    const empty: FakeStudy = { uid: '1.2.3.4.5.6', accessionNumber: 'E1', series: [] };
    expect(parseStudySeriesFromAmfStructured(buildStudyListMetaResponse([empty]))).toBeNull();
  });

  it('collectAmf3Objects finds reference-shared objects exactly once', () => {
    const buf = buildStudyListMetaResponse([mriStudy]);
    const root = decodeAmf3(buf);
    expect(collectAmf3Objects(root, 'com.clientoutlook.data.Study')).toHaveLength(1);
    expect(collectAmf3Objects(root, 'com.clientoutlook.data.Series')).toHaveLength(2);
    expect(collectAmf3Objects(root, 'com.clientoutlook.data.Image')).toHaveLength(4);
  });
});
