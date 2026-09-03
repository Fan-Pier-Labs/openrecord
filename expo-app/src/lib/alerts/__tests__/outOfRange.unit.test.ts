import { describe, it, expect } from "bun:test";
import { isOutOfRange } from "../outOfRange";
import type { LabComponentStandard, ReferenceRangeStandard } from "../../../../../scrapers/myChart/chart/labs/labResults";

function range(partial: Partial<ReferenceRangeStandard> = {}): ReferenceRangeStandard {
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

function component(numericValue: number | null, referenceRange: ReferenceRangeStandard): LabComponentStandard {
  return {
    componentInfo: { componentID: null, name: null, commonName: null, units: null },
    componentResultInfo: { valueText: null, numericValue, isValueRtf: null, referenceRange },
    componentComments: { contentAsString: null },
  };
}

describe("isOutOfRange", () => {
  it("judges a component against the range MyChart printed", () => {
    expect(isOutOfRange(component(190, range({ low: 0, high: 100 })))).toBe(true);
    expect(isOutOfRange(component(35, range({ low: 40, high: 60 })))).toBe(true);
    expect(isOutOfRange(component(50, range({ low: 0, high: 100 })))).toBe(false);
  });

  it("counts a value on an inclusive bound as in range, and on an exclusive one as out", () => {
    expect(isOutOfRange(component(60, range({ low: 40, high: 60 })))).toBe(false);
    expect(isOutOfRange(component(40, range({ low: 40, high: 60 })))).toBe(false);
    expect(isOutOfRange(component(60, range({ low: 40, high: 60, upperBoundExclusive: true })))).toBe(true);
    expect(isOutOfRange(component(40, range({ low: 40, high: 60, lowerBoundExclusive: true })))).toBe(true);
  });

  it("judges a one-sided range on the bound it has", () => {
    expect(isOutOfRange(component(250, range({ high: 200 })))).toBe(true);
    expect(isOutOfRange(component(10, range({ high: 200 })))).toBe(false);
    expect(isOutOfRange(component(10, range({ low: 40 })))).toBe(true);
  });

  it("never flags what it cannot judge — a qualitative result, or a range with no bounds", () => {
    // MyChart's own flag would say "Unknown" here too; silence beats a guess.
    expect(isOutOfRange(component(null, range({ low: 0, high: 100 })))).toBe(false);
    expect(isOutOfRange(component(5, range()))).toBe(false);
  });
});
