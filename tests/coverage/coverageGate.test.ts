/**
 * Tests for the coverage gate itself (`scripts/check-coverage.ts`).
 *
 * A gate that silently passes is worse than no gate, so the cases that matter
 * most here are the ones where it must FAIL: an empty report, a truncated
 * report, and coverage sitting just under the bar.
 */
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import {
  MINIMUM_COVERAGE,
  checkCoverage,
  effectiveThresholds,
  parseBaseline,
  parseLcov,
  summarize,
  worstOffenders,
} from '../../scripts/check-coverage';

function record(
  file: string,
  { lf = 0, lh = 0, fnf = 0, fnh = 0 }: { lf?: number; lh?: number; fnf?: number; fnh?: number },
): string {
  return ['TN:', `SF:${file}`, `FNF:${fnf}`, `FNH:${fnh}`, `LF:${lf}`, `LH:${lh}`, 'end_of_record'].join(
    '\n',
  );
}

describe('parseLcov', () => {
  test('reads one record per source file', () => {
    const lcov = [
      record('a.ts', { lf: 10, lh: 8, fnf: 2, fnh: 2 }),
      record('b.ts', { lf: 20, lh: 5, fnf: 4, fnh: 1 }),
    ].join('\n');

    expect(parseLcov(lcov)).toEqual([
      { file: 'a.ts', linesFound: 10, linesHit: 8, functionsFound: 2, functionsHit: 2 },
      { file: 'b.ts', linesFound: 20, linesHit: 5, functionsFound: 4, functionsHit: 1 },
    ]);
  });

  test('ignores the per-line DA: entries Bun interleaves', () => {
    const lcov = ['TN:', 'SF:a.ts', 'FNF:1', 'FNH:1', 'DA:3,69', 'DA:18,0', 'LF:2', 'LH:1', 'end_of_record'].join(
      '\n',
    );
    expect(parseLcov(lcov)).toHaveLength(1);
    expect(parseLcov(lcov)[0]).toMatchObject({ linesFound: 2, linesHit: 1 });
  });

  test('keeps a record truncated before end_of_record', () => {
    const lcov = 'TN:\nSF:a.ts\nFNF:1\nFNH:0\nLF:10\nLH:2';
    expect(parseLcov(lcov)).toEqual([
      { file: 'a.ts', linesFound: 10, linesHit: 2, functionsFound: 1, functionsHit: 0 },
    ]);
  });

  test('returns nothing for an empty report', () => {
    expect(parseLcov('')).toEqual([]);
  });
});

describe('summarize', () => {
  test('aggregates across files rather than averaging per-file rates', () => {
    // Averaging the two rates would give 50%; the true aggregate is 90/100.
    const summary = summarize(
      parseLcov(
        [record('big.ts', { lf: 99, lh: 90, fnf: 10, fnh: 9 }), record('tiny.ts', { lf: 1, lh: 0, fnf: 1, fnh: 0 })].join(
          '\n',
        ),
      ),
    );

    expect(summary.linesFound).toBe(100);
    expect(summary.linesHit).toBe(90);
    expect(summary.lineRate).toBeCloseTo(0.9, 5);
    expect(summary.functionRate).toBeCloseTo(9 / 11, 5);
  });

  test('treats a report with nothing to measure as 0%, not 100%', () => {
    const summary = summarize([]);
    expect(summary.lineRate).toBe(0);
    expect(summary.functionRate).toBe(0);
  });
});

