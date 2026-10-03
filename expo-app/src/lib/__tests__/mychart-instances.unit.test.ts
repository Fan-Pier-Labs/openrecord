/**
 * The app's instance list and logo cache.
 *
 * The logo cache's interesting cases are failure paths — a logo Epic doesn't
 * serve, a request already in flight — so the SQLite layer is replaced with an
 * in-memory stand-in (the real one pulls in expo-sqlite, which needs a device)
 * and the network with `setTestTransport`.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";

import { setTestTransport } from "../../../../scrapers/http";
import { listMyCharts } from "../../../../scrapers/list-all-mycharts/directory";

// Must be registered before the module under test is imported: it reaches the
// database at module scope through its own import.
const store = { logos: new Map<string, string>() };

await mock.module("@/lib/storage/database", () => ({
  getCachedLogo: (url: string) => Promise.resolve(store.logos.get(url) ?? null),
  setCachedLogo: (url: string, dataUri: string) => {
    store.logos.set(url, dataUri);
    return Promise.resolve();
  },
}));

const { getInstances, loadInstanceLogo, peekInstanceLogo, searchInstances } = await import(
  "../mychart-instances"
);

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG_DATA_URI = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;

beforeEach(() => {
  store.logos.clear();
  setTestTransport(null);
});

describe("the instance list", () => {
  it("is the demo entry, then every MyChart the checked-in files know", () => {
    const list = getInstances();
    // The demo entry is always first so it can be found without an account.
    expect(list[0]!.slgId).toBe("fake-mychart");
    expect(list.slice(1)).toEqual(listMyCharts());
  });

  it("reaches the network for nothing but logos", () => {
    setTestTransport(() => {
      throw new Error("the list must not be fetched");
    });
    expect(getInstances().length).toBeGreaterThan(1000);
  });
});

describe("searchInstances", () => {
  const list = [
    { name: "Mercy General", url: "https://mercy.example/", logoUrl: "", slgId: "1", aliases: ["Sisters of Mercy"] },
    { name: "Valley Care", url: "https://valley.example/", logoUrl: "", slgId: "2", aliases: [] },
  ];

  it("matches on name, host and the aliases Epic publishes", () => {
    expect(searchInstances("mercy", list).map((i) => i.slgId)).toEqual(["1"]);
    expect(searchInstances("valley.example", list).map((i) => i.slgId)).toEqual(["2"]);
    // The name a patient knows the organization by, which it no longer uses.
    expect(searchInstances("sisters of", list).map((i) => i.slgId)).toEqual(["1"]);
  });

  it("matches an organization's extra hostnames", () => {
    const withExtra = [{ ...list[1]!, extraHosts: ["portal.valley-health.example"] }];
    expect(searchInstances("valley-health", withExtra).map((i) => i.slgId)).toEqual(["2"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchInstances("  ", list)).toHaveLength(2);
  });
});

describe("logos", () => {
  it("fetches once, then serves from memory", async () => {
    let requests = 0;
    setTestTransport(() => {
      requests += 1;
      return Promise.resolve(
        new Response(PNG_BYTES, { status: 200, headers: { "Content-Type": "image/png" } }),
      );
    });

    const url = "https://media.epic.com/first.png";
    expect(await loadInstanceLogo(url)).toBe(PNG_DATA_URI);
    expect(await loadInstanceLogo(url)).toBe(PNG_DATA_URI);
    expect(requests).toBe(1);
    expect(peekInstanceLogo(url)).toBe(PNG_DATA_URI);
    expect(store.logos.get(url)).toBe(PNG_DATA_URI);
  });

  it("coalesces concurrent requests for the same logo", async () => {
    let requests = 0;
    setTestTransport(() => {
      requests += 1;
      return Promise.resolve(new Response(PNG_BYTES, { status: 200 }));
    });

    const url = "https://media.epic.com/concurrent.png";
    const [a, b, c] = await Promise.all([
      loadInstanceLogo(url),
      loadInstanceLogo(url),
      loadInstanceLogo(url),
    ]);
    expect([a, b, c]).toEqual([PNG_DATA_URI, PNG_DATA_URI, PNG_DATA_URI]);
    expect(requests).toBe(1);
  });

  it("reads a previously stored logo without going to the network", async () => {
    const url = "https://media.epic.com/stored.png";
    store.logos.set(url, PNG_DATA_URI);
    setTestTransport(() => {
      throw new Error("should not fetch a stored logo");
    });
    expect(await loadInstanceLogo(url)).toBe(PNG_DATA_URI);
  });

  it("remembers a missing logo so a scrolling list doesn't re-ask for it", async () => {
    let requests = 0;
    setTestTransport(() => {
      requests += 1;
      return Promise.resolve(new Response("", { status: 404 }));
    });

    const url = "https://media.epic.com/missing.png";
    expect(await loadInstanceLogo(url)).toBeNull();
    expect(await loadInstanceLogo(url)).toBeNull();
    expect(requests).toBe(1);
  });

  it("has nothing to load for an instance with no logo", async () => {
    expect(await loadInstanceLogo("")).toBeNull();
  });
});
