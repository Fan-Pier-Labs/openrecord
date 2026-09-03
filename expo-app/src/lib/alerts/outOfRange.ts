/**
 * Whether a lab component sits outside its own numeric reference range.
 *
 * MyChart gives no per-value verdict — its abnormal flag reads "Unknown" on
 * every real instance (#375) and the processor leaves it in raw — so the app
 * draws this conclusion itself, for its own alert list, from the range MyChart
 * printed. A component with no numeric value or no bounds is never flagged.
 *
 * It lives in its own module, apart from `generator.ts`, so a test can import
 * it without pulling the alert generator's expo-sqlite storage in behind it.
 */

import type { LabComponentStandard } from "../../../../scrapers/myChart/chart/labs/labResults";

export function isOutOfRange(component: LabComponentStandard): boolean {
  const { numericValue, referenceRange } = component.componentResultInfo;
  if (numericValue === null) return false;
  const { low, high, lowerBoundExclusive, upperBoundExclusive } = referenceRange;
  if (low !== null && (lowerBoundExclusive ? numericValue <= low : numericValue < low)) return true;
  if (high !== null && (upperBoundExclusive ? numericValue >= high : numericValue > high)) return true;
  return false;
}
