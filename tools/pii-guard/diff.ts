/**
 * Reducing a unified diff to the lines that are actually new.
 *
 * Only added lines are scanned. Context and removed lines are already in the
 * history — reporting them would fail every commit that happens to touch a file
 * near an old finding, which is the fastest way to teach someone `--no-verify`.
 * Cleaning up what is already committed is a different job, and the `pii-scan`
 * skill is the tool for it.
 *
 * Line numbers come from the hunk headers so a finding points at the file as it
 * will exist after the commit, which is where the reader has to go to delete it.
 */

import type { ParsedDiff, AddedLine } from './types';

/** Undo git's C-style quoting of paths with unusual bytes in them. */
function unquotePath(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  const body = raw.slice(1, -1);
  return body.replace(/\\(?:([\\"])|([0-7]{3}))/g, (_all, literal: string | undefined, octal: string | undefined) =>
    literal ?? String.fromCharCode(Number.parseInt(octal ?? '0', 8)));
}

/** Strip the `b/` prefix git puts on the post-image path. */
function postImagePath(raw: string): string | null {
  const path = unquotePath(raw.trim());
  if (path === '/dev/null') return null;
  return path.startsWith('b/') ? path.slice(2) : path;
}

export function parseUnifiedDiff(diff: string): ParsedDiff {
  const added: AddedLine[] = [];
  const binaryFiles: string[] = [];

  let file: string | null = null;
  /** Path from the `diff --git` header, used when a binary file has no `+++`. */
  let headerPath: string | null = null;
  let lineNumber = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      // `diff --git a/x b/x` — take the second path, which is the post-image.
      const match = /^diff --git (?:"?a\/.*?"?) ("?b\/.*"?)$/.exec(raw);
      headerPath = match?.[1] === undefined ? null : postImagePath(match[1]);
      file = null;
      continue;
    }
    if (raw.startsWith('+++ ')) {
      file = postImagePath(raw.slice(4));
      continue;
    }
    if (raw.startsWith('Binary files ') || raw.startsWith('GIT binary patch')) {
      const path = file ?? headerPath;
      if (path !== null && !binaryFiles.includes(path)) binaryFiles.push(path);
      continue;
    }
    if (raw.startsWith('@@')) {
      // `@@ -old,count +new,count @@` — the post-image start is what we number
      // from, and it counts every added and context line in the hunk.
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      lineNumber = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
      continue;
    }
    if (file === null || lineNumber === 0) continue;

    if (raw.startsWith('+')) {
      added.push({ file, line: lineNumber, text: raw.slice(1) });
      lineNumber += 1;
    } else if (raw.startsWith('-') || raw.startsWith('\\')) {
      // A removed line occupies no space in the post-image, and `\ No newline`
      // is a note about the previous line rather than a line of its own.
      continue;
    } else if (raw.startsWith(' ') || raw.length === 0) {
      lineNumber += 1;
    }
  }

  return { added, binaryFiles };
}
