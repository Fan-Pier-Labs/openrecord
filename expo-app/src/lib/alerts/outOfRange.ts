import type { LabComponentStandard } from "../../../../scrapers/myChart/chart/labs/labResults";

/**
 * Whether a component sits outside its own numeric reference range.
 *
 * MyChart gives no per-value verdict — its abnormal flag reads "Unknown" on
 * every real instance (#375) and the processor leaves it in raw — so the
 * app draws this conclusion itself, for its own alert list, from the range
 * MyChart printed. A component with no numeric value or no bounds is never
 * flagged.
 *
 * Its own module rather than a helper inside generator.ts: generator.ts
 * reaches the app's session manager and storage, which pull in react-native
 * and cannot load under `bun test`, so the boundary rules below would be
 * untestable there.
 */
export function isOutOfRange(component: LabComponentStandard): boolean {
  const { numericValue, referenceRange } = component.componentResultInfo;
  if (numericValue === null) return false;
  const { low, high, lowerBoundExclusive, upperBoundExclusive } = referenceRange;
  if (low !== null && (lowerBoundExclusive ? numericValue <= low : numericValue < low)) return true;
  if (high !== null && (upperBoundExclusive ? numericValue >= high : numericValue > high)) return true;
  return false;
}
