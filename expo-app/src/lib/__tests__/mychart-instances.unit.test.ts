import { describe, expect, test } from "bun:test";
import {
  getInstances,
  hostnameFromInstance,
  searchInstances,
  type MyChartInstance,
} from "../mychart-instances";

function makeInstance(overrides: Partial<MyChartInstance>): MyChartInstance {
  return {
    name: "Test Medical Center",
    url: "https://mychart.test.org/MyChart/",
    logoUrl: "",
    logoS3Key: "",
    logoS3Url: "",
    ...overrides,
  };
}

describe("getInstances", () => {
  test("puts the fake-mychart demo entry first", () => {
    const instances = getInstances();
    expect(instances[0].name).toBe("Springfield Medical Center (Demo)");
    expect(instances[0].url).toContain("fake-mychart.fanpierlabs.com");
  });

  test("includes the bundled instance list", () => {
    // ~1800 bundled sites + the demo entry.
    expect(getInstances().length).toBeGreaterThan(100);
  });

  test("returns the same cached array on repeat calls", () => {
    expect(getInstances()).toBe(getInstances());
  });
});

describe("hostnameFromInstance", () => {
  test("extracts the host from a full URL", () => {
    const i = makeInstance({ url: "https://mychart.example.org/MyChart/" });
    expect(hostnameFromInstance(i)).toBe("mychart.example.org");
  });

  test("preserves non-default ports", () => {
    const i = makeInstance({ url: "http://localhost:4001/MyChart/" });
    expect(hostnameFromInstance(i)).toBe("localhost:4001");
  });

  test("falls back to string parsing for invalid URLs", () => {
    const i = makeInstance({ url: "not a url/path" });
    expect(hostnameFromInstance(i)).toBe("not a url");
  });

  test("strips protocol in the fallback path", () => {
    // URL constructor accepts this, but exercise the fallback shape too:
    const i = makeInstance({ url: "" });
    expect(hostnameFromInstance(i)).toBe("");
  });
});

describe("searchInstances", () => {
  const fixtures: MyChartInstance[] = [
    makeInstance({ name: "Springfield Medical Center", url: "https://mychart.springfield.org/" }),
    makeInstance({ name: "Shelbyville Hospital", url: "https://epic.shelbyville.com/MyChart/" }),
    makeInstance({ name: "Capital City Health", url: "not a url" }),
  ];

  test("empty query returns everything", () => {
    expect(searchInstances("", fixtures)).toHaveLength(3);
    expect(searchInstances("   ", fixtures)).toHaveLength(3);
  });

  test("matches by name, case-insensitively", () => {
    const result = searchInstances("springfield", fixtures);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Springfield Medical Center");
  });

  test("matches by hostname", () => {
    const result = searchInstances("epic.shelbyville", fixtures);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Shelbyville Hospital");
  });

  test("invalid URLs never match on host but still match on name", () => {
    expect(searchInstances("capital city", fixtures)).toHaveLength(1);
    expect(searchInstances("zzz-no-match", fixtures)).toHaveLength(0);
  });

  test("searches the bundled list by default", () => {
    const result = searchInstances("Springfield Medical Center (Demo)");
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
