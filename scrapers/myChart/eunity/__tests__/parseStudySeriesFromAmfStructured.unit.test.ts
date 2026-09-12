import { describe, it, expect } from 'bun:test';
import { decodeAmf3, collectAmf3Objects } from '../../../../shared/amf3Reader';
import { parseStudySeriesFromAmfStructured } from '../imagingDirectDownload';
import { Amf3Writer } from '../../../../shared/amf3Writer';

// The fixtures are built with the real Amf3Writer — the same code whose output
// was byte-for-byte verified against eUnity's browser traffic.

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
  const root = new Amf3Writer();
  const writeCollection = (items: ((w: Amf3Writer) => void)[]) => (w: Amf3Writer) =>
    w.writeExternalizableObject('flex.messaging.io.ArrayCollection', (w1) => w1.writeArray(items));

  const writeImage = (img: { uid: string; instanceNumber: number }) => (w: Amf3Writer) =>
    w.writeTypedObject('com.clientoutlook.data.Image', ['uid', 'instanceNumber'], [
      (w1) => w1.writeString(img.uid),
      (w1) => w1.writeInteger(img.instanceNumber),
    ]);

  const writeSeries = (s: FakeSeries) => (w: Amf3Writer) =>
    w.writeTypedObject(
      'com.clientoutlook.data.Series',
      ['uid', 'description', 'frameOfReferenceUID', 'images'],
      [
        (w1) => w1.writeString(s.uid),
        (w1) => w1.writeString(s.description),
        (w1) => (s.frameOfReferenceUID ? w1.writeString(s.frameOfReferenceUID) : w1.writeNull()),
        writeCollection(s.instances.map(writeImage)),
      ],
    );

  const writeStudy = (st: FakeStudy) => (w: Amf3Writer) =>
    w.writeTypedObject(
      'com.clientoutlook.data.Study',
      ['uid', 'accessionNumber', 'description', 'series'],
      [
        (w1) => w1.writeString(st.uid),
        (w1) => w1.writeString(st.accessionNumber),
        (w1) => w1.writeString('STUDY DESCRIPTION'),
        writeCollection(st.series.map(writeSeries)),
      ],
    );

  root.writeTypedObject(
    'com.clientoutlook.web.metaservices.AmfServicesMessage',
    ['messageType', 'messageID', 'body'],
    [
      (w1) => w1.writeString('response'),
      (w1) => w1.writeString('HTTPSimpleLoader_1'),
      (w1) =>
        w1.writeTypedObject('com.clientoutlook.web.metaservices.AmfServicesResponse', ['code', 'response'], [
          (w2) => w2.writeInteger(0),
          (w2) =>
            w2.writeExternalizableObject('com.clientoutlook.web.metaservices.StudyListResponse', (w3) => {
              w3.writeBE32(2);
              w3.writeTypedObject('com.clientoutlook.data.DataRequestStatus', ['statusCode'], [
                (w4) => w4.writeInteger(0),
              ]);
              w3.writeString('1.0.0');
              w3.writeBE32(0xeb);
              w3.writeTypedObject('', ['studySelectors', 'seriesSelectors', 'studyList', 'hangingProtocols', 'relevantStudyList'], [
                (w4) => w4.writeNull(),
                (w4) => w4.writeNull(),
                writeCollection(studies.map(writeStudy)),
                (w4) => w4.writeNull(),
                (w4) => w4.writeNull(),
              ]);
            }),
        ]),
    ],
  );
  return root.toBuffer();
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
