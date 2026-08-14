/**
 * The app's instance list and logo cache.
 *
 * Everything interesting here is a failure path — an offline launch, a stale
 * cache, a logo Epic doesn't serve — so the SQLite layer is replaced with an
 * in-memory stand-in (the real one pulls in expo-sqlite, which needs a device)
 * and the network with `setTestTransport`.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";

import { setTestTransport } from "../../../../scrapers/http";

// Must be registered before the module under test is imported: it reaches the
// database at module scope through its own import.
const store: { directory: { json: string; refreshedAt: string } | null; logos: Map<string, string> } = {
  directory: null,
  logos: new Map(),
};

await mock.module("@/lib/storage/database", () => ({
  getCachedDirectory: () => Promise.resolve(store.directory),
  setCachedDirectory: (json: string) => {
    store.directory = { json, refreshedAt: new Date().toISOString() };
    return Promise.resolve();
  },
  getCachedLogo: (url: string) => Promise.resolve(store.logos.get(url) ?? null),
  setCachedLogo: (url: string, dataUri: string) => {
    store.logos.set(url, dataUri);
    return Promise.resolve();
  },
}));

const {
  getInstances,
  initInstances,
  loadInstanceLogo,
  peekInstanceLogo,
  refreshInstances,
  searchInstances,
} = await import("../mychart-instances");

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const PNG_DATA_URI = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;

function directoryResponse(names: string[]): Response {
  return new Response(
    JSON.stringify({
      organizations: names.map((name, index) => ({
        slgId: `live-${index}`,
        name,
        loginUrl: `https://${name.toLowerCase()}.example/mychart/`,
        logo: { imageId: 'IMG', fileName: `${index}.png`, subAreaName: 'organizations' },
        aliases: [],
        states: [],
        countries: [],
        brandName: 'MyChart',
        liveOnCentral: true,
      })),
    }),
    { status: 200 },
  );
}

beforeEach(() => {
  store.directory = null;
  store.logos.clear();
  setTestTransport(null);
});

describe("the instance list", () => {
  it("serves the bundled seed before anything loads", () => {
    const seed = getInstances();
    expect(seed.length).toBeGreaterThan(1000);
    // The demo entry is always first so it can be found without a network.
    expect(seed[0]!.slgId).toBe("fake-mychart");
  });

  it("prefers the cached list over the seed, without a network call", async () => {
    store.directory = {
      json: JSON.stringify([
        { name: "Cached Health", url: "https://cached.example/", logoUrl: "", slgId: "c1", aliases: [] },
      ]),
      refreshedAt: new Date().toISOString(),
    };
    setTestTransport(() => {
      throw new Error("should not reach the network for a fresh cache");
    });

    await initInstances();
    expect(getInstances().map((i) => i.name)).toEqual([
      "Springfield Medical Center (Demo)",
      "Cached Health",
    ]);
  });

  it("refreshes when the cache is older than a week", async () => {
    store.directory = {
      json: JSON.stringify([
        { name: "Stale Health", url: "https://stale.example/", logoUrl: "", slgId: "s1", aliases: [] },
      ]),
      refreshedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };
    setTestTransport(() => Promise.resolve(directoryResponse(["Fresh Health"])));

    await initInstances();
    expect(getInstances().some((i) => i.name === "Fresh Health")).toBe(true);
    expect(getInstances().some((i) => i.name === "Stale Health")).toBe(false);
    // …and the refreshed list is what the next launch reads.
    expect(store.directory?.json).toContain("Fresh Health");
  });

  it("keeps the list it already had when the refresh fails", async () => {
    store.directory = {
      json: JSON.stringify([
        { name: "Offline Health", url: "https://offline.example/", logoUrl: "", slgId: "o1", aliases: [] },
      ]),
      refreshedAt: new Date(0).toISOString(),
    };
    setTestTransport(() => Promise.reject(new Error("offline")));

    await initInstances();
    expect(getInstances().map((i) => i.name)).toContain("Offline Health");
  });

  it("ignores an empty directory rather than emptying the picker", async () => {
    const before = getInstances();
    setTestTransport(() => Promise.resolve(new Response(JSON.stringify({ organizations: [] }))));
    await refreshInstances();
    expect(getInstances()).toEqual(before);
    expect(store.directory).toBeNull();
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
