/**
 * Anatomical ordering for multi-slice imaging series (CT and MRI stacks).
 *
 * eUnity hands back one image per (series, instance) pair, and
 * `downloadImagingStudyDirect` fetches them in parallel batches — so the raw
 * image list arrives in whatever order the image server answered, which is not
 * even download order, let alone scan order. Each image's CLO wrapper carries
 * the DICOM patient position (`calibration.orientation.positionPatient`), so a
 * stack can be re-ordered the way the scanner swept it: pick the axis the
 * series actually travels along and sort by it.
 *
 * This used to live in the CLI's hand-written `get-imaging` handler, which
 * made the CLI the only client whose CT stacks read head-to-foot. It runs in
 * the shared download path now so every client gets a readable stack.
 */

import { inflateSync } from 'zlib';
import { AMF3Reader } from './clo_to_bitmap';

const CLOHEADERZ01_MAGIC = Buffer.from('CLOHEADERZ01');

/**
 * Below this much variation (in mm) across a series, the positions are noise
 * or absent, and the original order is kept.
 */
const MIN_AXIS_RANGE_MM = 0.1;

export interface PatientPosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Read `calibration.orientation.positionPatient` out of a CLO wrapper.
 * Returns null for anything that is not a parsable wrapper with a position —
 * a missing position must never break an image download.
 */
export function readPatientPosition(wrapperData: Uint8Array): PatientPosition | null {
  try {
    const buf = Buffer.isBuffer(wrapperData) ? wrapperData : Buffer.from(wrapperData);
    if (buf.length < 16 || !buf.subarray(0, 12).equals(CLOHEADERZ01_MAGIC)) return null;
    const meta = new AMF3Reader(inflateSync(buf.subarray(16))).readValue() as
      | { calibration?: { orientation?: { positionPatient?: Record<string, unknown> } } }
      | undefined;
    const pos = meta?.calibration?.orientation?.positionPatient;
    if (!pos || typeof pos !== 'object') return null;
    return {
      x: Number(pos.position_x ?? 0),
      y: Number(pos.position_y ?? 0),
      z: Number(pos.position_z ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Re-order each multi-slice series by patient position along its dominant
 * axis. Series stay grouped in first-appearance order; single-image series,
 * images without a wrapper, and series whose positions don't vary are left
 * exactly where they were. The sort is stable, so unparsable slices keep
 * their relative order.
 */
export function sortImagesByPatientPosition<T extends { seriesUID: string; wrapperData?: Uint8Array }>(
  images: readonly T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const image of images) {
    let group = groups.get(image.seriesUID);
    if (!group) groups.set(image.seriesUID, (group = []));
    group.push(image);
  }

  const out: T[] = [];
  for (const group of groups.values()) {
    if (group.length > 1) {
      const positioned = group.map((image) => ({
        image,
        // Missing/unparsable positions sort as the origin, like the rest of
        // the CLO pipeline treats absent metadata.
        pos: (image.wrapperData && readPatientPosition(image.wrapperData)) || { x: 0, y: 0, z: 0 },
      }));
      const range = (axis: keyof PatientPosition) => {
        const values = positioned.map((p) => p.pos[axis]);
        return Math.max(...values) - Math.min(...values);
      };
      const rx = range('x');
      const ry = range('y');
      const rz = range('z');
      if (Math.max(rx, ry, rz) > MIN_AXIS_RANGE_MM) {
        const axis: keyof PatientPosition = rx >= ry && rx >= rz ? 'x' : ry >= rz ? 'y' : 'z';
        positioned.sort((a, b) => a.pos[axis] - b.pos[axis]);
        out.push(...positioned.map((p) => p.image));
        continue;
      }
    }
    out.push(...group);
  }
  return out;
}
