// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// Dependency-free so bun unit tests can import it; file-store.ts does the I/O.

/** The desktop extension's rule: a bare name is saved as Markdown. No folders. */
export function safeFileName(name: string): string {
  const base = name.replace(/[/\\:\0]/g, "_").replace(/^\.+/, "").trim() || "openrecord-export";
  return /\.[A-Za-z0-9]{1,8}$/.test(base) ? base : `${base}.md`;
}

/** `[file:...]` refs in an assistant answer, in order. */
export function extractFileIds(text: string): string[] {
  return [...text.matchAll(/\[file:([a-zA-Z0-9_-]+)\]/g)].map((m) => m[1]!);
}
