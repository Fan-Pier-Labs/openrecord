import { describe, it, expect } from "bun:test";
import { isOutOfRange, rangeVerdict } from "../outOfRange";
import type { ReferenceRange, ResultComponent } from "../../../../../scrapers/myChart/chart/labs/labtestresulttype";

function range(partial: Partial<ReferenceRange> = {}): ReferenceRange {
  return { displayLow: "", displayHigh: "", formattedReferenceRange: "", ...partial };
}

function component(value: string, numericValue: number | undefined, referenceRange: ReferenceRange): ResultComponent {
  return {
    componentInfo: { componentID: "", name: "", commonName: "", units: "" },
    componentResultInfo: {
      value,
      isValueRtf: false,
      ...(numericValue === undefined ? {} : { numericValue }),
      referenceRange,
    },
    componentComments: { isRTF: false, hasContent: false, contentAsString: "", contentAsHtml: "" },
  };
}

describe("rangeVerdict", () => {
  it("judges a component against its own range, ignoring the useless flag", () => {
    expect(rangeVerdict(component("190", 190, range({ low: 0, high: 100 })))).toBe("high");
    expect(rangeVerdict(component("35", 35, range({ low: 40, high: 60 })))).toBe("low");
    expect(rangeVerdict(component("50", 50, range({ low: 0, high: 100 })))).toBe("inRange");
  });

  it("counts a value on an inclusive bound as in range, and on an exclusive one as out", () => {
    expect(rangeVerdict(component("60", 60, range({ low: 40, high: 60 })))).toBe("inRange");
    expect(rangeVerdict(component("60", 60, range({ low: 40, high: 60, upperBoundExclusive: true })))).toBe("high");
    expect(rangeVerdict(component("40", 40, range({ low: 40, high: 60, lowerBoundExclusive: true })))).toBe("low");
  });

  it("judges a one-sided range on the bound it has", () => {
    expect(rangeVerdict(component("250", 250, range({ high: 200 })))).toBe("high");
    expect(rangeVerdict(component("10", 10, range({ low: 40 })))).toBe("low");
  });

  it("falls back to the value string and the display bounds", () => {
    expect(rangeVerdict(component("190", undefined, range({ displayLow: "0", displayHigh: "100" })))).toBe("high");
  });

  it("answers unknown rather than guessing, and unknown is not out of range", () => {
    const qualitative = component("NEGATIVE", undefined, range({ low: 0, high: 1 }));
    const censored = component("<0.01", undefined, range({ low: 0, high: 1 }));
    const noRange = component("5", 5, range());
    const proseRange = component("5", 5, range({ displayHigh: "Negative" }));

    for (const c of [qualitative, censored, noRange, proseRange]) {
      expect(rangeVerdict(c)).toBe("unknown");
      expect(isOutOfRange(c)).toBe(false);
    }
    expect(rangeVerdict(undefined)).toBe("unknown");
  });

  it("treats only low and high as out of range", () => {
    expect(isOutOfRange(component("190", 190, range({ low: 0, high: 100 })))).toBe(true);
    expect(isOutOfRange(component("35", 35, range({ low: 40, high: 60 })))).toBe(true);
    expect(isOutOfRange(component("50", 50, range({ low: 0, high: 100 })))).toBe(false);
  });
});
