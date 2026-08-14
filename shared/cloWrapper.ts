/**
 * The repo's only CLOHEADERZ01 wrapper encoder.
 *
 * A CLO wrapper is a 16-byte `CLOHEADERZ01` header followed by a zlib-deflated
 * AMF3 `com.clientoutlook.data.ImageDescription` object carrying the DICOM
 * display metadata for one image — see `docs/clo-format.md` for the full field
 * inventory captured from real eUnity responses.
 *
 * Two callers need to produce one, and they must produce the *same* thing:
 *
 * - `scrapers/myChart/clo-image-parser/generate_clo.ts`, which writes the
 *   committed `.clo` fixtures under `fake-mychart/src/data/clo-images/`
 * - fake-mychart's image servlet, which synthesizes a per-instance wrapper for
 *   every slice of a cross-sectional series so each one carries its own
 *   `calibration.orientation.positionPatient` — the DICOM Image Position
 *   (Patient) in mm that clients sort slices by
 *
 * They were separate implementations until they drifted: one named the root
 * class `ImageDescription` instead of `com.clientoutlook.data.ImageDescription`
 * and omitted `orientationPatient` / `frameOfReferenceUID` / `isProjectionScout`
 * from the orientation chain. Neither showed up as a failure, because every
 * reader in the repo (`clo_to_bitmap.ts` parseWrapper, `sortByPatientPosition.ts`
 * readPatientPosition) looks up members by name and never checks the class.
 *
 * Beyond position, a wrapper can carry the constructs a flat scalar object
 * never reaches — each a distinct decode path, all observed on a live instance:
 *
 * - a VOI LUT whose table is an AMF3 **byte array** ({@link linearVoiLutTable})
 * - annotation overlays wrapped in **externalizable** ArrayCollection nodes
 * - `ImagePhaseInfo` whose "undefined" sentinels are the **negative** integer
 *   -1, which only a sign-extending reader gets right
 *   ({@link UNDEFINED_IMAGE_PHASE_INFO})
 */
import { deflateSync } from 'zlib';
import { type Amf3ObjectLiteral, type Amf3Value, Amf3Writer, amf3ArrayCollection, amf3Double } from './amf3Writer';

const CLOHEADERZ01_MAGIC = 'CLOHEADERZ01';

/** DICOM Image Position (Patient) — the top-left pixel's location in mm. */
export interface PatientPosition {
  x: number;
  y: number;
  z: number;
}

/** DICOM Image Orientation (Patient) — the row and column direction cosines. */
export interface PatientOrientation {
  rowX: number;
  rowY: number;
  rowZ: number;
  columnX: number;
  columnY: number;
  columnZ: number;
}

/** A plain axial slice: rows run along +x, columns along +y. */
export const AXIAL_ORIENTATION: PatientOrientation = {
  rowX: 1, rowY: 0, rowZ: 0,
  columnX: 0, columnY: 1, columnZ: 0,
};

export interface CloVoiLut {
  /** Raw LUT table, one 16-bit entry per element. */
  lut: Buffer;
  elements: number;
  start: number;
  bits: number;
  /** 1 = little-endian, 0 = big-endian. */
  lutIsLittleEndian: number;
}

export interface CloImagePhaseInfo {
  inStackPositionNumber: number;
  stackID: string;
  temporalPositionIdentifier: number;
  numberOfTemporalPositions: number;
}

/**
 * The all-undefined ImagePhaseInfo real wrappers send for a series with no
 * stack/phase grouping. The -1s are negative AMF3 integers (wire-encoded
 * 0x1FFFFFFF); a reader that doesn't sign-extend sees 536870911 and any
 * consumer comparing against -1 silently misses.
 */
export const UNDEFINED_IMAGE_PHASE_INFO: CloImagePhaseInfo = {
  inStackPositionNumber: -1,
  stackID: '-1',
  temporalPositionIdentifier: -1,
  numberOfTemporalPositions: -1,
};

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

/**
 * A linear ramp LUT, stored little-endian like a real VOI LUT table.
 * The table is what makes the byte-array decode path load-bearing; the ramp
 * itself is display-neutral.
 */
export function linearVoiLutTable(elements = 4096): CloVoiLut {
  const lut = Buffer.alloc(elements * 2);
  for (let i = 0; i < elements; i++) {
    lut.writeUInt16LE(Math.round((i / (elements - 1)) * 65535), i * 2);
  }
  return { lut, elements, start: 0, bits: 16, lutIsLittleEndian: 1 };
}