describe('checkCoverage', () => {
  test('passes when both rates clear the minimum', () => {
    const result = checkCoverage(record('a.ts', { lf: 100, lh: 80, fnf: 10, fnh: 8 }));
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test('passes when a rate lands exactly on the minimum', () => {
    const result = checkCoverage(record('a.ts', { lf: 100, lh: 75, fnf: 4, fnh: 3 }), 0.75);
    expect(result.passed).toBe(true);
  });

  test('fails on low line coverage and says so', () => {
    const result = checkCoverage(record('a.ts', { lf: 100, lh: 74, fnf: 10, fnh: 10 }), 0.75);
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain('Line coverage 74.00%');
    expect(result.failures[0]).toContain('74/100');
  });

  test('fails on low function coverage even when lines are fine', () => {
    const result = checkCoverage(record('a.ts', { lf: 100, lh: 100, fnf: 10, fnh: 1 }), 0.75);
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain('Function coverage 10.00%');
  });

  test('reports both dimensions when both are short', () => {
    const result = checkCoverage(record('a.ts', { lf: 100, lh: 10, fnf: 10, fnh: 1 }), 0.75);
    expect(result.failures).toHaveLength(2);
  });

  test('fails closed on an empty report instead of vacuously passing', () => {
    const result = checkCoverage('', 0.75);
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain('No coverage data');
  });

  test('a single uncovered file cannot fail an otherwise healthy repo', () => {
    // The behaviour Bun's own per-file coverageThreshold gets wrong, and the
    // reason this script exists.
    const lcov = [
      record('well-tested.ts', { lf: 900, lh: 800, fnf: 90, fnh: 80 }),
      record('untested.ts', { lf: 100, lh: 0, fnf: 10, fnh: 0 }),
    ].join('\n');

    const result = checkCoverage(lcov, 0.75);
    expect(result.summary.lineRate).toBeCloseTo(0.8, 5);
    expect(result.passed).toBe(true);
  });

  test('defaults to the exported minimum', () => {
    const justUnder = Math.floor(MINIMUM_COVERAGE * 100) - 1;
    expect(checkCoverage(record('a.ts', { lf: 100, lh: justUnder, fnf: 1, fnh: 1 })).passed).toBe(
      false,
    );
  });
});

describe('worstOffenders', () => {
  test('ranks by uncovered line count, not by percentage', () => {
    const lcov = [
      record('small-but-empty.ts', { lf: 10, lh: 0 }),
      record('large-gap.ts', { lf: 500, lh: 300 }),
      record('perfect.ts', { lf: 100, lh: 100 }),
    ].join('\n');

    const offenders = worstOffenders(summarize(parseLcov(lcov)));
    expect(offenders.map((f) => f.file)).toEqual(['large-gap.ts', 'small-but-empty.ts']);
  });

  test('honours the limit', () => {
    const lcov = Array.from({ length: 20 }, (_, i) => record(`f${i}.ts`, { lf: 10, lh: 0 })).join('\n');
    expect(worstOffenders(summarize(parseLcov(lcov)), 3)).toHaveLength(3);
  });
});

describe('the agreed minimum', () => {
  test('is at least 75%', () => {
    expect(MINIMUM_COVERAGE).toBeGreaterThanOrEqual(0.75);
  });
});

describe('effectiveThresholds', () => {
  test('falls back to the floor when no baseline is recorded', () => {
    expect(effectiveThresholds(null)).toEqual({
      lines: MINIMUM_COVERAGE,
      functions: MINIMUM_COVERAGE,
    })
  })

  test('ratchets the bar up to just under the baseline', () => {
    const bar = effectiveThresholds({ lines: 0.9, functions: 0.88 }, 0.75, 0.005)
    expect(bar.lines).toBeCloseTo(0.895, 5)
    expect(bar.functions).toBeCloseTo(0.875, 5)
  })

  test('never drops below the floor, even with a low baseline', () => {
    // A baseline written while coverage was poor must not lower the gate.
    expect(effectiveThresholds({ lines: 0.4, functions: 0.4 }, 0.75, 0.005)).toEqual({
      lines: 0.75,
      functions: 0.75,
    })
  })

  test('gives each dimension its own bar', () => {
    const bar = effectiveThresholds({ lines: 0.95, functions: 0.6 }, 0.75, 0.005)
    expect(bar.lines).toBeCloseTo(0.945, 5)
    expect(bar.functions).toBe(0.75)
  })
})

describe('ratchet behaviour', () => {
  const at = (linePct: number) => record('a.ts', { lf: 10000, lh: linePct * 100, fnf: 100, fnh: 100 })

  test('a drop below the baseline fails even though it clears the floor', () => {
    // The whole point: 86% must not be allowed to rot back to 76%.
    const bar = effectiveThresholds({ lines: 0.86, functions: 0.86 })
    const result = checkCoverage(at(76), bar)

    expect(result.passed).toBe(false)
    expect(result.failures[0]).toContain('Line coverage 76.00%')
  })

  test('a dip inside the tolerance is allowed', () => {
    // Deleting a well-covered file shouldn't fail a build that did nothing wrong.
    const bar = effectiveThresholds({ lines: 0.86, functions: 0.86 }, 0.75, 0.005)
    expect(checkCoverage(at(85.7), bar).passed).toBe(true)
  })

  test('a dip past the tolerance is not', () => {
    const bar = effectiveThresholds({ lines: 0.86, functions: 0.86 }, 0.75, 0.005)
    expect(checkCoverage(at(85.0), bar).passed).toBe(false)
  })

  test('rising above the baseline still passes', () => {
    const bar = effectiveThresholds({ lines: 0.86, functions: 0.86 })
    expect(checkCoverage(at(92), bar).passed).toBe(true)
  })
})

describe('parseBaseline', () => {
  test('reads a well-formed baseline', () => {
    expect(parseBaseline('{"lines":0.86,"functions":0.87}')).toEqual({
      lines: 0.86,
      functions: 0.87,
    })
  })

  test('treats malformed JSON as no baseline rather than throwing', () => {
    expect(parseBaseline('{{{')).toBeNull()
  })

  test('rejects a baseline missing a dimension', () => {
    expect(parseBaseline('{"lines":0.86}')).toBeNull()
  })

  test('rejects non-numeric values', () => {
    expect(parseBaseline('{"lines":"0.86","functions":0.87}')).toBeNull()
  })

  test('a missing baseline leaves the floor in charge, not a NaN bar', () => {
    const bar = effectiveThresholds(parseBaseline('garbage'))
    expect(bar.lines).toBe(MINIMUM_COVERAGE)
    expect(Number.isNaN(bar.functions)).toBe(false)
  })
})

describe('the committed baseline', () => {
  test('is at or above the floor', async () => {
    const file = Bun.file(path.resolve(import.meta.dir, '../../coverage-baseline.json'))
    expect(await file.exists()).toBe(true)

    const baseline = parseBaseline(await file.text())
    expect(baseline).not.toBeNull()
    expect(baseline!.lines).toBeGreaterThanOrEqual(MINIMUM_COVERAGE)
    expect(baseline!.functions).toBeGreaterThanOrEqual(MINIMUM_COVERAGE)
  })
})
