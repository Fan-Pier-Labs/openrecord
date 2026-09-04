/**
 * The one place this tool shells out.
 *
 * Kept apart from the CLI so that both entry points — the scanner and the
 * installer — share a single definition of "run git and tell me whether it
 * worked", and so that the rest of the guard can be driven in tests with a
 * function that never touches a process.
 */

export interface GitResult {
  ok: boolean;
  stdout: string;
}

export function runGit(args: string[]): GitResult {
  const result = Bun.spawnSync(['git', ...args], { stdout: 'pipe', stderr: 'pipe' });
  return { ok: result.exitCode === 0, stdout: result.stdout.toString() };
}
