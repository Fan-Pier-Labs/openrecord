// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * The agent loop appends every tool result to the conversation and resends it
 * through the AI proxy on every turn, so one oversized result (a health
 * system's full provider directory runs to megabytes) breaks the chat. Past
 * this many characters the model gets an error asking it to narrow the call.
 * Dependency-free so bun unit tests can import it.
 */
export const MAX_TOOL_RESULT_CHARS = 200_000;

export function capToolResult(toolName: string, result: string): string {
  if (result.length <= MAX_TOOL_RESULT_CHARS) return result;
  return JSON.stringify({
    error:
      `${toolName} returned ${result.length.toLocaleString("en-US")} characters, more than this app can pass on ` +
      `(${MAX_TOOL_RESULT_CHARS.toLocaleString("en-US")}). Call it again narrowed down — fewer items, a filter, ` +
      "or a concise mode — and tell the user if it cannot be narrowed.",
  });
}
