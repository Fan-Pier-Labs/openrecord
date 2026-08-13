/**
 * Anatomical ordering for multi-slice series (CT/MRI).
 *
 * eUnity returns one CLOWRAPPER per instance, and cross-sectional wrappers
 * carry `calibration.orientation.positionPatient` — the DICOM Image Position
 * (Patient) of the slice in millimetres. Download order is not anatomical
 * order (instances download in parallel, and instance numbers can run
 * opposite to the scan axis), so slices are sorted by the position axis with
 * the most variation across the series.
 */
import { inflateSync } from "zlib";
import { AMF3Reader } from "./clo_to_bitmap";

const CLOHEADERZ01_MAGIC = "CLOHEADERZ01";

export interface PatientPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Read `calibration.orientation.positionPatient` out of a CLOHEADERZ01
 * wrapper. Returns null for anything that isn't a parseable wrapper or
 * doesn't carry a position (e.g. X-rays and other projection images).
 */
export function readPatientPosition(wrapperData: Buffer | Uint8Array): PatientPosition | null {
  try {
    const buf = Buffer.isBuffer(wrapperData) ? wrapperData : Buffer.from(wrapperData);
    if (buf.subarray(0, 12).toString() !== CLOHEADERZ01_MAGIC) return null;
    const reader = new AMF3Reader(inflateSync(buf.subarray(16)));
    const meta = reader.readValue();
    const pos = meta?.calibration?.orientation?.positionPatient;
    if (!pos || typeof pos !== "object") return null;
    return { x: pos.position_x ?? 0, y: pos.position_y ?? 0, z: pos.position_z ?? 0 };
  } catch {
    return null;
  }
}

export interface SortByPatientPositionResult<T> {
  /** The slices in anatomical order (ascending along `sortedBy`). */
  images: T[];
  /**
   * The axis the slices were sorted on, or null when the series carried no
   * usable positions (all missing, or under 0.1mm of spread on every axis) —
   * in that case `images` is the input order, untouched.
   */
  sortedBy: "x" | "y" | "z" | null;
  /** Millimetre spread along the axis with the most variation. */
  rangeMm: number;
}

/**
 * Sort a multi-slice series by patient position. Never throws: slices whose
 * wrapper is missing or unparseable sort as position (0, 0, 0), and a series
 * with no positional spread comes back in its original order (`sortedBy:
 * null`). The sort is stable, so ties keep download order.
 */
export function sortByPatientPosition<T extends { wrapperData?: Buffer | Uint8Array }>(
  images: T[],
): SortByPatientPositionResult<T> {
  const positions = images.map((img) =>
    (img.wrapperData && readPatientPosition(img.wrapperData)) || { x: 0, y: 0, z: 0 },
  );

  const range = (axis: keyof PatientPosition) => {
    const values = positions.map((p) => p[axis]);
    return values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
  };
  const rx = range("x");
  const ry = range("y");
  const rz = range("z");

  if (rx <= 0.1 && ry <= 0.1 && rz <= 0.1) {
    return { images: [...images], sortedBy: null, rangeMm: 0 };
  }

  const sortedBy = rx >= ry && rx >= rz ? "x" : ry >= rz ? "y" : "z";
  const sorted = images
    .map((img, idx) => ({ img, key: positions[idx]![sortedBy] })) // positions is images.map'd, same length
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.img);

  return { images: sorted, sortedBy, rangeMm: Math.max(rx, ry, rz) };
}
