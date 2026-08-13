import { describe, it, expect } from 'bun:test';
import {
  parseAmfResponse,
  parseStudySeriesFromAmf,
  parseEunityStudyParams,
  extractServiceInstanceFromAmf,
  buildGetStudyListMetaRequest,
} from '../imagingDirectDownload';
import { Amf3Reader } from '../amf3Reader';

// ─── Helper: build a fake AMF binary with UIDs laid out like a real response ───

/**
 * Build a fake AMF binary buffer that contains DICOM UIDs in a realistic order.
 * The format mimics the eUnity getStudyListMeta response:
 * - Study UID first
 * - Then series UIDs interleaved with their instance UIDs
 * - SOP Class UIDs mixed in as metadata
 */
function buildFakeAmfBinary(opts: {
  studyUID: string;
  series: Array<{ seriesUID: string; instanceUIDs: string[] }>;
  sopClassUIDs?: string[];
}): Buffer {
  const parts: string[] = [];

  // AMF header-like bytes
  parts.push('\x00\x03com.clientoutlook.web.metaservices.AmfServicesMessage');
  parts.push('\x00\x00\x00\x00'); // code = 0 (success)

  // Study UID
  parts.push(`\x06${opts.studyUID}`);

  // SOP Class UIDs (these should be filtered out)
  for (const sop of opts.sopClassUIDs || ['1.2.840.10008.5.1.4.1.1.2']) {
    parts.push(`\x06${sop}`);
  }

  // Series and their instances, in order
  for (const s of opts.series) {
    parts.push(`\x06${s.seriesUID}`);
    for (const inst of s.instanceUIDs) {
      parts.push(`\x06${inst}`);
    }
  }

  return Buffer.from(parts.join(''), 'latin1');
}

// ─── parseAmfResponse ───

