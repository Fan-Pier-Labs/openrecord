/**
 * Per-instance CLOHEADERZ01 wrappers for the fake eUnity image servlet.
 *
 * Real eUnity servers answer CLOWRAPPER with a per-*instance* wrapper: for
 * cross-sectional series (CT/MRI) each slice's wrapper carries its own
 * `calibration.orientation.positionPatient` — the DICOM Image Position
 * (Patient) in mm that clients use to sort slices into anatomical order.
 *
 * The encoding itself lives in `shared/cloWrapper.ts`, which is also what
 * generates the committed wrapper fixtures in `src/data/clo-images/`, so a
 * synthesized wrapper and a pre-generated one can't drift apart. What stays
 * here is the *server policy*: which display metadata a Homer series
 * advertises, and which of the richer constructs a series opts into.
 */
import {
  UNDEFINED_IMAGE_PHASE_INFO,
  type PatientPosition,
  encodeCloWrapper,
  linearVoiLutTable,
} from '@shared/cloWrapper';

export interface CloWrapperOptions {
  /** DICOM Image Position (Patient) of this slice, in mm. */
  positionPatient: PatientPosition;
  /** Ties the slices of one acquisition together; same value study-metadata-side. */
  frameOfReferenceUID: string;
  /**
   * Emit the byte-array VOI LUT, the -1 ImagePhaseInfo sentinels and the
   * annotation overlay blocks — all three present on real CT/MR wrappers, and
   * each one a decode path a flat scalar wrapper never reaches.
   */
  includeRichMetadata?: boolean;
}

/**
 * Build a per-slice CLOWRAPPER payload. Display metadata matches the committed
 * synthetic test images (MONOCHROME2, 16-bit, full-range window); orientation
 * defaults to a plain axial slice.
 */
export function buildCloWrapper(options: CloWrapperOptions): Buffer {
  const rich = options.includeRichMetadata === true;
  return encodeCloWrapper({
    photometricInterpretation: 'MONOCHROME2',
    bitsStored: 16,
    windowCenter: 32768,
    windowWidth: 65536,
    positionPatient: options.positionPatient,
    frameOfReferenceUID: options.frameOfReferenceUID,
    voiLut: rich ? linearVoiLutTable() : undefined,
    imagePhaseInfo: rich ? UNDEFINED_IMAGE_PHASE_INFO : undefined,
    includeAnnotationOverlays: rich,
  });
}
