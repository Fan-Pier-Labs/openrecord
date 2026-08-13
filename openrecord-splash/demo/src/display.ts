/** Small formatting helpers shared by both surfaces and the activity panel. */

import type { ToolArgs, ToolResult } from './types';

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

export type ResultSummary = { ok: boolean; label: string };

/** Human-readable size and shape of a tool result. */
export function describeResult(result: ToolResult): ResultSummary {
  if (result && typeof result === 'object' && 'error' in result) return { ok: false, label: 'error' };

  const size = JSON.stringify(result ?? null).length;
  if (Array.isArray(result)) return { ok: true, label: `${result.length} items · ${formatBytes(size)}` };

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    for (const key of ['results', 'conversations', 'visits']) {
      const value = record[key];
      if (Array.isArray(value)) return { ok: true, label: `${value.length} items · ${formatBytes(size)}` };
    }
    if (record.success) return { ok: true, label: `ok · ${formatBytes(size)}` };
  }

  return { ok: true, label: formatBytes(size) };
}

/** The error message from a failed tool result, if there is one. */
export function resultError(result: ToolResult): string | null {
  if (result && typeof result === 'object' && 'error' in result) {
    return String((result).error);
  }
  return null;
}

/** Compact `key: value` preview of tool args for the activity log. */
export function summarizeArgs(args: ToolArgs): string {
  return Object.entries(args ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const value = typeof v === 'string' && v.length > 28 ? `${v.slice(0, 28)}…` : String(v);
      return `${k}: ${value}`;
    })
    .join(' · ');
}

export function truncateJson(value: unknown, max = 2400): string {
  const json = JSON.stringify(value, null, 2) ?? 'null';
  return json.length > max ? `${json.slice(0, max)}\n… truncated` : json;
}
