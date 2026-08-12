/**
 * Fails the build when overall test coverage drops below MINIMUM_COVERAGE.
 *
 * Why not Bun's built-in `coverageThreshold`? It is enforced **per file** — a
 * single 0%-covered file fails the run even when the codebase as a whole is at
 * 77%. That cannot express "at least 75% overall", so the aggregate is computed
 * here from the lcov report instead.
 *
 * Two further Bun quirks this works around, both verified against the CLI:
 *   - `coverageThreshold` keys must be plural (`lines`, not `line`); an
 *     unrecognised key is ignored silently, disarming the gate.
 *   - `bun test -c <file>` ignores the config path, so settings must live in the
 *     repo-root `bunfig.toml`.
 *
 * Run via `bun run test:coverage`, which produces the lcov report first.
 */

/** Hard floor. The gate never drops below this, whatever the baseline says. */
export const MINIMUM_COVERAGE = 0.75;

/**
 * Slack below the recorded baseline before the gate trips.
 *
 * A bare floor can only ever be met, never improved — coverage can rot from 86%
 * back to 75% with every build green. The baseline in `coverage-baseline.json`
 * ratchets the real bar up as coverage improves; this tolerance keeps ordinary
 * churn (deleting a well-covered file, refactoring a branch away) from failing
 * a build that did nothing wrong.
 */
export const RATCHET_TOLERANCE = 0.005;

export const BASELINE_PATH = 'coverage-baseline.json';

export interface Baseline {
  lines: number;
  functions: number;
}

export interface Thresholds {
  lines: number;
  functions: number;
}

/**
 * The bar this run must clear: the hard floor, or just under the baseline —
 * whichever is higher.
 */
export function effectiveThresholds(
  baseline: Baseline | null,
  minimum = MINIMUM_COVERAGE,
  tolerance = RATCHET_TOLERANCE,
): Thresholds {
  return {
    lines: Math.max(minimum, (baseline?.lines ?? 0) - tolerance),
    functions: Math.max(minimum, (baseline?.functions ?? 0) - tolerance),
  };
}

/** Parses a baseline file, treating anything malformed as "no baseline". */
export function parseBaseline(raw: string): Baseline | null {
  try {
    const parsed = JSON.parse(raw);
    const { lines, functions } = parsed ?? {};
    if (typeof lines !== 'number' || typeof functions !== 'number') return null;
    if (!Number.isFinite(lines) || !Number.isFinite(functions)) return null;
    return { lines, functions };
  } catch {
    return null;
  }
}

export interface FileCoverage {
  file: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
}

export interface CoverageSummary {
  files: FileCoverage[];
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
  /** Fraction in [0, 1]. A report with nothing to measure counts as 0, not 100. */
  lineRate: number;
  functionRate: number;
}

/**
 * Parses the subset of lcov Bun emits: SF (source file), LF/LH (lines
 * found/hit), FNF/FNH (functions found/hit), one record per `end_of_record`.
 */
export function parseLcov(lcov: string): FileCoverage[] {
  const files: FileCoverage[] = [];
  let current: FileCoverage | null = null;

  for (const rawLine of lcov.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('SF:')) {
      current = {
        file: line.slice(3),
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
      };
      continue;
    }
    if (!current) continue;

    if (line === 'end_of_record') {
      files.push(current);
      current = null;
    } else if (line.startsWith('LF:')) current.linesFound = Number(line.slice(3));
    else if (line.startsWith('LH:')) current.linesHit = Number(line.slice(3));
    else if (line.startsWith('FNF:')) current.functionsFound = Number(line.slice(4));
    else if (line.startsWith('FNH:')) current.functionsHit = Number(line.slice(4));
  }

  // Tolerate a report truncated mid-record rather than dropping the file.
  if (current) files.push(current);
  return files;
}

export function summarize(files: FileCoverage[]): CoverageSummary {
  const total = (pick: (f: FileCoverage) => number) => files.reduce((sum, f) => sum + pick(f), 0);

  const linesFound = total((f) => f.linesFound);
  const linesHit = total((f) => f.linesHit);
  const functionsFound = total((f) => f.functionsFound);
  const functionsHit = total((f) => f.functionsHit);

  return {
    files,
    linesFound,
    linesHit,
    functionsFound,
    functionsHit,
    lineRate: linesFound === 0 ? 0 : linesHit / linesFound,
    functionRate: functionsFound === 0 ? 0 : functionsHit / functionsFound,
  };
}

export interface CoverageCheck {
  passed: boolean;
  summary: CoverageSummary;
  failures: string[];
}

