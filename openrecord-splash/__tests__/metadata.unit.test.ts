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
    `<meta\\s+${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+content="([^"]*)"`,
    "g",
  );
  return [...head.matchAll(pattern)].map((m) => m[1]!);
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

  test("ships the privacy policy the splash page links to", () => {
    expect(html).toContain('href="/privacy.html"');
    expect(deployScript).toContain("privacy.html");
    expect(deployScript).toContain('"/privacy.html"');
  });

  test("ships the terms of service the splash page links to", () => {
    expect(html).toContain('href="/terms.html"');
    expect(deployScript).toContain("terms.html");
    expect(deployScript).toContain('"/terms.html"');
  });
});

/**
 * The privacy copy is a factual claim about what the code does, and it is the
 * kind of claim that rots silently: the page keeps rendering perfectly while
 * saying something that stopped being true.
 *
 * Each assertion below names a claim we made once and could not back up.
 * If a claim here has to change, change the software first.
 */
describe("privacy claims match what the software actually does", () => {
  const privacy = readFileSync(join(SPLASH_DIR, "privacy.html"), "utf8");

  test("claims no encryption at rest that the desktop clients do not do", () => {
    // The MCPB and the CLI write credentials to plain files (mode 0600). Until
    // they use the OS keychain, the page may not say otherwise.
    expect(html).not.toContain("We encrypt all MyChart credentials at rest");
    expect(html).not.toContain("End-to-end encryption");
  });

  test("does not claim health data never leaves the device, because AI calls do", () => {
    expect(html).not.toContain("Zero intermediary servers");
    expect(html).not.toContain("never leaves your trusted environment");
  });

  test("discloses the AI carve-out on the splash page itself", () => {
    expect(html).toContain("One exception: AI calls");
    // Naming the actual recipient is the point — "a third party" is not a
    // disclosure.
    expect(html).toContain("Gemini");
  });

  test("does not advertise the OpenClaw plugin, which no longer exists", () => {
    // Naming OpenClaw as one of the MCP clients that can connect is fine and
    // still true. Presenting a plugin we deleted as a shipping product is not.
    expect(html).not.toContain("OpenClaw Plugin");
  });

  test("the policy names the recipient, the metering, and the missing BAA", () => {
    expect(privacy).toContain("Gemini");
    expect(privacy).toContain("business associate agreement");
    // The proxy logs metadata only; saying so is worth nothing if the page
    // stops saying it while the logging changes.
    expect(privacy).toContain("does not log the contents of your prompt");
  });

  test("the policy is reachable and dated", () => {
    expect(privacy).toContain("Last updated");
    expect(privacy).toContain('href="/"');
  });
});

/**
 * The terms carry the promises we cannot quietly drop: the medical-device
 * disclaimer the app stores and the FDA line depend on, the authorization rule
 * that keeps proxy access lawful, and the Apple clauses App Review checks for.
 */
describe("terms of service", () => {
  const terms = readFileSync(join(SPLASH_DIR, "terms.html"), "utf8");
  // The prose is hard-wrapped, so a clause can straddle a newline. Claims are
  // matched against the collapsed text; markup is matched against the raw file.
  const prose = terms.replace(/\s+/g, " ");

  test("is reachable and dated", () => {
    expect(terms).toContain("Last updated");
    expect(terms).toContain('href="/"');
    expect(terms).toContain('href="/privacy.html"');
  });

  test("disclaims medical-device status and medical advice", () => {
    expect(prose).toContain("not a medical device");
    expect(prose).toContain("FDA");
    expect(prose).toContain("911");
  });

  test("states the only-records-you-are-entitled-to rule", () => {
    expect(prose).toContain("proxy access");
    expect(prose).toContain("Epic Systems Corporation");
  });

  test("carries the App Store clauses Apple requires of a custom EULA", () => {
    expect(prose).toContain("third-party beneficiaries of these terms");
    expect(prose).toContain("Apple has no obligation to provide any maintenance");
  });

  test("points at the source-available license rather than restating it", () => {
    // The repository LICENSE is the operative grant. If the page ever claims to
    // grant more than it does, the two documents disagree in production.
    expect(prose).toContain("Source-Available License");
    expect(prose).toContain("nothing in these terms grants you more than it does");
  });
});
