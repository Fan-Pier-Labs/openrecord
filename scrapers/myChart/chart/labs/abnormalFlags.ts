/**
 * Per-component abnormality, normalized.
 *
 * MyChart carries a per-component `abnormalFlagCategoryValue`, but on many
 * instances every component comes back as `"Unknown"` (or empty) even when the
 * order itself is flagged `isAbnormal: true` — a lipid panel whose LDL is 190
 * against a stated 0-100 says nothing about that component. Rather than making
 * every consumer re-derive abnormality by comparing each value against its
 * reference range, we do it once here and annotate the component.
 *
 * The instance's own flag always wins; the reference range is only consulted
 * when the instance reported nothing usable. When neither answers — a
 * non-numeric result, or no reference range — the component is left untouched,
 * so an absent `abnormalFlag` means "we don't know", never "normal".
 */

import type { ComponentResultInfo, HistoricalResultsResponse, LabTestResult, ReferenceRange } from './labtestresulttype';

export type AbnormalFlag = 'normal' | 'low' | 'high' | 'criticalLow' | 'criticalHigh' | 'abnormal';

/** Where `abnormalFlag` came from: the instance said so, or we compared against the reference range. */
export type AbnormalFlagSource = 'reported' | 'derived';

/**
 * Values seen in `abnormalFlagCategoryValue`, keyed by their letters and digits
 * lowercased. Epic populates the field from the lab's HL7 abnormal flag, so
 * both the spelled-out category names and the raw HL7 codes (H, L, HH, LL, A,
 * N) turn up depending on the instance. Anything not listed here — `Unknown`,
 * `None`, an empty string, a numeric id we can't read — falls through to the
 * reference range.
 */
const REPORTED_FLAGS: Record<string, AbnormalFlag> = {
  n: 'normal',
  normal: 'normal',
  wnl: 'normal',
  withinnormallimits: 'normal',

  l: 'low',
  low: 'low',
  abnormallow: 'low',
  belowlownormal: 'low',

  h: 'high',
  high: 'high',
  abnormalhigh: 'high',
  abovehighnormal: 'high',

  ll: 'criticalLow',
  criticallow: 'criticalLow',
  paniclow: 'criticalLow',
  belowlowerpaniclimits: 'criticalLow',

  hh: 'criticalHigh',
  criticalhigh: 'criticalHigh',
  panichigh: 'criticalHigh',
  abovehigherpaniclimits: 'criticalHigh',

  a: 'abnormal',
  aa: 'abnormal',
  abnormal: 'abnormal',
  critical: 'abnormal',
};

/** The instance's own flag, or null when it reported nothing we recognize. */
export function normalizeReportedFlag(raw: string | number | undefined | null): AbnormalFlag | null {
  if (raw === undefined || raw === null) return null;
  const key = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key) return null;
  return REPORTED_FLAGS[key] ?? null;
}

/** A finite number, or null — `"<0.01"`, `"Negative"` and `""` are all null. */
function parseNumeric(raw: string | number | undefined | null): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The reference range as numbers. `low`/`high` are used when present; some
 * instances only fill the display strings, so a plain numeric one of those
 * stands in ("<130" and "Negative" do not, and leave that bound open).
 */
function rangeBounds(range: ReferenceRange | undefined): { low: number | null; high: number | null } {
  if (!range) return { low: null, high: null };
  return {
    low: parseNumeric(range.low) ?? parseNumeric(range.displayLow),
    high: parseNumeric(range.high) ?? parseNumeric(range.displayHigh),
  };
}

/** Compare the value against its reference range, or null if either is missing. */
export function deriveFlagFromRange(info: ComponentResultInfo): AbnormalFlag | null {
  const value = parseNumeric(info.numericValue) ?? parseNumeric(info.value);
  if (value === null) return null;

  const { low, high } = rangeBounds(info.referenceRange);
  if (low === null && high === null) return null;

  if (low !== null && (info.referenceRange?.lowerBoundExclusive ? value <= low : value < low)) return 'low';
  if (high !== null && (info.referenceRange?.upperBoundExclusive ? value >= high : value > high)) return 'high';
  return 'normal';
}

/** Every flag except `normal` means the component is outside its range. */
export function isAbnormalFlag(flag: AbnormalFlag): boolean {
  return flag !== 'normal';
}

/**
 * Annotate one component in place with `abnormalFlag` / `isAbnormal` /
 * `abnormalFlagSource`, leaving the instance's raw
 * `abnormalFlagCategoryValue` exactly as it arrived. A component we can't
 * judge keeps all three fields absent.
 */
export function annotateComponentResultInfo(info: ComponentResultInfo | undefined): void {
  if (!info) return;

  const reported = normalizeReportedFlag(info.abnormalFlagCategoryValue);
  const flag = reported ?? deriveFlagFromRange(info);
  if (!flag) return;

  info.abnormalFlag = flag;
  info.isAbnormal = isAbnormalFlag(flag);
  info.abnormalFlagSource = reported ? 'reported' : 'derived';
}

/** Annotate every component of every result on an order, in place. */
export function annotateLabTestResult<T extends LabTestResult>(test: T): T {
  for (const result of test.results ?? []) {
    for (const component of result?.resultComponents ?? []) {
      annotateComponentResultInfo(component?.componentResultInfo);
    }
  }
  return test;
}

/** Annotate every point of every historical trend, in place. */
export function annotateHistoricalResults<T extends HistoricalResultsResponse>(history: T): T {
  for (const component of Object.values(history.historicalResults ?? {})) {
    for (const point of component?.historicalResultData ?? []) {
      annotateComponentResultInfo(point);
    }
  }
  return history;
}
