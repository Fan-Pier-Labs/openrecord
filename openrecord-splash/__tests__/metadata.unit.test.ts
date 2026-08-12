/**
 * Guards the splash page's link-preview metadata, PWA manifest, and the deploy
 * script that ships them.
 *
 * These are the things that silently break: an og:image that never made it to
 * S3, a manifest icon whose file was renamed, dimensions that stopped matching
 * the actual PNG after a regen. All of it is static, so all of it is checkable.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SPLASH_DIR = join(import.meta.dir, "..");
const SITE_ORIGIN = "https://openrecord.fanpierlabs.com";

const html = readFileSync(join(SPLASH_DIR, "index.html"), "utf8");
const head = html.slice(0, html.indexOf("</head>"));
const deployScript = readFileSync(join(SPLASH_DIR, "deploy.sh"), "utf8");
const manifest = JSON.parse(readFileSync(join(SPLASH_DIR, "manifest.json"), "utf8"));

/** Reads width/height out of a PNG's IHDR chunk (bytes 16..24). */
function pngSize(relativePath: string): { width: number; height: number } {
  const buf = readFileSync(join(SPLASH_DIR, relativePath));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** All `content` values for a given og/twitter meta property in <head>. */
function metaContents(attr: "property" | "name", key: string): string[] {
  const pattern = new RegExp(
    `<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"\\s+content="([^"]*)"`,
    "g",
  );
  return [...head.matchAll(pattern)].map((m) => m[1]);
}

function meta(attr: "property" | "name", key: string): string | undefined {
  return metaContents(attr, key)[0];
}

describe("splash link preview (Open Graph / Twitter)", () => {
  test("declares an absolute og:image — relative paths do not resolve in iMessage or Slack", () => {
    const image = meta("property", "og:image");
    expect(image).toBe(`${SITE_ORIGIN}/og-image.png`);
    expect(meta("property", "og:image:secure_url")).toBe(image);
    expect(meta("name", "twitter:image")).toBe(image);
  });

  test("og:image dimensions match the actual PNG", () => {
    const { width, height } = pngSize("og-image.png");
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
    expect(meta("property", "og:image:width")).toBe(String(width));
    expect(meta("property", "og:image:height")).toBe(String(height));
    expect(meta("property", "og:image:type")).toBe("image/png");
  });

  test("carries the title, description, url, and card type crawlers read", () => {
    expect(meta("property", "og:title")).toContain("OpenRecord");
    expect(meta("property", "og:description")).toBeTruthy();
    expect(meta("property", "og:type")).toBe("website");
    expect(meta("property", "og:url")).toBe(`${SITE_ORIGIN}/`);
    expect(meta("property", "og:site_name")).toBe("OpenRecord");
    expect(meta("name", "twitter:card")).toBe("summary_large_image");
    expect(meta("property", "og:image:alt")).toBeTruthy();
  });

  test("every og:image URL is https — iMessage drops http images on https pages", () => {
    for (const url of [
      ...metaContents("property", "og:image"),
      ...metaContents("property", "og:image:secure_url"),
      ...metaContents("name", "twitter:image"),
    ]) {
      expect(url.startsWith("https://")).toBe(true);
    }
  });
});

describe("splash icons and manifest", () => {
  test("head links the manifest, favicon, and apple-touch-icon", () => {
    expect(head).toContain('rel="manifest" href="/manifest.json"');
    expect(head).toContain('rel="icon" href="/favicon.ico"');
    expect(head).toContain('rel="icon" href="/icon.svg"');
    expect(head).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
  });

  test("apple-touch-icon is the 180x180 iOS home-screen size", () => {
    expect(pngSize("apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
  });

  test("manifest has the fields an installable PWA needs", () => {
    expect(manifest.name).toContain("OpenRecord");
    expect(manifest.short_name).toBe("OpenRecord");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("manifest declares 192 and 512 icons, and each file exists at that size", () => {
    const pngIcons = manifest.icons.filter((i: { type: string }) => i.type === "image/png");
    const sizes = new Set(pngIcons.map((i: { sizes: string }) => i.sizes));
    expect(sizes.has("192x192")).toBe(true);
    expect(sizes.has("512x512")).toBe(true);

    for (const icon of pngIcons) {
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(icon.src.replace(/^\//, ""))).toEqual({ width: w, height: h });
    }
  });

  test("declares a maskable icon so Android does not letterbox it", () => {
    const purposes = manifest.icons.map((i: { purpose?: string }) => i.purpose);
    expect(purposes).toContain("maskable");
  });

  test("theme-color meta matches the manifest", () => {
    expect(meta("name", "theme-color")).toBe(manifest.theme_color);
  });
});

describe("deploy script ships every referenced asset", () => {
  // Assets referenced from <head> as absolute site paths, plus the manifest's
  // own icon list. If a file is referenced but never uploaded, the preview
  // breaks in production while looking fine locally.
  const referenced = new Set<string>([
    "og-image.png",
    "manifest.json",
    ...[...head.matchAll(/href="\/([\w.-]+\.(?:png|svg|ico|json))"/g)].map((m) => m[1]),
    ...manifest.icons.map((i: { src: string }) => i.src.replace(/^\//, "")),
  ]);

  test("uploads each one", () => {
    for (const file of referenced) {
      expect(deployScript).toContain(`upload ${file}`);
    }
  });

  test("invalidates each one in CloudFront", () => {
    for (const file of referenced) {
      expect(deployScript).toContain(`"/${file}"`);
    }
  });

  test("serves the manifest with the correct content type", () => {
    expect(deployScript).toMatch(/upload manifest\.json\s+"application\/manifest\+json"/);
    expect(deployScript).toMatch(/upload icon\.svg\s+"image\/svg\+xml"/);
  });
});