export interface CloWrapperMetadata {
  photometricInterpretation?: string;
  bitsStored?: number;
  windowCenter?: number;
  windowWidth?: number;
  /** 0 = unsigned, 1 = signed pixel values. */
  isSigned?: number;
  rescaleSlope?: number;
  rescaleIntercept?: number;
  /**
   * Emits the `calibration.orientation` chain. Cross-sectional slices (CT/MR)
   * carry a position; projection images (X-rays) don't.
   */
  positionPatient?: PatientPosition;
  /** Defaults to {@link AXIAL_ORIENTATION} when a position is present. */
  orientationPatient?: PatientOrientation;
  /** Ties the slices of one acquisition together; matches the series metadata. */
  frameOfReferenceUID?: string;
  /** Whether this is a scout/localizer image. */
  isProjectionScout?: boolean;
  voiLut?: CloVoiLut;
  imagePhaseInfo?: CloImagePhaseInfo;
  /** Adds the `annotationOverlay` and `annotationOverlayMPR` blocks. */
  includeAnnotationOverlays?: boolean;
}

function annotationOverlay(): Amf3ObjectLiteral {
  const overlay: Amf3ObjectLiteral = { _class: 'com.clientoutlook.data.Annotation' };
  for (const [position, texts] of Object.entries(OVERLAY_TEXTS)) {
    // Every overlay text array arrives inside an externalizable
    // ArrayCollection — a reader without one throws here.
    overlay[position] = amf3ArrayCollection(texts);
  }
  return overlay;
}

function calibration(metadata: CloWrapperMetadata, position: PatientPosition): Amf3ObjectLiteral {
  const orientation = metadata.orientationPatient ?? AXIAL_ORIENTATION;
  return {
    _class: 'com.clientoutlook.data.ImageCalibration',
    orientation: {
      _class: 'com.clientoutlook.data.OrientationPatient',
      // Spatial values go out as doubles even when integral — millimetre
      // coordinates and direction cosines are DICOM decimals on a real wire.
      positionPatient: {
        _class: 'com.clientoutlook.data.ImagePositionPatient',
        position_x: amf3Double(position.x),
        position_y: amf3Double(position.y),
        position_z: amf3Double(position.z),
      },
      orientationPatient: {
        _class: 'com.clientoutlook.data.ImageOrientationPatient',
        orientX_x: amf3Double(orientation.rowX),
        orientX_y: amf3Double(orientation.rowY),
        orientX_z: amf3Double(orientation.rowZ),
        orientY_x: amf3Double(orientation.columnX),
        orientY_y: amf3Double(orientation.columnY),
        orientY_z: amf3Double(orientation.columnZ),
      },
      frameOfReferenceUID: metadata.frameOfReferenceUID ?? '',
      isProjectionScout: metadata.isProjectionScout ?? false,
    },
  };
}

/**
 * Encode one CLOHEADERZ01 wrapper. Members are emitted only when supplied, in
 * the order a real wrapper lists them.
 */
export function encodeCloWrapper(metadata: CloWrapperMetadata): Buffer {
  const description: Amf3ObjectLiteral = { _class: 'com.clientoutlook.data.ImageDescription' };
  const put = (member: string, value: Amf3Value | undefined) => {
    if (value !== undefined) description[member] = value;
  };

  put('photometricInterpretation', metadata.photometricInterpretation);
  put('bitsStored', metadata.bitsStored);
  put('windowCenter', metadata.windowCenter);
  put('windowWidth', metadata.windowWidth);
  put('isSigned', metadata.isSigned);
  put('rescaleSlope', metadata.rescaleSlope);
  put('rescaleIntercept', metadata.rescaleIntercept);
  if (metadata.positionPatient) {
    description.calibration = calibration(metadata, metadata.positionPatient);
  }
  if (metadata.voiLut) {
    description.voiLut = { _class: 'com.clientoutlook.data.VoiLut', ...metadata.voiLut };
  }
  if (metadata.imagePhaseInfo) {
    description.imagePhaseInfo = { _class: 'com.clientoutlook.data.ImagePhaseInfo', ...metadata.imagePhaseInfo };
  }
  if (metadata.includeAnnotationOverlays) {
    description.annotationOverlay = annotationOverlay();
    description.annotationOverlayMPR = annotationOverlay();
  }

  const writer = new Amf3Writer();
  writer.writeValue(description);

  const header = Buffer.alloc(16); // 12-byte magic, bytes 12–15 reserved
  header.write(CLOHEADERZ01_MAGIC, 0, 'ascii');
  return Buffer.concat([header, deflateSync(writer.toBuffer())]);
}
