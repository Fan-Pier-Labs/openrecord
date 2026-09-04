/**
 * Installing the git hook, and saying what is still missing.
 *
 * The hook goes into the git common directory rather than behind a committed
 * `core.hooksPath`, because this repo already points every worktree at
 * `.git/hooks` and one install should cover all of them. The file written there
 * is a shim; the rules it runs stay in the working tree, under review.
 *
 *   bun tools/pii-guard/install.ts
 */

import { chmodSync, copyFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { runGit, type GitResult } from './git';

export interface InstallResult {
  installed: boolean;
  hookPath: string;
  /** Set when an unrelated pre-commit hook is already in place. */
  conflict: string | null;
}

/** Marker used to recognise a hook this installer wrote, across versions. */
const SIGNATURE = 'PII guard';

export function installHook(sourceHook: string, gitCommonDir: string): InstallResult {
  const hookPath = join(gitCommonDir, 'hooks', 'pre-commit');
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf8');
    if (!existing.includes(SIGNATURE)) {
      return { installed: false, hookPath, conflict: existing.split('\n').slice(0, 3).join('\n') };
    }
  }
  mkdirSync(dirname(hookPath), { recursive: true });
  copyFileSync(sourceHook, hookPath);
  chmodSync(hookPath, 0o755);
  return { installed: true, hookPath, conflict: null };
}

/**
 * What to tell someone who has just installed the hook.
 *
 * Split out from the entry point because the important half is the case where
 * there is no denylist yet: the guard is installed, it looks like it is
 * working, and it is silently missing the leak it was built for. That deserves
 * a paragraph rather than a line, and a paragraph deserves a test.
 */
export function nextSteps(denylistPath: string, denylistExists: boolean): string[] {
  if (denylistExists) return [`pii-guard: using the denylist at ${denylistPath}`];
  return [
    '',
    'pii-guard: no denylist yet, so only the shape-based rules will run.',
    'Those catch a value that still looks like itself. They cannot catch a value that has',
    'been partly redacted — `r***@your-domain.com`, `617-***-**34` — which is the leak this',
    'guard was built for, and which needs a local list of your real values to recognise.',
    '',
    '  cp tools/pii-guard/denylist.example.txt "$(git rev-parse --git-common-dir)/pii-denylist.txt"',
    '  $EDITOR "$(git rev-parse --git-common-dir)/pii-denylist.txt"',
    '',
    'That file holds real values, so it lives inside .git, where it cannot be committed.',
    'Nothing but this tool ever reads it, and nothing ever prints what it matched.',
  ];
}

export interface InstallIo {
  git: (args: string[]) => GitResult;
  log: (line: string) => void;
}

export function logLine(line: string): void {
  console.log(line);
}

export function runInstall(io: InstallIo): number {
  const text = (args: string[]): string | null => {
    const result = io.git(args);
    return result.ok ? result.stdout.trim() : null;
  };
  const root = text(['rev-parse', '--show-toplevel']);
  const commonDir = text(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (root === null || commonDir === null) {
    io.log('pii-guard: not inside a git repository');
    return 2;
  }

  const result = installHook(join(root, 'tools', 'pii-guard', 'hooks', 'pre-commit'), commonDir);
  if (result.conflict !== null) {
    io.log(`pii-guard: ${result.hookPath} already exists and is not ours. Leaving it alone; it starts:`);
    io.log(result.conflict);
    io.log('pii-guard: merge the two by hand, or move yours aside and re-run.');
    return 1;
  }

  io.log(`pii-guard: installed ${result.hookPath}`);
  const denylist = join(commonDir, 'pii-denylist.txt');
  for (const line of nextSteps(denylist, existsSync(denylist))) io.log(line);
  return 0;
}

if (import.meta.main) {
  process.exitCode = runInstall({ git: runGit, log: logLine });
}
