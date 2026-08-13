/**
 * Anatomical ordering of multi-slice series.
 *
 * Fixtures come from the repo's own wrapper encoder, so the position is read
 * back through the same CLOHEADERZ01 + AMF3 path production uses.
 */

import { describe, expect, it } from 'bun:test';
import { readPatientPosition, sortImagesByPatientPosition } from './sortByPatientPosition';
import { encodeCloWrapper } from '../../../shared/cloWrapper';

function wrapperAt(x: number, y: number, z: number): Uint8Array {
  return new Uint8Array(
    encodeCloWrapper({
      photometricInterpretation: 'MONOCHROME2',
      bitsStored: 16,
      positionPatient: { x, y, z },
    }),
  );
}

function slice(seriesUID: string, label: string, position?: { x: number; y: number; z: number }) {
  return {
    seriesUID,
    label,
    wrapperData: position ? wrapperAt(position.x, position.y, position.z) : undefined,
  };
}

describe('readPatientPosition', () => {
  it('round-trips the position the encoder wrote', () => {
    expect(readPatientPosition(wrapperAt(-12.5, 3, 240.25))).toEqual({ x: -12.5, y: 3, z: 240.25 });
  });

  it('returns null for wrappers without a position, garbage, and truncated data', () => {
    const noPosition = new Uint8Array(encodeCloWrapper({ photometricInterpretation: 'MONOCHROME2' }));
    expect(readPatientPosition(noPosition)).toBeNull();
    expect(readPatientPosition(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readPatientPosition(new Uint8Array(Buffer.from('CLOHEADERZ01____not-zlib')))).toBeNull();
  });
});

describe('sortImagesByPatientPosition', () => {
  it('orders a CT stack by the axis the series travels along', () => {
    const shuffled = [
      slice('ct', 'slice-2', { x: 0.1, y: 0.2, z: 120 }),
      slice('ct', 'slice-0', { x: 0.3, y: 0.1, z: 40 }),
      slice('ct', 'slice-3', { x: 0.2, y: 0.4, z: 160 }),
      slice('ct', 'slice-1', { x: 0.0, y: 0.3, z: 80 }),
    ];
    // z varies by 120mm while x/y jitter under 1mm — z is the scan axis.
    expect(sortImagesByPatientPosition(shuffled).map((s) => s.label)).toEqual([
      'slice-0',
      'slice-1',
      'slice-2',
      'slice-3',
    ]);
  });

  it('keeps series grouped in first-appearance order while sorting inside each', () => {
    const images = [
      slice('a', 'a-far', { x: 0, y: 0, z: 50 }),
      slice('b', 'b-only'),
      slice('a', 'a-near', { x: 0, y: 0, z: 10 }),
    ];
    expect(sortImagesByPatientPosition(images).map((s) => s.label)).toEqual(['a-near', 'a-far', 'b-only']);
  });

  it('leaves order alone when positions are missing or do not vary', () => {
    const noWrappers = [slice('s', 'first'), slice('s', 'second'), slice('s', 'third')];
    expect(sortImagesByPatientPosition(noWrappers).map((s) => s.label)).toEqual(['first', 'second', 'third']);

    const samePlace = [
      slice('s', 'first', { x: 1, y: 2, z: 3 }),
      slice('s', 'second', { x: 1, y: 2, z: 3.05 }), // under the 0.1mm noise floor
    ];
    expect(sortImagesByPatientPosition(samePlace).map((s) => s.label)).toEqual(['first', 'second']);
  });

  it('sorts unparsable slices as the origin without disturbing their relative order', () => {
    const images = [
      slice('s', 'above', { x: 0, y: 0, z: 30 }),
      slice('s', 'broken-1'),
      slice('s', 'below', { x: 0, y: 0, z: -30 }),
      slice('s', 'broken-2'),
    ];
    expect(sortImagesByPatientPosition(images).map((s) => s.label)).toEqual([
      'below',
      'broken-1',
      'broken-2',
      'above',
    ]);
  });
});
