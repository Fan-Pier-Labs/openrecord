/// <reference types="bun" />
// ^ These run under `bun test`, not in the app: the reference pulls in
// bun:test module declarations without adding Bun globals to the app config.
import { describe, expect, test } from "bun:test";
import { isOutOfRange } from "../outOfRange";
import type { LabComponentStandard } from "../../../../../scrapers/myChart/chart/labs/labResults";

type Range = LabComponentStandard["componentResultInfo"]["referenceRange"];

function range(partial: Partial<Range> = {}): Range {
  return {
    formattedReferenceRange: null,
    low: null,
    high: null,
    displayLow: null,
    displayHigh: null,
    lowerBoundExclusive: null,
    upperBoundExclusive: null,
    ...partial,
  };
}

function component(numericValue: number | null, referenceRange: Range): LabComponentStandard {
  return {
    componentInfo: { componentID: null, name: null, commonName: null, units: null },
    componentResultInfo: { valueText: numericValue === null ? null : String(numericValue), numericValue, isValueRtf: false, referenceRange },
    componentComments: { contentAsString: null },
  };
}

describe("isOutOfRange", () => {
  test("judges a component against its own range, not MyChart's always-'Unknown' flag", () => {
    expect(isOutOfRange(component(190, range({ low: 0, high: 100 })))).toBe(true);
    expect(isOutOfRange(component(35, range({ low: 40, high: 60 })))).toBe(true);
    expect(isOutOfRange(component(50, range({ low: 0, high: 100 })))).toBe(false);
  });

  test("judges a one-sided range on the bound it has", () => {
    expect(isOutOfRange(component(250, range({ high: 200 })))).toBe(true);
    expect(isOutOfRange(component(10, range({ low: 40 })))).toBe(true);
    expect(isOutOfRange(component(150, range({ high: 200 })))).toBe(false);
  });

  test("counts a value on an inclusive bound as in range, and on an exclusive one as out", () => {
    expect(isOutOfRange(component(60, range({ low: 40, high: 60 })))).toBe(false);
    expect(isOutOfRange(component(60, range({ low: 40, high: 60, upperBoundExclusive: true })))).toBe(true);
    expect(isOutOfRange(component(40, range({ low: 40, high: 60 })))).toBe(false);
    expect(isOutOfRange(component(40, range({ low: 40, high: 60, lowerBoundExclusive: true })))).toBe(true);
  });

  test("never flags what it cannot judge, rather than guessing", () => {
    // A qualitative result ("NEGATIVE") or a censored one ("<0.01") reaches the
    // processor with no numericValue, and a range MyChart printed as prose
    // reaches it with no numeric bound. Neither is evidence of a normal value —
    // but neither is evidence of an abnormal one, and an alert needs evidence.
    expect(isOutOfRange(component(null, range({ low: 0, high: 1 })))).toBe(false);
    expect(isOutOfRange(component(5, range()))).toBe(false);
    expect(isOutOfRange(component(5, range({ displayHigh: "Negative" })))).toBe(false);
  });
});
