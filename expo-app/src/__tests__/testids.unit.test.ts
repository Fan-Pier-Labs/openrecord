/// <reference types="bun" />
// ^ These run under `bun test`, not in the app: the reference pulls in
// bun:test module declarations without adding Bun globals to the app config.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// CLAUDE.md: every interactive element in the Expo app must carry a stable
// testID so maestro-cli can target it deterministically. This test scans the
// UI source and fails on any interactive JSX element without one, so a PR
// that adds untargetable UI fails CI instead of relying on review to catch it.

const SRC_ROOT = join(import.meta.dir, "..");
const UI_DIRS = ["app", "components"];
const INTERACTIVE = ["Pressable", "TouchableOpacity", "TextInput", "Switch", "Button"];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

type Tag = { file: string; line: number; component: string; text: string };

// Pulls every JSX opening tag for the interactive components out of a source
// file. A tag ends at the first `>` that sits outside every brace expression
// and string literal (so arrow functions and template literals in props don't
// terminate it early).
function extractInteractiveTags(file: string, source: string): Tag[] {
  const tags: Tag[] = [];
  const open = new RegExp(`<(${INTERACTIVE.join("|")})(?=[\\s/>])`, "g");
  for (const match of source.matchAll(open)) {
    const start = match.index;
    // Skip type positions like useRef<TextInput>(null): JSX `<` follows
    // whitespace or an opening bracket, never an identifier character.
    const before = source[start - 1];
    if (before !== undefined && /[A-Z0-9_$]/i.test(before)) continue;

    let depth = 0;
    let quote: string | null = null;
    let end = -1;
    for (let i = start + 1; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === "\\") i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0 && source[i - 1] !== "=") {
        end = i;
        break;
      }
    }
    expect(end).toBeGreaterThan(start); // unterminated tag means the scanner broke
    const line = source.slice(0, start).split("\n").length;
    tags.push({ file, line, component: match[1]!, text: source.slice(start, end + 1) });
  }
  return tags;
}

const allTags = UI_DIRS.flatMap((dir) =>
  tsxFiles(join(SRC_ROOT, dir)).flatMap((file) =>
    extractInteractiveTags(file.slice(SRC_ROOT.length + 1), readFileSync(file, "utf8")),
  ),
);

describe("expo-app testID coverage", () => {
  test("scanner finds the UI it is supposed to guard", () => {
    expect(allTags.length).toBeGreaterThan(30);
    const chatInput = allTags.find((t) => t.file.endsWith("ChatInput.tsx") && t.component === "TextInput");
    expect(chatInput?.text).toContain('testID="chat-input"');
  });

  test("every interactive element carries a testID", () => {
    const missing = allTags.filter((t) => !/\btestID\s*=/.test(t.text));
    const report = missing.map((t) => `${t.file}:${t.line} <${t.component}>`).join("\n");
    expect(report).toBe("");
  });
});
