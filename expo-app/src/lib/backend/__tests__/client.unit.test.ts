import { afterAll, beforeEach, describe, expect, test, mock } from "bun:test";

/**
 * backendFetch is how every screen talks to the AI Lambda: it resolves the
 * configured endpoint and attaches the user's Google ID token as Bearer auth.
 */

mock.module("expo-constants", () => ({
  default: { expoConfig: { extra: { backendUrl: "http://localhost:9999/" } } },
}));

// The real module drags in @react-native-google-signin (and react-native,
// which bun can't parse). Tests flip the token to exercise both branches.
let idToken: string | null = "test-id-token";
mock.module("@/lib/backend/google-signin", () => ({
  getFreshIdToken: async () => idToken,
}));

const { backendUrl, backendFetch } = await import("@/lib/backend/client");

const realFetch = globalThis.fetch;
let seen: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  idToken = "test-id-token";
  seen = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: url.toString(), init: init ?? {} });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("backendUrl", () => {
  test("strips the trailing slash and appends the path", () => {
    expect(backendUrl()).toBe("http://localhost:9999");
    expect(backendUrl("/health")).toBe("http://localhost:9999/health");
  });
});

describe("backendFetch", () => {
  test("attaches the Google ID token as Bearer auth", async () => {
    await backendFetch("");
    expect(seen[0].url).toBe("http://localhost:9999");
    expect(new Headers(seen[0].init.headers).get("Authorization")).toBe(
      "Bearer test-id-token",
    );
  });

  test("sends no Authorization header when there is no session", async () => {
    idToken = null;
    await backendFetch("");
    expect(new Headers(seen[0].init.headers).get("Authorization")).toBeNull();
  });

  test("defaults a body to JSON but leaves a declared Content-Type alone", async () => {
    await backendFetch("", { method: "POST", body: "{}" });
    expect(new Headers(seen[0].init.headers).get("Content-Type")).toBe(
      "application/json",
    );

    await backendFetch("", {
      method: "POST",
      body: "raw",
      headers: { "Content-Type": "text/plain" },
    });
    expect(new Headers(seen[1].init.headers).get("Content-Type")).toBe("text/plain");
  });

  test("omits credentials so browser cookies never ride along", async () => {
    await backendFetch("");
    expect(seen[0].init.credentials).toBe("omit");
  });
});
