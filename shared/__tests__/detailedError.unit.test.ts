// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';
import { DetailedError, detailedMessage } from '../detailedError';
import { describeError } from '../telemetry';

describe('detailedMessage', () => {
  it('is the detailed message of a DetailedError, and the message of any other error', () => {
    expect(detailedMessage(new DetailedError('No patient record matches that name.', "Available: 'Bart Simpson'"))).toBe(
      "Available: 'Bart Simpson'",
    );
    expect(detailedMessage(new Error('boom'))).toBe('boom');
    expect(detailedMessage('plain string')).toBe('plain string');
  });

  it('keeps the detail out of everything error reporting reads', () => {
    const report = describeError(new DetailedError('No patient record matches that name.', "Available: 'Bart Simpson'"));
    expect(report.name).toBe('Error');
    expect(JSON.stringify(report)).not.toContain('Bart');
  });
});