describe('parseAmfResponse', () => {
  it('parses a successful AMF response (code 0)', () => {
    // Build AMF with "code" followed by integer marker 0x04 and value 0
    const buf = Buffer.from(
      'headercode\x04\x00\x01',
      'latin1'
    );
    const result = parseAmfResponse(buf);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(0);
  });

  it('parses an error AMF response (code != 0)', () => {
    const buf = Buffer.from(
      'headercode\x04\x05\x01',
      'latin1'
    );
    const result = parseAmfResponse(buf);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(5);
  });

  it('returns null for empty buffer', () => {
    expect(parseAmfResponse(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for buffer without code field', () => {
    expect(parseAmfResponse(Buffer.from('no code field here'))).toBeNull();
  });
});

// ─── parseStudySeriesFromAmf ───

describe('parseStudySeriesFromAmf', () => {
  it('returns null for empty buffer', () => {
    expect(parseStudySeriesFromAmf(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for buffer with no DICOM UIDs', () => {
    expect(parseStudySeriesFromAmf(Buffer.from('no uids here'))).toBeNull();
  });

  it('parses a simple X-ray study with one series and one instance', () => {
    const buf = buildFakeAmfBinary({
      studyUID: '1.2.840.114350.2.539.1.12345',
      series: [
        { seriesUID: '1.2.840.113619.2.55.3.123456.100', instanceUIDs: ['1.2.840.113619.2.55.3.123456.200.1'] },
      ],
    });
    const result = parseStudySeriesFromAmf(buf);
    expect(result).not.toBeNull();
    expect(result!.studyUID).toBe('1.2.840.114350.2.539.1.12345');
    expect(result!.series.length).toBeGreaterThanOrEqual(1);
  });

  it('parses multi-slice series correctly (CT-like)', () => {
    // Simulate a CT scan: one series with many sequential instance UIDs
    const instanceUIDs = Array.from({ length: 47 }, (_, i) =>
      `1.2.840.113619.2.437.3.163582262.142.1644587903.267.${i + 1}`
    );

    const buf = buildFakeAmfBinary({
      studyUID: '1.2.276.0.45.1.3.11.3279576776.2952347416',
      series: [
        {
          seriesUID: '1.2.840.113619.2.437.3.163582262.142.1644587903.265',
          instanceUIDs,
        },
      ],
    });

    const result = parseStudySeriesFromAmf(buf);
    expect(result).not.toBeNull();
    // Should have all 47 instances
    const totalInstances = result!.series.length;
    expect(totalInstances).toBe(47);
    // All should share the same seriesUID
    const uniqueSeries = new Set(result!.series.map(s => s.seriesUID));
    expect(uniqueSeries.size).toBe(1);
  });

  it('parses multiple series with different instance counts', () => {
    const buf = buildFakeAmfBinary({
      studyUID: '1.2.276.0.45.1.3.11.100.200',
      series: [
        {
          seriesUID: '1.2.840.113619.2.437.3.100.260',
          instanceUIDs: ['1.2.840.113619.2.437.3.100.262.1'],
        },
        {
          seriesUID: '1.2.840.113619.2.437.3.100.265',
          instanceUIDs: Array.from({ length: 10 }, (_, i) =>
            `1.2.840.113619.2.437.3.100.267.${i + 1}`
          ),
        },
        {
          seriesUID: '1.2.840.113619.2.437.3.100.265.3',
          instanceUIDs: Array.from({ length: 5 }, (_, i) =>
            `1.2.840.113619.2.437.3.100.318.${i + 1}`
          ),
        },
      ],
    });

    const result = parseStudySeriesFromAmf(buf);
    expect(result).not.toBeNull();
    // Total entries should be 1 + 10 + 5 = 16
    expect(result!.series.length).toBe(16);
  });

  it('filters out DICOM SOP Class UIDs', () => {
    const buf = buildFakeAmfBinary({
      studyUID: '1.2.276.0.45.1.3.11.100.200',
      sopClassUIDs: [
        '1.2.840.10008.5.1.4.1.1.2',     // CT Image Storage
        '1.2.840.10008.5.1.4.1.1.7',     // Secondary Capture
        '1.2.840.10008.5.1.4.1.1.88.22', // Enhanced SR
      ],
      series: [
        {
          seriesUID: '1.2.840.113619.2.437.3.100.265',
          instanceUIDs: ['1.2.840.113619.2.437.3.100.267.1'],
        },
      ],
    });

    const result = parseStudySeriesFromAmf(buf);
    expect(result).not.toBeNull();
    // SOP Class UIDs should not appear in the results
    const allUIDs = [result!.studyUID, ...result!.series.map(s => s.seriesUID), ...result!.series.map(s => s.instanceUID)];
    for (const uid of allUIDs) {
      expect(uid.startsWith('1.2.840.10008.')).toBe(false);
    }
  });

  it('handles series with different OID roots (like COR/SAG)', () => {
    // COR and SAG use a different OID root than the main series
    const buf = buildFakeAmfBinary({
      studyUID: '1.2.276.0.45.1.3.11.100.200',
      series: [
        {
          seriesUID: '1.2.840.113619.2.437.3.100.265',
          instanceUIDs: Array.from({ length: 3 }, (_, i) =>
            `1.2.840.113619.2.437.3.100.267.${i + 1}`
          ),
        },
        {
          // Different OID root for COR
          seriesUID: '1.2.840.113619.2.5.163582262.21241718.601',
          instanceUIDs: Array.from({ length: 4 }, (_, i) =>
            `1.2.840.113619.2.5.42240442.11628.${214 + i * 2}`
          ),
        },
      ],
    });

    const result = parseStudySeriesFromAmf(buf);
    expect(result).not.toBeNull();
    // Should have 3 + 4 = 7 total entries
    expect(result!.series.length).toBe(7);
    // Should have entries from both OID roots
    const hasMainRoot = result!.series.some(s => s.seriesUID.includes('437'));
    const hasCORRoot = result!.series.some(s => s.seriesUID.includes('163582262'));
    expect(hasMainRoot).toBe(true);
    expect(hasCORRoot).toBe(true);
  });

  it('uses first UID as study UID without relying on hardcoded prefixes', () => {
    // Use a completely custom OID root — should still work
    const buf = buildFakeAmfBinary({
      studyUID: '1.3.6.1.4.1.99999.1.2.3.4',
      series: [
        {
          seriesUID: '1.3.6.1.4.1.99999.2.100',
          instanceUIDs: ['1.3.6.1.4.1.99999.2.200.1'],
        },
      ],
    });

    const result = parseStudySeriesFromAmf(buf);
    expect(result).not.toBeNull();
    expect(result!.studyUID).toBe('1.3.6.1.4.1.99999.1.2.3.4');
  });
});

// ─── parseEunityStudyParams ───

describe('parseEunityStudyParams', () => {
  it('extracts params from URL query string', () => {
    const url = 'https://myimages.example.com/e/viewer?accession=12345&serviceInstance=MyChart&patientId=67890';
    const result = parseEunityStudyParams(url);
    expect(result).not.toBeNull();
    expect(result!.accession).toBe('12345');
    expect(result!.serviceInstance).toBe('MyChart');
    expect(result!.patientId).toBe('67890');
  });

  it('extracts params from viewer HTML body JSON', () => {
    const url = 'https://myimages.example.com/e/viewer?CLOAccessKeyID=abc&arg=encrypted';
    const body = `
      some html content
      "accessionNumber":"E48330984"
      "serviceInstance":"TestBundle"
      "patientId":"12345$$$SITE"
      more content
    `;
    const result = parseEunityStudyParams(url, body);
    expect(result).not.toBeNull();
    expect(result!.accession).toBe('E48330984');
    expect(result!.serviceInstance).toBe('TestBundle');
    expect(result!.patientId).toBe('12345$$$SITE');
  });

  it('returns null when params cannot be extracted', () => {
    const url = 'https://myimages.example.com/e/viewer?CLOAccessKeyID=abc&arg=encrypted';
    const result = parseEunityStudyParams(url);
    expect(result).toBeNull();
  });

  it('extracts params from pipe-delimited arg', () => {
    const url = 'https://myimages.example.com/e/viewer?arg=ACC123|ServiceInst|PatID456';
    const result = parseEunityStudyParams(url);
    expect(result).not.toBeNull();
    expect(result!.accession).toBe('ACC123');
    expect(result!.serviceInstance).toBe('ServiceInst');
    expect(result!.patientId).toBe('PatID456');
  });
});

// ─── extractServiceInstanceFromAmf ───

describe('extractServiceInstanceFromAmf', () => {
  it('extracts a different serviceInstance from AMF response', () => {
    const buf = Buffer.from(
      'some binary data UCSFVNAEDGEBundle more data serviceInstance MyChart end',
      'latin1'
    );
    const result = extractServiceInstanceFromAmf(buf, 'MyChart');
    expect(result).toBe('UCSFVNAEDGEBundle');
  });

  it('returns null when no different serviceInstance is found', () => {
    const buf = Buffer.from('some binary data MyChart more data', 'latin1');
    const result = extractServiceInstanceFromAmf(buf, 'MyChart');
    expect(result).toBeNull();
  });

  it('ignores ServiceInstance and ServiceInstanceParameter field names', () => {
    const buf = Buffer.from(
      'ServiceInstance ServiceInstanceParameter someOtherData',
      'latin1'
    );
    const result = extractServiceInstanceFromAmf(buf, 'MyChart');
    // Should not match ServiceInstance or ServiceInstanceParameter
    expect(result).toBeNull();
  });

  it('finds various serviceInstance naming patterns', () => {
    const patterns = [
      { input: 'SomeHospitalBundle', expected: 'SomeHospitalBundle' },
      { input: 'SPRINGFIELDStudyStrategy', expected: 'SPRINGFIELDStudyStrategy' },
      { input: 'UCLAVNAEDGEBundle', expected: 'UCLAVNAEDGEBundle' },
    ];

    for (const { input, expected } of patterns) {
      const buf = Buffer.from(`data ${input} more`, 'latin1');
      const result = extractServiceInstanceFromAmf(buf, 'MyChart');
      expect(result).toBe(expected);
    }
  });
});

// ─── buildGetStudyListMetaRequest ───

describe('buildGetStudyListMetaRequest', () => {
  it('returns a Buffer containing the accession number', () => {
    const buf = buildGetStudyListMetaRequest('ACC123', 'MyChart', 'PAT456');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    const text = buf.toString('latin1');
    expect(text).toContain('ACC123');
    expect(text).toContain('MyChart');
    expect(text).toContain('PAT456');
  });

  it('includes AMF class names', () => {
    const buf = buildGetStudyListMetaRequest('ACC', 'SI', 'PID');
    const text = buf.toString('latin1');
    expect(text).toContain('AmfServicesMessage');
    expect(text).toContain('getStudyListMeta');
    expect(text).toContain('StudyService');
  });

  it('produces different output for different params', () => {
    const buf1 = buildGetStudyListMetaRequest('ACC1', 'SI1', 'PID1');
    const buf2 = buildGetStudyListMetaRequest('ACC2', 'SI2', 'PID2');
    expect(buf1.equals(buf2)).toBe(false);
  });
});

// ─── AMF3 frame integrity ───

/**
 * The frames below are decoded with the production `Amf3Reader` — the same
 * decoder that parses getStudyListMeta responses. An encoder round-tripped
 * through a decoder that grew up next to it would agree with any shared
 * misreading of the AMF3 spec, so the round-trip alone is not the evidence
 * here: `GOLDEN_FRAME_HEX` is. It pins the writer byte-for-byte to a frame a
 * real eUnity server accepted, and no shared writer/reader bug survives that.
 * The structural decodes then say *which* field moved when the bytes change.
 */

/**
 * Walk a decoded frame down to its single RequestedPHI object — the leaf that
 * carries the caller's arguments, six levels of nesting below the root.
 */
function requestedPhiOf(decoded: unknown): Record<string, unknown> {
  const frame = decoded as {
    body: {
      parameters: { value: { payload: { requestedPHI: { value: Record<string, unknown>[] } } } }[];
    };
  };
  const phi = frame.body?.parameters?.[0]?.value?.payload?.requestedPHI?.value?.[0];
  if (!phi) throw new Error('decoded frame carried no RequestedPHI');
  return phi;
}

// Synthetic values — not from any real patient or study.
const ACCESSION = 'ACC0000001';
const SERVICE_INSTANCE = 'EXAMPLEstudystrategy';
const PATIENT_ID = 'MRN000000$$$EXAMPLESITE';

/**
 * The exact bytes `buildGetStudyListMetaRequest(ACCESSION, SERVICE_INSTANCE,
 * PATIENT_ID)` emits, captured from a build verified byte-for-byte against the
 * implementation as it stood before the `no-shadow` refactor (#257).
 *
 * eUnity's AMF protocol was reverse-engineered from captured browser traffic
 * and there is no server-side schema to validate against — a single wrong byte
 * yields a corrupt frame that the server rejects with a 403 rather than a
 * useful error, and the failure only ever shows up against a live eUnity
 * instance. So this is pinned. **Do not re-record this fixture to make a
 * failing test pass**: if a change moves these bytes, the frame changed, and
 * the question to answer is why.
 */
const GOLDEN_FRAME_HEX =
  '0a336b636f6d2e636c69656e746f75746c6f6f6b2e7765622e6d65746173657276696365' +
  '732e416d6653657276696365734d657373616765136d6573736167654944176d65737361' +
  '67655479706509626f647906254854545053696d706c654c6f616465725f31060963616c' +
  '6c0a336b636f6d2e636c69656e746f75746c6f6f6b2e7765622e6d657461736572766963' +
  '65732e416d665365727669636573526571756573740f736572766963650d6d6574686f64' +
  '15706172616d65746572730619537475647953657276696365062167657453747564794c' +
  '6973744d6574610903010a0767636f6d2e636c69656e746f75746c6f6f6b2e7765622e6d' +
  '65746173657276696365732e53747564794c697374526571756573740000000206196765' +
  '7453747564794c697374060b312e322e300a33010f6e6f74557365641972657175657374' +
  '656450484917656e7669726f6e6d656e74030a0743666c65782e6d6573736167696e672e' +
  '696f2e4172726179436f6c6c656374696f6e0903010a810347636f6d2e636c69656e746f' +
  '75746c6f6f6b2e646174612e5265717565737465645048491370617469656e7449641173' +
  '747564795549441f616363657373696f6e4e756d6265723173657276696365496e737461' +
  '6e6365506172616d657465723373657276696365496e7374616e636550726f7065727469' +
  '65731f73657276696365496e7374616e6365416f726967696e616c53657276696365496e' +
  '7374616e6365506172616d657465722f6f726967696e616c53657276696365496e737461' +
  '6e6365062f4d524e3030303030302424244558414d504c45534954450106154143433030' +
  '303030303106010106294558414d504c45737475647973747261746567790601063c0a63' +
  '65636f6d2e636c69656e746f75746c6f6f6b2e646174612e68616e67696e6770726f746f' +
  '636f6c2e456e7669726f6e6d656e74156c6576656c56616c75650b6c6576656c09757365' +
  '720b726f6c65730d6465766963651f6e756d6265724f6653637265656e73010400010106' +
  '07574542060331';

describe('buildGetStudyListMetaRequest — AMF3 frame integrity', () => {
  it('decodes to the exact structure the eUnity protocol expects', () => {
    const reader = new Amf3Reader(buildGetStudyListMetaRequest(ACCESSION, SERVICE_INSTANCE, PATIENT_ID));

    expect(reader.readValue()).toEqual({
      __class: 'com.clientoutlook.web.metaservices.AmfServicesMessage',
      // Member order is load-bearing for sealed traits: messageID before messageType.
      messageID: 'HTTPSimpleLoader_1',
      messageType: 'call',
      body: {
        __class: 'com.clientoutlook.web.metaservices.AmfServicesRequest',
        service: 'StudyService',
        method: 'getStudyListMeta',
        parameters: [
          {
            __class: 'com.clientoutlook.web.metaservices.StudyListRequest',
            __externalizable: true,
            value: {
              header: 2,
              qualifier: 'getStudyList',
              version: '1.2.0',
              payload: {
                __class: '', // anonymous
                notUsed: true,
                requestedPHI: {
                  __class: 'flex.messaging.io.ArrayCollection',
                  __externalizable: true,
                  value: [
                    {
                      __class: 'com.clientoutlook.data.RequestedPHI',
                      patientId: PATIENT_ID,
                      studyUID: null,
                      accessionNumber: ACCESSION,
                      serviceInstanceParameter: '',
                      serviceInstanceProperties: null,
                      serviceInstance: SERVICE_INSTANCE,
                      originalServiceInstanceParameter: '',
                      originalServiceInstance: SERVICE_INSTANCE,
                    },
                  ],
                },
                environment: {
                  __class: 'com.clientoutlook.data.hangingprotocol.Environment',
                  levelValue: null,
                  level: 0,
                  user: null,
                  roles: null,
                  device: 'WEB',
                  numberOfScreens: '1',
                },
              },
            },
          },
        ],
      },
    });
  });

  it('emits a frame with no trailing or missing bytes', () => {
    const buf = buildGetStudyListMetaRequest(ACCESSION, SERVICE_INSTANCE, PATIENT_ID);
    const reader = new Amf3Reader(buf);
    reader.readValue();
    expect(reader.offset).toBe(buf.length);
  });

  it('writes every nested value through one shared writer', () => {
    // The frame is built by a tree of callbacks nested six deep, each handed a
    // writer. They must all be handed the *same* writer: the AMF3 string
    // reference table lives on the writer, so a callback that wrote to a fresh
    // one would restart the table and shift every later index.
    //
    // `serviceInstance` is the observable. It appears twice in RequestedPHI, so
    // a shared table encodes the second as a back-reference — the string
    // occurs exactly once in the raw bytes. A broken writer chain inlines it a
    // second time instead — same decoded value, different bytes, and every
    // subsequent reference index off by one.
    const buf = buildGetStudyListMetaRequest(ACCESSION, SERVICE_INSTANCE, PATIENT_ID);
    const phi = requestedPhiOf(new Amf3Reader(buf).readValue());

    expect(phi.serviceInstance).toBe(SERVICE_INSTANCE);
    expect(phi.originalServiceInstance).toBe(SERVICE_INSTANCE);

    const occurrences = buf.toString('latin1').split(SERVICE_INSTANCE).length - 1;
    expect(occurrences).toBe(1);
  });

  it('matches the recorded frame byte for byte', () => {
    const buf = buildGetStudyListMetaRequest(ACCESSION, SERVICE_INSTANCE, PATIENT_ID);
    expect(buf.toString('hex')).toBe(GOLDEN_FRAME_HEX);
  });

  it('prefixes strings with their UTF-8 byte length, not their character count', () => {
    // A multi-byte accession would desynchronize the whole frame if the length
    // prefix counted characters.
    const accession = 'ACC-Ω-ünïcodé';
    expect(accession.length).not.toBe(Buffer.byteLength(accession, 'utf-8'));

    const reader = new Amf3Reader(buildGetStudyListMetaRequest(accession, SERVICE_INSTANCE, PATIENT_ID));
    expect(requestedPhiOf(reader.readValue()).accessionNumber).toBe(accession);
  });

  it('encodes string lengths across every U29 width the fields can reach', () => {
    // U29 is variable-width; the branch is chosen by (byteLength << 1) | 1.
    // 1-byte prefix < 0x80, 2-byte < 0x4000, 3-byte < 0x200000.
    for (const length of [10, 100, 9000]) {
      const accession = 'A'.repeat(length);
      const reader = new Amf3Reader(buildGetStudyListMetaRequest(accession, SERVICE_INSTANCE, PATIENT_ID));
      expect(requestedPhiOf(reader.readValue()).accessionNumber).toBe(accession);
    }
  });

  it('keeps empty strings inline and out of the reference table', () => {
    // Both empty members must stay inline. If the writer added the empty
    // string to its reference table, every index after it would shift by one
    // and the spec-correct reader (which never tables the empty string) would
    // decode later fields as the wrong strings — these assertions and the
    // structure test above would both fail.
    const phi = requestedPhiOf(
      new Amf3Reader(buildGetStudyListMetaRequest(ACCESSION, SERVICE_INSTANCE, PATIENT_ID)).readValue(),
    );

    expect(phi.serviceInstanceParameter).toBe('');
    expect(phi.originalServiceInstanceParameter).toBe('');
  });
});
