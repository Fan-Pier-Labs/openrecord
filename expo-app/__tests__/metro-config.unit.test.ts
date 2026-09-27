import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import config from "../metro.config.js";

// If this swap stops matching, the app keeps the Node/Bun stub and quietly
// falls back to React Native's fetch, which follows redirects it was told not
// to — a login that fails on device while every other test passes.
describe("metro.config.js", () => {
  const stub = path.resolve(import.meta.dir, "../../scrapers/expoTransport.ts");
  const shim = path.resolve(import.meta.dir, "../shims/expo-transport.ts");

  const { resolveRequest } = config.resolver;
  if (!resolveRequest) throw new Error("metro.config.js no longer sets resolver.resolveRequest");

  // Only the fallback resolver is read on this path, so the rest of Metro's
  // context is left out.
  const resolveTo = (filePath: string) =>
    resolveRequest(
      { resolveRequest: () => ({ type: "sourceFile", filePath }) } as unknown as Parameters<typeof resolveRequest>[0],
      "./expoTransport",
      "ios",
    );

  it("swaps the scrapers' expoTransport stub for the expo/fetch shim", () => {
    expect(fs.existsSync(stub)).toBe(true);
    expect(resolveTo(stub)).toEqual({ type: "sourceFile", filePath: shim });
  });

  it("leaves every other module alone", () => {
    const other = path.resolve(import.meta.dir, "../../scrapers/cookies.ts");
    expect(resolveTo(other)).toEqual({ type: "sourceFile", filePath: other });
  });
});
