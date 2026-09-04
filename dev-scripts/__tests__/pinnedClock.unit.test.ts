import { describe, expect, test } from 'bun:test';

import { DEFAULT_SOURCE_DATE_EPOCH, pinClock, sourceDateEpoch } from '../pinned-clock';

describe('sourceDateEpoch', () => {
  test('falls back to the constant when the env var is absent or empty', () => {
    expect(sourceDateEpoch({})).toBe(DEFAULT_SOURCE_DATE_EPOCH);
    expect(sourceDateEpoch({ SOURCE_DATE_EPOCH: '' })).toBe(DEFAULT_SOURCE_DATE_EPOCH);
  });

  test('reads the env var when it is set', () => {
    expect(sourceDateEpoch({ SOURCE_DATE_EPOCH: '1700000000' })).toBe(1_700_000_000);
  });

  test('refuses a value that is not a number of seconds', () => {
    expect(() => sourceDateEpoch({ SOURCE_DATE_EPOCH: 'yesterday' })).toThrow(/not a number of seconds/);
  });

  test('the default is the documented instant', () => {
    expect(new Date(DEFAULT_SOURCE_DATE_EPOCH * 1000).toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('pinClock', () => {
  test('freezes the clock the scrapers read, and puts it back', () => {
    const realNow = Date.now();
    const restore = pinClock(1_700_000_000);
    try {
      expect(Date.now()).toBe(1_700_000_000_000);
      expect(new Date().toISOString()).toBe('2023-11-14T22:13:20.000Z');
      // Two reads a moment apart still agree — that is the point.
      expect(new Date().getTime()).toBe(new Date().getTime());
    } finally {
      restore();
    }
    expect(Date.now()).toBeGreaterThanOrEqual(realNow);
  });

  test('pins the zone too, so the local-time getters the scrapers format with are fixed', () => {
    const restore = pinClock(DEFAULT_SOURCE_DATE_EPOCH);
    try {
      const now = new Date();
      expect([now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours()]).toEqual([2026, 2, 1, 0]);
      expect(now.getTimezoneOffset()).toBe(0);
    } finally {
      restore();
    }
  });

  test('an explicit zone overrides UTC', () => {
    const restore = pinClock(DEFAULT_SOURCE_DATE_EPOCH, 'Asia/Tokyo');
    try {
      // Nine hours ahead: the same instant is already the 1st at 09:00 there.
      expect(new Date().getHours()).toBe(9);
    } finally {
      restore();
    }
  });

  test('leaves every other use of Date alone', () => {
    const restore = pinClock(1_700_000_000);
    try {
      expect(new Date('2020-03-04T05:06:07Z').toISOString()).toBe('2020-03-04T05:06:07.000Z');
      expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
      expect(new Date(Date.UTC(2020, 2, 4, 5, 6, 7)).toISOString()).toBe('2020-03-04T05:06:07.000Z');
      expect(Date.parse('2020-03-04T05:06:07Z')).toBe(1_583_298_367_000);
      // The multi-argument constructor is local time, so compare its parts.
      const local = new Date(2020, 2, 4, 5, 6, 7);
      expect([local.getFullYear(), local.getMonth(), local.getDate(), local.getHours()]).toEqual([2020, 2, 4, 5]);
      expect(new Date() instanceof Date).toBe(true);
    } finally {
      restore();
    }
  });
});
