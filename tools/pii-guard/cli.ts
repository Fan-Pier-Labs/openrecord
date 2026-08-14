/**
 * The one entry point every surface goes through.
 *
 *   .git/hooks/pre-commit   →  --staged
 *   Claude Code PreToolUse  →  --claude-hook
 *   CI, by hand             →  --range origin/main...HEAD
 *
 * Everything the CLI needs from the outside world arrives in {@link CliDeps},
 * so the whole thing — including the git plumbing and the hook protocol — is
 * exercised in-process by the unit suite rather than by shelling out to itself.
 */

import { loadConfig, type GuardConfig } from './config';
import { runGit, type GitResult } from './git';
import { planForCommand, type DiffSource } from './command';
import { denyReason, blocking, formatReport } from './report';
import { scanDiff, scanText } from './scan';
import type { Finding, ScanOptions } from './types';

export interface CliDeps {
  git: (args: string[]) => GitResult;
  readStdin: () => Promise<string>;
  write: (text: string) => void;
  writeError: (text: string) => void;
}

const USAGE = `pii-guard — refuse to commit or publish real personal data

  bun tools/pii-guard/cli.ts [mode] [--json]

Modes
  --staged            scan the staged diff (default; what the pre-commit hook runs)
  --worktree          scan tracked, uncommitted changes
  --branch            scan this branch against its merge-base with the default branch
  --range <expr>      scan an explicit diff range, e.g. origin/main...HEAD
  --diff-stdin        scan a unified diff on stdin
  --text <string>     scan a literal string (a commit message, a PR body)
  --text-stdin        scan stdin as prose
  --claude-hook       read a Claude Code PreToolUse payload on stdin and answer it

Installing the git hook is a separate script: bun tools/pii-guard/install.ts

Exit codes
  0  clean (warnings may still have been printed)
  1  blocking findings
  2  the guard could not run — treated as a failure on purpose
`;

/** Candidate default branches, most authoritative first. */
const DEFAULT_BRANCHES = ['origin/main', 'origin/master', 'main', 'master'];

function diffArgs(source: DiffSource, deps: CliDeps): string[] | null {
  switch (source) {
    case 'staged':
      return ['diff', '--cached', '--no-color', '--no-ext-diff', '-M', '-U0'];
    case 'worktree':
      return ['diff', '--no-color', '--no-ext-diff', '-M', '-U0', 'HEAD'];
    case 'branch': {
      for (const branch of DEFAULT_BRANCHES) {
        const base = deps.git(['merge-base', branch, 'HEAD']);
        if (base.ok && base.stdout.trim().length > 0) {
          return ['diff', '--no-color', '--no-ext-diff', '-M', '-U0', `${base.stdout.trim()}..HEAD`];
        }
      }
      return null;
    }
  }
}

function collectDiffFindings(
  sources: DiffSource[],
  options: ScanOptions,
  deps: CliDeps,
): { findings: Finding[]; notes: string[] } {
  const findings: Finding[] = [];
  const notes: string[] = [];
  for (const source of sources) {
    const args = diffArgs(source, deps);
    if (args === null) {
      notes.push(`could not work out a ${source} range (no default branch found) — that part went unscanned`);
      continue;
    }
    const result = deps.git(args);
    if (!result.ok) {
      notes.push(`git ${args.join(' ')} failed — that part went unscanned`);
      continue;
    }
    findings.push(...scanDiff(result.stdout, options));
  }
  return { findings, notes };
}

/** Deduplicate findings that two sources both reported. */
function unique(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.file}:${finding.line}:${finding.rule}:${finding.preview}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface Mode {
  kind: 'diff' | 'text' | 'claude-hook' | 'help';
  sources: DiffSource[];
  range?: string;
  text?: string;
  fromStdin?: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): Mode | { error: string } {
  const mode: Mode = { kind: 'diff', sources: ['staged'], json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--staged': mode.sources = ['staged']; break;
      case '--worktree': mode.sources = ['worktree']; break;
      case '--branch': mode.sources = ['branch']; break;
      case '--json': mode.json = true; break;
      case '--claude-hook': mode.kind = 'claude-hook'; break;
      case '--help':
      case '-h': mode.kind = 'help'; break;
      case '--diff-stdin': mode.kind = 'diff'; mode.sources = []; mode.fromStdin = true; break;
      case '--text-stdin': mode.kind = 'text'; mode.fromStdin = true; break;
      case '--range': {
        const value = argv[++i];
        if (value === undefined) return { error: '--range needs a value' };
        mode.sources = [];
        mode.range = value;
        break;
      }
      case '--text': {
        const value = argv[++i];
        if (value === undefined) return { error: '--text needs a value' };
        mode.kind = 'text';
        mode.text = value;
        break;
      }
      default:
        return { error: `unknown argument "${arg ?? ''}"` };
    }
  }
  return mode;
}

/**
 * Locate the repository.
 *
 * `--git-common-dir` rather than `--git-dir`: in a worktree the latter is the
 * worktree's private directory, and the denylist has to be shared by all of
 * them or it exists in one checkout and not the next.
 */
