import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

/**
 * track.ts reads NEXT_PUBLIC_ANALYTICS_* at module scope, so each test imports a
 * fresh copy with a cache-busting query string after setting the env it needs.
 */
async function importTrack() {
  const mod = await import(`../track?bust=${Math.random()}`);
  return mod.track as (event: string, properties?: Record<string, unknown>) => void;
}

/** The slice of `localStorage` that track.ts actually touches. */
interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** track.ts reads `window.localStorage`; nothing else off `window`. */
type TestGlobal = typeof globalThis & { window?: { localStorage: FakeStorage } };
const testGlobal = globalThis as TestGlobal;

/** Minimal localStorage stand-in so getDeviceId() has somewhere to persist. */
function makeLocalStorage(): FakeStorage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
}

const ANALYTICS_ENV = ["NEXT_PUBLIC_ANALYTICS_ENDPOINT", "NEXT_PUBLIC_ANALYTICS_DISABLED"] as const;

let originalFetch: typeof globalThis.fetch;
let originalEnv: Record<string, string | undefined>;
let fetchMock: ReturnType<typeof mock>;

/** Bodies POSTed to the analytics endpoint during this test. */
function analyticsBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map((call) =>
    JSON.parse((call[1] as RequestInit).body as string),
  );
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalEnv = Object.fromEntries(ANALYTICS_ENV.map((k) => [k, process.env[k]]));
  for (const key of ANALYTICS_ENV) delete process.env[key];

  fetchMock = mock(() => Promise.resolve(new Response("{}", { status: 200 })));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  // track() bails when there's no window, and uses localStorage + crypto.randomUUID.
  testGlobal.window = { localStorage: makeLocalStorage() };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ANALYTICS_ENV) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key]!;
  }
  delete testGlobal.window;
});

describe("track", () => {
  test("posts the event to the analytics endpoint", async () => {
    const track = await importTrack();
    track("scrape_button_clicked", { count: 2 });
    await new Promise((r) => setTimeout(r, 50));

    const analyticsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("execute-api"),
    );
    expect(analyticsCalls).toHaveLength(1);

    const [body] = analyticsBodies();
    expect(body.event).toBe("scrape_button_clicked");
    expect(body.source).toBe("web");
    expect(body.properties).toEqual({ count: 2 });
    expect(body.deviceId).toBeTruthy();
    expect(typeof body.ts).toBe("number");
  });

  test("sets keepalive so events survive a navigation", async () => {
    const track = await importTrack();
    track("nav_event");
    await new Promise((r) => setTimeout(r, 50));
    expect((fetchMock.mock.calls[0][1] as RequestInit).keepalive).toBe(true);
  });

  test("defaults properties to an empty object when omitted", async () => {
    const track = await importTrack();
    track("no_props");
    await new Promise((r) => setTimeout(r, 50));
    expect(analyticsBodies()[0].properties).toEqual({});
  });

  test("reuses one device id across events and persists it", async () => {
    const track = await importTrack();
    track("first");
    track("second");
    await new Promise((r) => setTimeout(r, 50));

    const [first, second] = analyticsBodies();
    expect(first.deviceId).toBe(second.deviceId);
    expect(testGlobal.window!.localStorage.getItem("openrecord_device_id")).toBe(
      first.deviceId,
    );
  });

  test("still tracks when localStorage throws (private mode)", async () => {
    testGlobal.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    const track = await importTrack();
    expect(() => track("private_mode")).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    expect(analyticsBodies()[0].deviceId).toBeTruthy();
  });

  test("honors NEXT_PUBLIC_ANALYTICS_ENDPOINT as an override", async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT = "https://analytics.example.test";
    const track = await importTrack();
    track("routed_event");
    await new Promise((r) => setTimeout(r, 50));
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://analytics.example.test");
  });

  test("skips the analytics sink when NEXT_PUBLIC_ANALYTICS_DISABLED is set", async () => {
    process.env.NEXT_PUBLIC_ANALYTICS_DISABLED = "1";
    const track = await importTrack();
    track("opted_out");
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  test("never throws when the network rejects", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    const track = await importTrack();
    expect(() => track("offline_event")).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
  });

  test("is a no-op during server-side rendering", async () => {
    const track = await importTrack();
    delete testGlobal.window;
    expect(() => track("ssr_event")).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock.mock.calls).toHaveLength(0);
  });
});
