import { describe, expect, test } from "bun:test";
import { DEFAULT_PRODUCTION_SITE_URL, resolveSiteUrl } from "../site-url";

// resolveSiteUrl reads process.env by default; every case here passes an
// explicit env so the tests do not depend on the runner's environment.
const env = (overrides: Record<string, string>) => overrides as NodeJS.ProcessEnv;

describe("resolveSiteUrl", () => {
  test("prefers the explicit NEXT_PUBLIC_SITE_URL override", () => {
    expect(
      resolveSiteUrl(
        env({
          NEXT_PUBLIC_SITE_URL: "https://health.example.com",
          BETTER_AUTH_URL: "https://ignored.example.com",
          RAILWAY_PUBLIC_DOMAIN: "ignored.up.railway.app",
        }),
      ),
    ).toBe("https://health.example.com");
  });

  test("falls back through BETTER_AUTH_URL then NEXT_PUBLIC_BASE_URL", () => {
    expect(resolveSiteUrl(env({ BETTER_AUTH_URL: "https://auth.example.com" }))).toBe(
      "https://auth.example.com",
    );
    expect(resolveSiteUrl(env({ NEXT_PUBLIC_BASE_URL: "https://base.example.com" }))).toBe(
      "https://base.example.com",
    );
  });

  test("adds https:// to Railway's bare hostname", () => {
    expect(resolveSiteUrl(env({ RAILWAY_PUBLIC_DOMAIN: "openrecord.up.railway.app" }))).toBe(
      "https://openrecord.up.railway.app",
    );
  });

  test("strips paths and trailing slashes down to the origin", () => {
    expect(resolveSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "https://example.com/" }))).toBe(
      "https://example.com",
    );
    expect(resolveSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "https://example.com/app/home" }))).toBe(
      "https://example.com",
    );
  });

  test("keeps a non-default port", () => {
    expect(resolveSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "http://localhost:2343" }))).toBe(
      "http://localhost:2343",
    );
  });

  test("skips blank and unparseable values instead of throwing", () => {
    expect(
      resolveSiteUrl(
        env({
          NEXT_PUBLIC_SITE_URL: "   ",
          BETTER_AUTH_URL: "http://",
          NEXT_PUBLIC_BASE_URL: "https://good.example.com",
        }),
      ),
    ).toBe("https://good.example.com");
  });

  test("uses the Fargate domain in production when nothing is configured", () => {
    // AWS Fargate sets none of the URL env vars; without this fallback the
    // og:image would resolve against localhost and never load for a crawler.
    expect(resolveSiteUrl(env({ NODE_ENV: "production" }))).toBe(DEFAULT_PRODUCTION_SITE_URL);
    expect(DEFAULT_PRODUCTION_SITE_URL.startsWith("https://")).toBe(true);
  });

  test("uses localhost in development, honouring PORT", () => {
    expect(resolveSiteUrl(env({}))).toBe("http://localhost:3000");
    expect(resolveSiteUrl(env({ PORT: "2343" }))).toBe("http://localhost:2343");
  });

  test("always returns a value new URL() accepts — metadataBase would throw otherwise", () => {
    for (const e of [{}, { NODE_ENV: "production" }, { RAILWAY_PUBLIC_DOMAIN: "a.up.railway.app" }]) {
      expect(() => new URL(resolveSiteUrl(env(e as Record<string, string>)))).not.toThrow();
    }
  });
});