function locateRepo(deps: CliDeps): { root: string; commonDir: string | null } | null {
  const root = deps.git(['rev-parse', '--show-toplevel']);
  if (!root.ok) return null;
  const common = deps.git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return {
    root: root.stdout.trim(),
    commonDir: common.ok ? common.stdout.trim() : null,
  };
}

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const mode = parseArgs(argv);
  if ('error' in mode) {
    deps.writeError(`pii-guard: ${mode.error}\n\n${USAGE}`);
    return 2;
  }
  if (mode.kind === 'help') {
    deps.write(USAGE);
    return 0;
  }

  const repo = locateRepo(deps);
  if (repo === null) {
    deps.writeError('pii-guard: not inside a git repository');
    return 2;
  }
  const config = loadConfig(repo.root, repo.commonDir);
  if (config.problems.length > 0) {
    deps.writeError(`pii-guard: problems in ${config.denylistPath ?? 'the denylist'}:\n  ${config.problems.join('\n  ')}`);
  }

  if (mode.kind === 'claude-hook') {
    return runClaudeHook(config, deps);
  }

  const findings: Finding[] = [];
  const notes: string[] = [];

  if (mode.kind === 'text') {
    const text = mode.fromStdin ? await deps.readStdin() : (mode.text ?? '');
    findings.push(...scanText(text, '<text>', config));
  } else if (mode.fromStdin) {
    findings.push(...scanDiff(await deps.readStdin(), config));
  } else if (mode.range !== undefined) {
    const result = deps.git(['diff', '--no-color', '--no-ext-diff', '-M', '-U0', mode.range]);
    if (!result.ok) {
      deps.writeError(`pii-guard: git diff ${mode.range} failed`);
      return 2;
    }
    findings.push(...scanDiff(result.stdout, config));
  } else {
    const collected = collectDiffFindings(mode.sources, config, deps);
    findings.push(...collected.findings);
    notes.push(...collected.notes);
  }

  const deduped = unique(findings);
  if (mode.json) {
    deps.write(`${JSON.stringify({ findings: deduped, notes, denylist: config.denylistPath }, null, 2)}\n`);
  } else {
    for (const note of notes) deps.writeError(`pii-guard: ${note}`);
    if (deduped.length > 0) deps.writeError(`${formatReport(deduped, 'the changes being checked')}\n`);
    else deps.write('pii-guard: clean\n');
    if (config.denylistPath === null && blocking(deduped).length === 0) {
      deps.writeError(
        'pii-guard: no denylist found, so only the shape-based rules ran. `bun tools/pii-guard/install.ts` explains how to add one.',
      );
    }
  }
  return blocking(deduped).length > 0 ? 1 : 0;
}

/**
 * PreToolUse protocol: a payload on stdin, and either silence (allow) or a
 * decision object on stdout.
 *
 * Two things are deliberate here. Failures deny rather than allow — a guard
 * that fails open is a guard that stops existing the first time it breaks. And
 * a command carrying `--no-verify` or `PII_GUARD_SKIP` is denied on sight:
 * those exist for a human who has looked at a finding and decided, not for an
 * agent working around a block it just hit.
 */
async function runClaudeHook(config: GuardConfig, deps: CliDeps): Promise<number> {
  const deny = (reason: string): number => {
    deps.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }));
    return 0;
  };

  let command: string;
  try {
    const payload: unknown = JSON.parse(await deps.readStdin());
    const input = (payload as { tool_input?: { command?: unknown } }).tool_input;
    command = typeof input?.command === 'string' ? input.command : '';
  } catch {
    // A payload we can't read is not a reason to wave a commit through, but it
    // is also not a commit — say nothing and let the tool run.
    return 0;
  }
  if (command.length === 0) return 0;

  const plan = planForCommand(command);
  if (plan === null) return 0;

  if (plan.bypass) {
    return deny(
      'Blocked by the PII guard: this command disables the pre-commit PII check (--no-verify / PII_GUARD_SKIP). '
      + 'That switch is for a human who has looked at a finding and judged it a false positive. '
      + 'Run the command without it; if the guard then blocks something you believe is fine, say which finding and why.',
    );
  }

  const findings: Finding[] = [];
  const { findings: diffFindings, notes } = collectDiffFindings(plan.diffs, config, deps);
  findings.push(...diffFindings);
  if (plan.scanCommandText) findings.push(...scanText(command, '<the command itself>', config));

  const blocked = blocking(unique(findings));
  if (blocked.length === 0) return 0;
  const suffix = notes.length > 0 ? ` (note: ${notes.join('; ')})` : '';
  return deny(`${denyReason(blocked, plan.subject)}${suffix}`);
}

export function writeOut(text: string): void {
  process.stdout.write(text);
}

/** Everything the guard says about a finding goes to stderr, so `--json` on
 * stdout stays parseable when a human is watching the same run. */
export function writeErr(text: string): void {
  process.stderr.write(`${text}\n`);
}

export async function readStdinText(): Promise<string> {
  return Bun.stdin.text();
}

/** Real-world implementations of everything {@link runCli} needs. */
export const realDeps: CliDeps = {
  git: runGit,
  readStdin: readStdinText,
  write: writeOut,
  writeError: writeErr,
};

if (import.meta.main) {
  process.exitCode = await runCli(Bun.argv.slice(2), realDeps);
}
