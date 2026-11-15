// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from "bun:test";

import { extractFileIds, safeFileName } from "../lib/files/file-tokens";
import { capToolResult, MAX_TOOL_RESULT_CHARS } from "../lib/ai/result-size";

describe("safeFileName", () => {
  it("keeps a name that has an extension", () => {
    expect(safeFileName("lab-history.csv")).toBe("lab-history.csv");
  });

  it("saves a bare name as Markdown, like the desktop extension", () => {
    expect(safeFileName("summary")).toBe("summary.md");
  });

  it("cannot be steered into another folder", () => {
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd.md");
    expect(safeFileName("a\\b:c.txt")).toBe("a_b_c.txt");
  });

  it("names an empty or dot-only file rather than writing a hidden one", () => {
    expect(safeFileName("   ")).toBe("openrecord-export.md");
    expect(safeFileName("..")).toBe("openrecord-export.md");
  });
});

describe("extractFileIds", () => {
  it("finds every token, in order, and ignores image tokens", () => {
    expect(extractFileIds("Here:\n[file:file_1_ab]\n[image:img_2]\nand [file:file_3_cd]")).toEqual([
      "file_1_ab",
      "file_3_cd",
    ]);
  });
});

describe("capToolResult", () => {
  it("passes a result at the limit through untouched", () => {
    const result = "x".repeat(MAX_TOOL_RESULT_CHARS);
    expect(capToolResult("get_labs", result)).toBe(result);
  });

  it("replaces an oversized result with an error asking the model to narrow the call", () => {
    const capped = JSON.parse(capToolResult("get_hospital_info", "x".repeat(MAX_TOOL_RESULT_CHARS + 1))) as {
      error: string;
    };
    expect(capped.error).toContain("get_hospital_info");
    expect(capped.error).toContain("narrowed");
  });
});
