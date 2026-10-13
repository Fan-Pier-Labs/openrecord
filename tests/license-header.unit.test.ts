// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const NOTICE = "Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.";

// Not ours to license: the eUnity viewer bundles pulled from MyChart, the
// response skeletons captured from live MyChart instances, and Next's generated
// type stub (rewritten on every build).
const NOT_OURS = [
  /^scrapers\/myChart\/clo-image-parser\/files-pulled-from-mychart\//,
  /^fake-mychart\/src\/data\/realShapes\.ts$/,
  /^fake-mychart\/next-env\.d\.ts$/,
];

test("every source file we wrote carries the license header", () => {
  const files = Bun.spawnSync(["git", "ls-files", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.css", "*.sh", "*.py"], { cwd: REPO_ROOT })
    .stdout.toString()
    .split("\n")
    .filter((f) => f && !NOT_OURS.some((re) => re.test(f)));

  expect(files.length).toBeGreaterThan(500);
  // First two lines, so a shebang can stay on line 1.
  const missing = files.filter((f) => !readFileSync(join(REPO_ROOT, f), "utf8").split("\n", 2).some((l) => l.includes(NOTICE)));
  expect(missing).toEqual([]);
});
