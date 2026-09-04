/// <reference types="bun" />
// ^ These run under `bun test`, not in the app: the reference pulls in
// bun:test module declarations without adding Bun globals to the app config.
import { describe, expect, test } from "bun:test";
import {
  TOOLS,
  WRITE_TOOL_META,
  WRITE_TOOLS,
  RESPOND_TOOL,
  isExclusiveTool,
} from "../tool-catalog";

describe("tool catalog", () => {
  test("tool names are unique", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("every write tool is declared in the prompt-side tool list", () => {
    // A write tool the model can't see is dead code; one missing from
    // WRITE_TOOL_META would execute without a confirmation dialog.
    const declared = new Set(TOOLS.map((t) => t.name));
    for (const name of WRITE_TOOLS) {
      expect(declared.has(name)).toBe(true);
    }
  });

  test("proxy tools are declared", () => {
    const list = TOOLS.find((t) => t.name === "list_proxy_targets");
    expect(list).toBeDefined();

    const switchTool = TOOLS.find((t) => t.name === "switch_proxy_target");
    expect(switchTool).toBeDefined();
    expect(Object.keys(switchTool!.args)).toContain("patient");
  });

  test("switch_proxy_target is a confirmed, exclusive write; list_proxy_targets is a plain read", () => {
    expect(WRITE_TOOLS.has("switch_proxy_target")).toBe(true);
    expect(isExclusiveTool("switch_proxy_target")).toBe(true);
    expect(WRITE_TOOL_META.switch_proxy_target!.confirmLabel).toBe("Switch");

    expect(WRITE_TOOLS.has("list_proxy_targets")).toBe(false);
    expect(isExclusiveTool("list_proxy_targets")).toBe(false);
  });

  test("the pre-existing write tools kept their confirmation gating", () => {
    for (const name of ["send_message", "send_reply", "delete_message"]) {
      expect(WRITE_TOOLS.has(name)).toBe(true);
      expect(isExclusiveTool(name)).toBe(true);
      expect(WRITE_TOOL_META[name]!.title.length).toBeGreaterThan(0);
    }
  });

  test("a write with no scraper is not confirmation-gated", () => {
    // `request_refill` is declared and deliberately not implemented: running it
    // reads nothing and changes nothing, so there is nothing to confirm.
    // Prompting anyway spends the one moment a patient is paying attention on a
    // no-op.
    expect(WRITE_TOOLS.has("request_refill")).toBe(false);
    expect(isExclusiveTool("request_refill")).toBe(false);
    expect(WRITE_TOOL_META.request_refill).toBeUndefined();
  });

  test("respond is exclusive but not a write", () => {
    expect(isExclusiveTool(RESPOND_TOOL)).toBe(true);
    expect(WRITE_TOOLS.has(RESPOND_TOOL)).toBe(false);
  });
});
