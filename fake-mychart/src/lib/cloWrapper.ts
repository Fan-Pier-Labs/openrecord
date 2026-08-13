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
 */
import { deflateSync } from 'zlib';
import { Amf3Writer } from './amf3';

const CLOHEADERZ01_MAGIC = 'CLOHEADERZ01';

export interface CloWrapperOptions {
  /** DICOM Image Position (Patient) of this slice, in mm. */
  positionPatient: { x: number; y: number; z: number };
  /** Ties the slices of one acquisition together; same value study-metadata-side. */
  frameOfReferenceUID: string;
}

/**
 * Build a per-slice CLOWRAPPER payload. Display metadata matches the
 * committed synthetic test images (MONOCHROME2, 16-bit, full-range window);
 * orientation is a plain axial slice (row → +x, column → +y).
 */
export function buildCloWrapper(options: CloWrapperOptions): Buffer {
  const w = new Amf3Writer();
  const { positionPatient, frameOfReferenceUID } = options;

  w.writeTypedObject(
    'com.clientoutlook.data.ImageDescription',
    ['photometricInterpretation', 'bitsStored', 'windowCenter', 'windowWidth', 'calibration'],
    [
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
    ],
  );

  const header = Buffer.alloc(16);
  header.write(CLOHEADERZ01_MAGIC, 0, 'ascii');
  return Buffer.concat([header, deflateSync(w.toBuffer())]);
}
