/**
 * The shared CLO wrapper encoder, checked against the two readers that consume
 * its output in production: `parseWrapper` (display metadata) and
 * `readPatientPosition` (slice ordering).
 *
 * Both readers look members up by name and never check the AMF3 class name,
 * which is exactly how the two encoders this file replaced drifted apart
 * unnoticed — one of them named the root class `ImageDescription` instead of
 * `com.clientoutlook.data.ImageDescription`. The class-name assertions below
 * exist because nothing else in the stack would notice.
 */
import { describe, expect, it } from 'bun:test';
import { inflateSync } from 'zlib';
import {
  AXIAL_ORIENTATION,
  UNDEFINED_IMAGE_PHASE_INFO,
  encodeCloWrapper,
  linearVoiLutTable,
} from '../cloWrapper';
import { Amf3Reader } from '../../scrapers/myChart/eunity/amf3Reader';
import { parseWrapper } from '../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { readPatientPosition } from '../../scrapers/myChart/clo-image-parser/sortByPatientPosition';

const decode = (wrapper: Buffer): Record<string, unknown> =>
  new Amf3Reader(inflateSync(wrapper.subarray(16))).readValue() as Record<string, unknown>;

describe('encodeCloWrapper', () => {
  it('produces a valid CLOHEADERZ01 wrapper parseWrapper reads', () => {
    const wrapper = encodeCloWrapper({
      photometricInterpretation: 'MONOCHROME2',
      bitsStored: 16,
      windowCenter: 32768,
      windowWidth: 65536,
    });
    expect(wrapper.subarray(0, 12).toString('ascii')).toBe('CLOHEADERZ01');
    const metadata = parseWrapper(wrapper);
    expect(metadata.photometric).toBe('MONOCHROME2');
    expect(metadata.bits_stored).toBe(16);
    expect(metadata.window_center).toBe(32768);
    expect(metadata.window_width).toBe(65536);
  });

  it('handles MONOCHROME1 photometric', () => {
    const metadata = parseWrapper(encodeCloWrapper({
      photometricInterpretation: 'MONOCHROME1',
      bitsStored: 12,
    }));
    expect(metadata.photometric).toBe('MONOCHROME1');
    expect(metadata.bits_stored).toBe(12);
  });

  it('names the root class the way real servers do', () => {
    expect(decode(encodeCloWrapper({ photometricInterpretation: 'MONOCHROME2' })).__class)
      .toBe('com.clientoutlook.data.ImageDescription');
  });

  it('omits the calibration chain entirely for a projection image', () => {
    // X-rays carry no patient position, and sorting must fall back to the
    // server's order rather than to zeros.
    const wrapper = encodeCloWrapper({ photometricInterpretation: 'MONOCHROME2' });
    expect(decode(wrapper).calibration).toBeUndefined();
    expect(readPatientPosition(wrapper)).toBeNull();
  });

  it('encodes every construct real cross-sectional wrappers carry', () => {
    // One wrapper carrying everything a real MR/CT wrapper does that the flat
    // scalar metadata never reaches: a byte-array VOI LUT, externalizable
    // ArrayCollection overlays, the nested calibration chain, and
    // ImagePhaseInfo -1 sentinels (negative AMF3 integers → sign extension).
    const lut = Buffer.alloc(8);
    for (let i = 0; i < 4; i++) lut.writeUInt16LE(i * 100, i * 2);

    const wrapper = encodeCloWrapper({
      photometricInterpretation: 'MONOCHROME1',
      bitsStored: 12,
      windowCenter: 2048,
      windowWidth: 4096,
      voiLut: { lut, elements: 4, start: 0, bits: 16, lutIsLittleEndian: 1 },
      positionPatient: { x: -101.25, y: -37.5, z: 88.75 },
      frameOfReferenceUID: '1.2.840.113619.2.55.3.TEST',
      imagePhaseInfo: UNDEFINED_IMAGE_PHASE_INFO,
      includeAnnotationOverlays: true,
    });

    const tree = decode(wrapper) as unknown as {
      calibration: {
        __class: string;
        orientation: {
          __class: string;
          positionPatient: { __class: string; position_y: number };
          orientationPatient: { orientX_x: number; orientY_y: number };
          frameOfReferenceUID: string;
          isProjectionScout: boolean;
        };
      };
      imagePhaseInfo: { inStackPositionNumber: number; numberOfTemporalPositions: number; stackID: string };
      annotationOverlay: { bottomLeft: { __class: string; value: string[] } };
      annotationOverlayMPR: { __class: string };
      voiLut: { lut: unknown; elements: number };
    };

    expect(tree.calibration.__class).toBe('com.clientoutlook.data.ImageCalibration');
    const orientation = tree.calibration.orientation;
    expect(orientation.__class).toBe('com.clientoutlook.data.OrientationPatient');
    expect(orientation.positionPatient.__class).toBe('com.clientoutlook.data.ImagePositionPatient');
    expect(orientation.positionPatient.position_y).toBe(-37.5);
    // The whole orientation chain, not just the position — a slice sorter can
    // pick its axis only if the direction cosines are there too.
    expect(orientation.orientationPatient.orientX_x).toBe(AXIAL_ORIENTATION.rowX);
    expect(orientation.orientationPatient.orientY_y).toBe(AXIAL_ORIENTATION.columnY);
    expect(orientation.frameOfReferenceUID).toBe('1.2.840.113619.2.55.3.TEST');
    expect(orientation.isProjectionScout).toBe(false);
    // Negative integers must sign-extend, not surface as 536870911.
    expect(tree.imagePhaseInfo.inStackPositionNumber).toBe(-1);
    expect(tree.imagePhaseInfo.numberOfTemporalPositions).toBe(-1);
    expect(tree.imagePhaseInfo.stackID).toBe('-1');
    // Overlays decode as externalizable ArrayCollection wrappers.
    const overlay = tree.annotationOverlay.bottomLeft;
    expect(overlay.__class).toBe('flex.messaging.io.ArrayCollection');
    expect(overlay.value).toContain('SE #: %SERIES_NUMBER%');
    expect(tree.annotationOverlayMPR.__class).toBe('com.clientoutlook.data.Annotation');
    // And the VOI LUT survives as a byte array.
    expect(Buffer.isBuffer(tree.voiLut.lut)).toBe(true);
    expect(tree.voiLut.elements).toBe(4);

    // readPatientPosition still finds the position through all the extras.
    expect(readPatientPosition(wrapper)).toEqual({ x: -101.25, y: -37.5, z: 88.75 });
  });

  it('keeps an integral slice position a double on the wire', () => {
    // z=0 is a real slice position, and it must not change type just because
    // it happens to be a whole number.
    const wrapper = encodeCloWrapper({ positionPatient: { x: 0, y: -12, z: 0 } });
    expect(readPatientPosition(wrapper)).toEqual({ x: 0, y: -12, z: 0 });
    const raw = inflateSync(wrapper.subarray(16));
    expect(raw.includes(Buffer.from([0x05, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
  });

  it('round-trips a linear VOI LUT through parseWrapper', () => {
    const metadata = parseWrapper(encodeCloWrapper({
      photometricInterpretation: 'MONOCHROME2',
      bitsStored: 16,
      voiLut: linearVoiLutTable(256),
    }));
    expect(metadata.voi_lut?.length).toBe(256);
    expect(metadata.voi_lut?.[0]).toBe(0);
    expect(metadata.voi_lut?.[255]).toBe(65535);
    expect(metadata.voi_lut_bits).toBe(16);
  });
});
