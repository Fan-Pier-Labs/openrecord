/**
 * `version.json` is the file every shipped client reads to find out it is
 * behind, and both of its failure modes are silent.
 *
 * If it is stale, everyone is told they are up to date forever. If it is
 * malformed, every client's parser rejects it and the check goes quiet — which
 * looks exactly the same as "no update available". Neither shows up on the
 * site, so neither shows up in a browser check before a deploy.
 *
 * So: the committed file is compared against a fresh generation (a version bump
 * that forgets to regenerate fails the build), and it is validated with the
 * *reader's own* parser rather than a restatement of the rules here.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  VERSION_MANIFEST_URL,
  VERSION_TARGETS,
  parseVersionManifest,
} from "../../scrapers/metadata/version";
import {
  renderVersionManifest,
  writeVersionManifest,
  VERSION_MANIFEST_PATH,
} from "../generate-version";

const SPLASH_DIR = join(import.meta.dir, "..");
const deployScript = readFileSync(join(SPLASH_DIR, "deploy.sh"), "utf8");
const committed = readFileSync(VERSION_MANIFEST_PATH, "utf8");

describe("version.json", () => {
  test("matches a fresh generation — regenerate it in the same PR as a version bump", () => {
    // `bun run version:manifest`
    expect(committed).toBe(renderVersionManifest());
  });

  test("the generator writes exactly what is committed", () => {
    const scratch = join(mkdtempSync(join(tmpdir(), "openrecord-version-")), "version.json");
    expect(writeVersionManifest(scratch)).toBe(committed);
    expect(readFileSync(scratch, "utf8")).toBe(committed);
  });

  test("is what the client-side parser accepts", () => {
    expect(parseVersionManifest(JSON.parse(committed))).not.toBeNull();
  });

  test("states a real version for every target, none of them 0.0.0", () => {
    const manifest = parseVersionManifest(JSON.parse(committed))!;
    for (const target of VERSION_TARGETS) {
      expect(manifest.versions[target]).toMatch(/^\d+\.\d+\.\d+/);
      expect(manifest.versions[target]).not.toBe("0.0.0");
      expect(manifest.updateUrls[target]).toMatch(/^https:\/\//);
    }
  });

  test("carries the versions the packages actually ship", () => {
    const manifest = parseVersionManifest(JSON.parse(committed))!;
    const pkgVersion = (relative: string) =>
      (JSON.parse(readFileSync(join(SPLASH_DIR, "..", relative), "utf8")) as { version: string })
        .version;

    expect(manifest.versions.scrapers).toBe(pkgVersion("scrapers/package.json"));
    expect(manifest.versions.cli).toBe(pkgVersion("npm-package/package.json"));
    expect(manifest.versions.mcpb).toBe(pkgVersion("claude-desktop-extension/manifest.json"));
    expect(manifest.versions.app).toBe(pkgVersion("expo-app/package.json"));
  });
});

describe("deploy ships it at the URL the clients poll", () => {
  test("the reader's URL is this site's own origin", () => {
    expect(VERSION_MANIFEST_URL).toBe("https://openrecord.fanpierlabs.com/version.json");
  });

  test("regenerates before uploading, so a deploy cannot ship a stale manifest", () => {
    expect(deployScript).toContain("generate-version.ts");
  });

  test("uploads it to the bucket root", () => {
    expect(deployScript).toMatch(/upload_built .*version\.json" "version\.json"/);
  });

  test("invalidates it — a day-long cache would hide a release", () => {
    expect(deployScript).toContain('"/version.json"');
  });

  test("gives it a short TTL, not the checked-in-asset one", () => {
    const line = deployScript.split("\n").find((l) => l.includes('"version.json"'));
    expect(line).toContain("max-age=300");
  });
});
