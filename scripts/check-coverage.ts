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

/** Overall line and function coverage the repo must hold. */
export const MINIMUM_COVERAGE = 0.75;

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

export function checkCoverage(lcov: string, minimum = MINIMUM_COVERAGE): CoverageCheck {
  const summary = summarize(parseLcov(lcov));
  const failures: string[] = [];

  const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`;
  const required = pct(minimum);

  if (summary.linesFound === 0) {
    failures.push('No coverage data found — the report is empty.');
  } else {
    if (summary.lineRate < minimum) {
      failures.push(
        `Line coverage ${pct(summary.lineRate)} is below the required ${required} ` +
          `(${summary.linesHit}/${summary.linesFound} lines).`,
      );
    }
    if (summary.functionRate < minimum) {
      failures.push(
        `Function coverage ${pct(summary.functionRate)} is below the required ${required} ` +
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
  const lcovPath = process.argv[2] ?? 'coverage/lcov.info';
  const report = Bun.file(lcovPath);

  if (!(await report.exists())) {
    console.error(
      `Coverage report not found at ${lcovPath}.\n` +
        'Run `bun run test:coverage`, which generates it before this check.',
    );
    process.exit(1);
  }

  const result = checkCoverage(await report.text());
  const { summary } = result;
  const pct = (rate: number) => `${(rate * 100).toFixed(2)}%`;

  console.log('\n=== Coverage gate ===');
  console.log(`  Minimum required: ${pct(MINIMUM_COVERAGE)}`);
  console.log(`  Lines:     ${pct(summary.lineRate)} (${summary.linesHit}/${summary.linesFound})`);
  console.log(
    `  Functions: ${pct(summary.functionRate)} (${summary.functionsHit}/${summary.functionsFound})`,
  );
  console.log(`  Files measured: ${summary.files.length}`);

  if (result.passed) {
    console.log('\nPASS — coverage is above the minimum.\n');
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