/** Accepts one number for both dimensions, or an explicit pair. */
export function checkCoverage(
  lcov: string,
  thresholds: Thresholds | number = MINIMUM_COVERAGE,
): CoverageCheck {
  const bar: Thresholds =
    typeof thresholds === 'number' ? { lines: thresholds, functions: thresholds } : thresholds;

  const summary = summarize(parseLcov(lcov));
  const failures: string[] = [];

  const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`;

  if (summary.linesFound === 0) {
    failures.push('No coverage data found — the report is empty.');
  } else {
    if (summary.lineRate < bar.lines) {
      failures.push(
        `Line coverage ${pct(summary.lineRate)} is below the required ${pct(bar.lines)} ` +
          `(${summary.linesHit}/${summary.linesFound} lines).`,
      );
    }
    if (summary.functionRate < bar.functions) {
      failures.push(
        `Function coverage ${pct(summary.functionRate)} is below the required ${pct(bar.functions)} ` +
          `(${summary.functionsHit}/${summary.functionsFound} functions).`,
      );
    }
  }

  return { passed: failures.length === 0, summary, failures };
}

/** The files contributing the most uncovered lines — where to go to fix a red gate. */
export function worstOffenders(summary: CoverageSummary, limit = 10): FileCoverage[] {
  return [...summary.files]
    .filter((f) => f.linesFound > f.linesHit)
    .sort((a, b) => b.linesFound - b.linesHit - (a.linesFound - a.linesHit))
    .slice(0, limit);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const updateBaseline = args.includes('--update-baseline');
  const lcovPath = args.find((a) => !a.startsWith('--')) ?? 'coverage/lcov.info';
  const report = Bun.file(lcovPath);

  if (!(await report.exists())) {
    console.error(
      `Coverage report not found at ${lcovPath}.\n` +
        'Run `bun run test:coverage`, which generates it before this check.',
    );
    process.exit(1);
  }

  const baselineFile = Bun.file(BASELINE_PATH);
  const baseline = (await baselineFile.exists()) ? parseBaseline(await baselineFile.text()) : null;
  const bar = effectiveThresholds(baseline);

  const result = checkCoverage(await report.text(), bar);
  const { summary } = result;
  const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`;

  console.log('\n=== Coverage gate ===');
  console.log(`  Floor:     ${pct(MINIMUM_COVERAGE)}`);
  console.log(
    baseline
      ? `  Baseline:  ${pct(baseline.lines)} lines / ${pct(baseline.functions)} functions ` +
          `(${pct(RATCHET_TOLERANCE)} slack)`
      : `  Baseline:  none recorded — floor applies`,
  );
  console.log(`  Required:  ${pct(bar.lines)} lines / ${pct(bar.functions)} functions`);
  console.log(`  Lines:     ${pct(summary.lineRate)} (${summary.linesHit}/${summary.linesFound})`);
  console.log(
    `  Functions: ${pct(summary.functionRate)} (${summary.functionsHit}/${summary.functionsFound})`,
  );
  console.log(`  Files measured: ${summary.files.length}`);

  if (updateBaseline) {
    const next: Baseline = {
      lines: Number(summary.lineRate.toFixed(4)),
      functions: Number(summary.functionRate.toFixed(4)),
    };
    await Bun.write(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nWrote ${BASELINE_PATH}: ${pct(next.lines)} lines / ${pct(next.functions)} functions\n`);
    process.exit(0);
  }

  if (result.passed) {
    console.log('\nPASS — coverage is above the required level.');
    const grew =
      !baseline ||
      summary.lineRate > baseline.lines + RATCHET_TOLERANCE ||
      summary.functionRate > baseline.functions + RATCHET_TOLERANCE;
    if (grew) {
      // Locking in a rise is what stops the number sliding back later.
      console.log(
        `Coverage is above the recorded baseline — run ` +
          `\`bun scripts/check-coverage.ts ${lcovPath} --update-baseline\` and commit ${BASELINE_PATH} ` +
          `to hold the gain.`,
      );
    }
    console.log('');
    process.exit(0);
  }

  console.error('\nFAIL');
  for (const failure of result.failures) console.error(`  - ${failure}`);

  const offenders = worstOffenders(summary);
  if (offenders.length > 0) {
    console.error('\nMost uncovered lines:');
    for (const f of offenders) {
      console.error(`  ${String(f.linesFound - f.linesHit).padStart(5)} uncovered  ${f.file}`);
    }
  }
  console.error('');
  process.exit(1);
}
