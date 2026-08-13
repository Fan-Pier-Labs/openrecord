/**
 * CLOHEADERZ01 wrapper synthesis for the fake eUnity image servlet.
 *
 * Real eUnity servers answer CLOWRAPPER with a per-*instance* wrapper: a
 * 16-byte "CLOHEADERZ01" header followed by a zlib-deflated AMF3
 * ImageDescription object. For cross-sectional series (CT/MRI) each slice's
 * wrapper carries its own `calibration.orientation.positionPatient` — the
 * DICOM Image Position (Patient) in mm that clients use to sort slices into
 * anatomical order. fake-mychart synthesizes these per slice (it cannot
 * import the scrapers' encoder — the Docker build context is this directory
 * only), keeping the display metadata identical to the pre-generated wrapper
 * files in src/data/clo-images/ so pixel decoding is unaffected.
 *
 * Beyond the position, a series can opt into the constructs a real
 * cross-sectional wrapper carries that a flat scalar object never reaches —
 * each one a distinct decode path, all of them observed on a live instance:
 *
 * - a VOI LUT whose table is an AMF3 **byte array**
 * - annotation overlays wrapped in **externalizable** ArrayCollection nodes
 * - `ImagePhaseInfo` whose "undefined" sentinels are the **negative** integer
 *   -1, which only a sign-extending reader gets right
 */
import { deflateSync } from 'zlib';
import { Amf3Writer } from './amf3';

const CLOHEADERZ01_MAGIC = 'CLOHEADERZ01';

export interface CloWrapperOptions {
  /** DICOM Image Position (Patient) of this slice, in mm. */
  positionPatient: { x: number; y: number; z: number };
  /** Ties the slices of one acquisition together; same value study-metadata-side. */
  frameOfReferenceUID: string;
  /**
   * Emit the byte-array VOI LUT, the -1 ImagePhaseInfo sentinels and the
   * annotation overlay block — all three present on real CT/MR wrappers.
   */
  includeRichMetadata?: boolean;
}

/** Overlay template strings, as real wrappers carry them — placeholders, no PHI. */
const OVERLAY_TEXTS: Record<string, string[]> = {
  topLeft: ['%PATIENT_NAME%', '%PATIENT_ID%'],
  topRight: ['%STUDY_DESCRIPTION%', '%STUDY_DATE%'],
  bottomLeft: ['SE #: %SERIES_NUMBER%', 'W\\L : %WINDOW_LEVEL%'],
  bottomRight: ['%INSTITUTION_NAME%', 'Zoom: %ZOOM_FACTOR%'],
  topLeftAlwaysVisible: [],
  topRightAlwaysVisible: [],
  bottomLeftAlwaysVisible: ['%LOSSY_COMPRESSION%'],
  bottomRightAlwaysVisible: [],
};

/** A 4096-entry linear ramp, stored little-endian like a real VOI LUT table. */
function voiLutTable(): Buffer {
  const elements = 4096;
  const lut = Buffer.alloc(elements * 2);
  for (let i = 0; i < elements; i++) {
    lut.writeUInt16LE(Math.round((i / (elements - 1)) * 65535), i * 2);
  }
  return lut;
}

function writeAnnotationOverlay(w: Amf3Writer) {
  const positions = Object.keys(OVERLAY_TEXTS);
  w.writeTypedObject(
    'com.clientoutlook.data.Annotation',
    positions,
    positions.map((position) => (w1: Amf3Writer) =>
      // Every overlay text array arrives inside an externalizable
      // ArrayCollection — a reader without one throws here.
      w1.writeArrayCollection(
        OVERLAY_TEXTS[position]!.map((text) => (w2: Amf3Writer) => w2.writeString(text)),
      ),
    ),
  );
}

/**
 * Build a per-slice CLOWRAPPER payload. Display metadata matches the
 * committed synthetic test images (MONOCHROME2, 16-bit, full-range window);
 * orientation is a plain axial slice (row → +x, column → +y).
 */
export function buildCloWrapper(options: CloWrapperOptions): Buffer {
  const w = new Amf3Writer();
  const { positionPatient, frameOfReferenceUID } = options;

  const members = ['photometricInterpretation', 'bitsStored', 'windowCenter', 'windowWidth', 'calibration'];
  const values: ((w: Amf3Writer) => void)[] = [
      (w1) => w1.writeString('MONOCHROME2'),
      (w1) => w1.writeInteger(16),
      (w1) => w1.writeInteger(32768),
      (w1) => w1.writeInteger(65536),
      (w1) =>
        w1.writeTypedObject('com.clientoutlook.data.ImageCalibration', ['orientation'], [
          (w2) =>
            w2.writeTypedObject(
              'com.clientoutlook.data.OrientationPatient',
              ['positionPatient', 'orientationPatient', 'frameOfReferenceUID', 'isProjectionScout'],
              [
                (w3) =>
                  w3.writeTypedObject(
                    'com.clientoutlook.data.ImagePositionPatient',
                    ['position_x', 'position_y', 'position_z'],
                    [
                      (w4) => w4.writeDouble(positionPatient.x),
                      (w4) => w4.writeDouble(positionPatient.y),
                      (w4) => w4.writeDouble(positionPatient.z),
                    ],
                  ),
                (w3) =>
                  w3.writeTypedObject(
                    'com.clientoutlook.data.ImageOrientationPatient',
                    ['orientX_x', 'orientX_y', 'orientX_z', 'orientY_x', 'orientY_y', 'orientY_z'],
                    [
                      (w4) => w4.writeDouble(1),
                      (w4) => w4.writeDouble(0),
                      (w4) => w4.writeDouble(0),
                      (w4) => w4.writeDouble(0),
                      (w4) => w4.writeDouble(1),
                      (w4) => w4.writeDouble(0),
                    ],
                  ),
                (w3) => w3.writeString(frameOfReferenceUID),
                (w3) => w3.writeFalse(),
              ],
            ),
        ]),
  ];

  if (options.includeRichMetadata) {
    // voiLut: the table itself is a byte array, not a dense array of numbers.
    members.push('voiLut');
    values.push((w1) =>
      w1.writeTypedObject(
        'com.clientoutlook.data.VoiLut',
        ['lut', 'elements', 'start', 'bits', 'lutIsLittleEndian'],
        [
          (w2) => w2.writeByteArray(voiLutTable()),
          (w2) => w2.writeInteger(4096),
          (w2) => w2.writeInteger(0),
          (w2) => w2.writeInteger(16),
          (w2) => w2.writeInteger(1),
        ],
      ),
    );

    // imagePhaseInfo: -1 sentinels. A reader that doesn't sign-extend reads
    // these as 536870911, and a consumer comparing against -1 silently misses.
    members.push('imagePhaseInfo');
    values.push((w1) =>
      w1.writeTypedObject(
        'com.clientoutlook.data.ImagePhaseInfo',
        ['inStackPositionNumber', 'stackID', 'temporalPositionIdentifier', 'numberOfTemporalPositions'],
        [
          (w2) => w2.writeInteger(-1),
          (w2) => w2.writeString('-1'),
          (w2) => w2.writeInteger(-1),
          (w2) => w2.writeInteger(-1),
        ],
      ),
    );

    members.push('annotationOverlay');
    values.push(writeAnnotationOverlay);
  }

  w.writeTypedObject('com.clientoutlook.data.ImageDescription', members, values);

  const header = Buffer.alloc(16);
  header.write(CLOHEADERZ01_MAGIC, 0, 'ascii');
  return Buffer.concat([header, deflateSync(w.toBuffer())]);
}
