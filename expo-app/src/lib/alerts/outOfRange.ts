/**
 * Which lab components are outside their reference range.
 *
 * MyChart does not tell us. Captured Sep 2026 against two real instances:
 * `abnormalFlagCategoryValue` was `"Unknown"` on all 175 components (13 of
 * them outside their own numeric range), every result's `isAbnormal` was
 * `false`, and no other field in the payload held a verdict — which is why the
 * scraper now drops that field instead of passing it on (see
 * `dropUnusableAbnormalFlags` in labResults.ts).
 *
 * So an app that wants to flag a component compares the value against the
 * range itself. This lives in the app, deliberately: the scraper passes on
 * what MyChart sent, and a verdict MyChart never made is the consumer's to
 * draw for its own UI — it is not written back into the chart.
 */

import type { ResultComponent } from "../../../../scrapers/myChart/chart/labs/labtestresulttype";

export type RangeVerdict = "low" | "high" | "inRange" | "unknown";

/** A finite number, or null — `"<0.01"`, `"NEGATIVE"` and `""` are all null. */
function parseNumeric(raw: string | number | undefined | null): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Compare one component against its own reference range.
 *
 * `"unknown"` whenever the comparison can't be made — a qualitative result, a
 * censored value, or a range with no numeric bound. Never guess: an unreadable
 * component is not a normal one.
 */
export function rangeVerdict(component: ResultComponent | undefined): RangeVerdict {
  const info = component?.componentResultInfo;
  if (!info) return "unknown";

  const value = parseNumeric(info.numericValue) ?? parseNumeric(info.value);
  if (value === null) return "unknown";

  const range = info.referenceRange;
  const low = parseNumeric(range?.low) ?? parseNumeric(range?.displayLow);
  const high = parseNumeric(range?.high) ?? parseNumeric(range?.displayHigh);
  if (low === null && high === null) return "unknown";

  // An exclusive bound excludes the bound itself, so a value equal to it is out.
  if (low !== null && (range?.lowerBoundExclusive ? value <= low : value < low)) return "low";
  if (high !== null && (range?.upperBoundExclusive ? value >= high : value > high)) return "high";
  return "inRange";
}

/** True only when the component is provably outside its range. */
export function isOutOfRange(component: ResultComponent | undefined): boolean {
  const verdict = rangeVerdict(component);
  return verdict === "low" || verdict === "high";
}
