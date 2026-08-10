import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest";

const PUBLIC_DIR = join(import.meta.dir, "../../../public");

/** Reads width/height out of a PNG's IHDR chunk (bytes 16..24). */
function pngSize(name: string): { width: number; height: number } {
  const buf = readFileSync(join(PUBLIC_DIR, name));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("web app manifest", () => {
  const m = manifest();

  test("has the fields an installable PWA needs", () => {
    expect(m.name).toContain("OpenRecord");
    expect(m.short_name).toBe("OpenRecord");
    expect(m.display).toBe("standalone");
    expect(m.scope).toBe("/");
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("start_url is absolute so an installed app opens the right deployment", () => {
    expect(() => new URL(m.start_url!)).not.toThrow();
    expect(new URL(m.start_url!).pathname).toBe("/home");
  });

  test("declares 192 and 512 icons plus a maskable variant", () => {
    const icons = m.icons ?? [];
    const sizes = new Set(icons.map((i) => i.sizes));
    expect(sizes.has("192x192")).toBe(true);
    expect(sizes.has("512x512")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  test("every icon file exists in public/ at the declared size", () => {
    for (const icon of m.icons ?? []) {
      const name = icon.src.replace(/^\//, "");
      expect(existsSync(join(PUBLIC_DIR, name))).toBe(true);
      if (icon.type === "image/png") {
        const [w, h] = icon.sizes!.split("x").map(Number);
        expect(pngSize(name)).toEqual({ width: w, height: h });
      }
    }
  });
});

describe("web app share-preview assets", () => {
  test("og-image.png is the 1200x630 size declared in the root layout", () => {
    expect(pngSize("og-image.png")).toEqual({ width: 1200, height: 630 });
  });

  test("apple-touch-icon.png is the 180x180 iOS home-screen size", () => {
    expect(pngSize("apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });

  test("the root layout points metadata at assets that exist", () => {
    // Read rather than import: layout.tsx pulls in next/font and the whole
    // provider tree, none of which can load outside a Next render.
    const layout = readFileSync(join(import.meta.dir, "../layout.tsx"), "utf8");

    // metadataBase is what makes the relative og:image below absolute.
    expect(layout).toContain("metadataBase: new URL(resolveSiteUrl())");
    expect(layout).toContain('manifest: "/manifest.webmanifest"');

    // Assets resolve from public/, except favicon.ico, which Next serves from
    // the app directory by convention.
    const served = (name: string) =>
      existsSync(join(PUBLIC_DIR, name)) || existsSync(join(import.meta.dir, "..", name));

    const referenced = [
      ...[...layout.matchAll(/url: "\/([\w.-]+)"/g)].map((m) => m[1]),
      ...[...layout.matchAll(/images: \["\/([\w.-]+)"\]/g)].map((m) => m[1]),
    ];
    expect(referenced).toContain("og-image.png");
    for (const name of referenced) {
      expect(served(name)).toBe(true);
    }
  });
});
