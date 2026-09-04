/**
 * The CLI and the hook protocol, driven in-process.
 *
 * `runCli` takes every outside effect — git, stdin, both output streams — as
 * injectable dependencies, so the interesting behaviour (what the Claude Code
 * hook answers, what the exit code is) is asserted here rather than by shelling
 * out to a subprocess and reading its output back.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCli, parseArgs, realDeps, writeErr, writeOut, type CliDeps } from '../cli';
import { runGit } from '../git';
import { planForCommand } from '../command';
import { installHook } from '../install';

const DENYLIST = 'email: ryanexample@realdomain.com\nphone: +1 617 555 7788\n';

/** A diff whose one added line carries a denylisted address. */
const DIRTY_DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,0 +1,1 @@',
  '+const owner = "ryanexample@realdomain.com";',
].join('\n');

const CLEAN_DIFF = [
  'diff --git a/src/app.ts b/src/app.ts',
  '--- a/src/app.ts',
  '+++ b/src/app.ts',
  '@@ -1,0 +1,1 @@',
  '+const owner = "user@example.com";',
].join('\n');

let workspace: string;
let previousDenylist: string | undefined;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'pii-guard-'));
  const denylistPath = join(workspace, 'denylist.txt');
  writeFileSync(denylistPath, DENYLIST);
  previousDenylist = process.env.PII_GUARD_DENYLIST;
  process.env.PII_GUARD_DENYLIST = denylistPath;
});

afterEach(() => {
  if (previousDenylist === undefined) delete process.env.PII_GUARD_DENYLIST;
  else process.env.PII_GUARD_DENYLIST = previousDenylist;
  rmSync(workspace, { recursive: true, force: true });
});

interface Harness {
  deps: CliDeps;
  out: string[];
  err: string[];
  gitCalls: string[][];
}

function harness(overrides: { stdin?: string; diff?: string } = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const gitCalls: string[][] = [];
  const deps: CliDeps = {
    git: (args) => {
      gitCalls.push(args);
      if (args[0] === 'rev-parse' && args.includes('--show-toplevel')) return { ok: true, stdout: `${workspace}\n` };
      if (args[0] === 'rev-parse') return { ok: true, stdout: `${join(workspace, '.git')}\n` };
      if (args[0] === 'merge-base') return { ok: true, stdout: 'abc123\n' };
      if (args[0] === 'diff') return { ok: true, stdout: overrides.diff ?? '' };
      return { ok: false, stdout: '' };
    },
    readStdin: async () => overrides.stdin ?? '',
    write: (text) => out.push(text),
    writeError: (text) => err.push(text),
  };
  return { deps, out, err, gitCalls };
}

describe('parseArgs', () => {
  it('defaults to the staged diff, which is what the pre-commit hook wants', () => {
    expect(parseArgs([])).toMatchObject({ kind: 'diff', sources: ['staged'] });
  });

  it('reads the modes it documents', () => {
    expect(parseArgs(['--branch', '--json'])).toMatchObject({ sources: ['branch'], json: true });
    expect(parseArgs(['--range', 'origin/main...HEAD'])).toMatchObject({ range: 'origin/main...HEAD' });
    expect(parseArgs(['--text', 'hello'])).toMatchObject({ kind: 'text', text: 'hello' });
  });

  it('refuses an unknown flag rather than silently scanning the default', () => {
    expect(parseArgs(['--everything'])).toEqual({ error: 'unknown argument "--everything"' });
    expect(parseArgs(['--range'])).toEqual({ error: '--range needs a value' });
  });
});

describe('runCli', () => {
  it('exits 1 and reports a location when the diff carries a denylisted value', async () => {
    const { deps, err } = harness({ stdin: DIRTY_DIFF });
    expect(await runCli(['--diff-stdin'], deps)).toBe(1);
    expect(err.join('\n')).toContain('src/app.ts:1');
    expect(err.join('\n')).not.toContain('ryanexample');
  });

  it('exits 0 on a clean diff', async () => {
    const { deps, out } = harness({ stdin: CLEAN_DIFF });
    expect(await runCli(['--diff-stdin'], deps)).toBe(0);
    expect(out.join('')).toContain('clean');
  });

  it('scans the staged diff by default', async () => {
    const { deps, gitCalls } = harness({ diff: DIRTY_DIFF });
    expect(await runCli([], deps)).toBe(1);
    expect(gitCalls.some((args) => args.includes('--cached'))).toBe(true);
  });

  it('scans a literal string, for a commit message or a PR body', async () => {
    const { deps } = harness();
    expect(await runCli(['--text', 'fixes the login for ryanexample@realdomain.com'], deps)).toBe(1);
    expect(await runCli(['--text', 'fixes the login'], deps)).toBe(0);
  });

  it('emits machine-readable findings under --json', async () => {
    const { deps, out } = harness({ stdin: DIRTY_DIFF });
    await runCli(['--diff-stdin', '--json'], deps);
    const payload = JSON.parse(out.join('')) as { findings: { rule: string }[] };
    expect(payload.findings.map((finding) => finding.rule)).toContain('denylist:email');
  });

  it('fails rather than passing when it is not in a repository', async () => {
    const { deps } = harness();
    deps.git = () => ({ ok: false, stdout: '' });
    expect(await runCli([], deps)).toBe(2);
  });

  it('prints its usage on --help', async () => {
    const { deps, out } = harness();
    expect(await runCli(['--help'], deps)).toBe(0);
    expect(out.join('')).toContain('--claude-hook');
  });

  it('rejects a bad flag instead of falling back to the default scan', async () => {
    const { deps, err } = harness();
    expect(await runCli(['--nope'], deps)).toBe(2);
    expect(err.join('')).toContain('unknown argument');
  });

  it('scans the worktree and an explicit range on request', async () => {
    const worktree = harness({ diff: DIRTY_DIFF });
    expect(await runCli(['--worktree'], worktree.deps)).toBe(1);
    expect(worktree.gitCalls.some((args) => args.includes('HEAD'))).toBe(true);

    const ranged = harness({ diff: DIRTY_DIFF });
    expect(await runCli(['--range', 'origin/main...HEAD'], ranged.deps)).toBe(1);
    expect(ranged.gitCalls.some((args) => args.includes('origin/main...HEAD'))).toBe(true);
  });

  it('fails when the range it was given does not resolve', async () => {
    const { deps, err } = harness();
    deps.git = (args) => (args[0] === 'diff' ? { ok: false, stdout: '' } : { ok: true, stdout: workspace });
    expect(await runCli(['--range', 'nope...HEAD'], deps)).toBe(2);
    expect(err.join('')).toContain('failed');
  });

  it('says which part went unscanned when there is no default branch', async () => {
    const { deps, err } = harness();
    deps.git = (args) => {
      if (args[0] === 'merge-base') return { ok: false, stdout: '' };
      return { ok: true, stdout: args.includes('--show-toplevel') ? workspace : join(workspace, '.git') };
    };
    expect(await runCli(['--branch'], deps)).toBe(0);
    expect(err.join('\n')).toContain('went unscanned');
  });

  it('scans stdin as prose under --text-stdin', async () => {
    const { deps } = harness({ stdin: 'contact ryanexample@realdomain.com' });
    expect(await runCli(['--text-stdin'], deps)).toBe(1);
  });

  it('points at the denylist when a clean run had none to use', async () => {
    delete process.env.PII_GUARD_DENYLIST;
    const { deps, err } = harness({ stdin: CLEAN_DIFF });
    expect(await runCli(['--diff-stdin'], deps)).toBe(0);
    expect(err.join('\n')).toContain('no denylist found');
  });

  it('reports a malformed denylist without refusing to run', async () => {
    writeFileSync(process.env.PII_GUARD_DENYLIST ?? '', 'nonsense\nphone: 617 555 7788\n');
    const { deps, err } = harness({ stdin: CLEAN_DIFF });
    expect(await runCli(['--diff-stdin'], deps)).toBe(0);
    expect(err.join('\n')).toContain('expected "kind: value"');
  });
});

describe('the real wiring', () => {
  it('runs git for real', () => {
    // The injected git in every other test proves the logic; this proves the
    // one call that actually reaches a process is spelled correctly.
    expect(runGit(['--version']).stdout).toContain('git version');
    expect(runGit(['no-such-subcommand']).ok).toBe(false);
  });

  it('hands runCli real implementations', () => {
    expect(realDeps.git).toBe(runGit);
    writeOut('');
    writeErr('');
  });
});

describe('planForCommand', () => {
  it('gates the commands that publish something', () => {
    expect(planForCommand('git commit -m "x"')?.diffs).toEqual(['staged']);
    expect(planForCommand('git add -A && git commit -am "x"')?.diffs).toEqual(['staged', 'worktree']);
    expect(planForCommand('git push -u origin HEAD')?.diffs).toEqual(['branch']);
    expect(planForCommand('gh pr create --title t --body b')?.subject).toBe('this pull request');
    expect(planForCommand('gh api repos/x/y/pulls/1 -X PATCH -f body="…"')?.scanCommandText).toBe(true);
  });

  it('leaves everything else alone', () => {
    for (const command of ['ls -la', 'git status', 'git log -p', 'bun run test', 'gh pr view 12']) {
      expect(planForCommand(command)).toBeNull();
    }
  });

  it('notices an attempt to skip the check', () => {
    expect(planForCommand('git commit --no-verify -m "x"')?.bypass).toBe(true);
    expect(planForCommand('PII_GUARD_SKIP=1 git commit -m "x"')?.bypass).toBe(true);
    expect(planForCommand('git commit -m "x"')?.bypass).toBe(false);
  });

  it('tells an actual bypass flag apart from prose that mentions one', () => {
    // A commit message or a PR body is allowed to talk about --no-verify; only
    // the shell's own words count. This PR's description is the reason the
    // distinction exists.
    expect(planForCommand('git commit -m "document the --no-verify escape hatch"')?.bypass).toBe(false);
    expect(planForCommand("git commit -m 'PII_GUARD_SKIP is for humans'")?.bypass).toBe(false);
    expect(planForCommand('gh pr create --body-file - <<BODY\nexplains --no-verify\nBODY')?.bypass).toBe(false);
  });

  it('reads the command through its payloads, not around them', () => {
    // A heredoc body that quotes a git command is data, not a command.
    expect(planForCommand('cat <<EOF\ngit commit -m x\nEOF')).toBeNull();
    // …but the command carrying it is still classified.
    expect(planForCommand('gh pr create --body-file - <<EOF\nhello\nEOF')?.subject)
      .toBe('this pull request');
  });
});

describe('the Claude Code hook', () => {
  const payload = (command: string) => JSON.stringify({ tool_input: { command } });

  const decision = (out: string[]): { permissionDecision: string; permissionDecisionReason: string } | null => {
    const text = out.join('');
    if (text.length === 0) return null;
    return (JSON.parse(text) as {
      hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
    }).hookSpecificOutput;
  };

  it('says nothing about a command that publishes nothing', async () => {
    const { deps, out } = harness({ stdin: payload('bun run test') });
    expect(await runCli(['--claude-hook'], deps)).toBe(0);
    expect(out).toEqual([]);
  });

  it('denies a commit whose staged diff carries a real value, and says what to do', async () => {
    const { deps, out } = harness({ stdin: payload('git commit -m "wire up login"'), diff: DIRTY_DIFF });
    expect(await runCli(['--claude-hook'], deps)).toBe(0);
    const answer = decision(out);
    expect(answer?.permissionDecision).toBe('deny');
    expect(answer?.permissionDecisionReason).toContain('src/app.ts:1');
    expect(answer?.permissionDecisionReason).toContain('fictional');
    // The point of the whole exercise: the value must not travel into the
    // transcript along with the complaint about it.
    expect(answer?.permissionDecisionReason).not.toContain('ryanexample');
  });

  it('denies a commit whose MESSAGE carries a real value, clean diff or not', async () => {
    const { deps, out } = harness({
      stdin: payload('git commit -m "fix login for ryanexample@realdomain.com"'),
      diff: CLEAN_DIFF,
    });
    await runCli(['--claude-hook'], deps);
    expect(decision(out)?.permissionDecisionReason).toContain('the command itself');
  });

  it('allows a clean commit', async () => {
    const { deps, out } = harness({ stdin: payload('git commit -m "tidy up"'), diff: CLEAN_DIFF });
    expect(await runCli(['--claude-hook'], deps)).toBe(0);
    expect(out).toEqual([]);
  });

  it('denies an attempt to bypass the git hook outright', async () => {
    const { deps, out } = harness({ stdin: payload('git commit --no-verify -m "tidy up"'), diff: CLEAN_DIFF });
    await runCli(['--claude-hook'], deps);
    expect(decision(out)?.permissionDecisionReason).toContain('--no-verify');
  });

  it('checks the branch range before a push or a pull request', async () => {
    const { deps, out, gitCalls } = harness({ stdin: payload('gh pr create --fill'), diff: DIRTY_DIFF });
    await runCli(['--claude-hook'], deps);
    expect(gitCalls.some((args) => args[0] === 'merge-base')).toBe(true);
    expect(decision(out)?.permissionDecision).toBe('deny');
  });

  it('stays quiet on a payload it cannot read, rather than blocking every command', async () => {
    const { deps, out } = harness({ stdin: 'not json' });
    expect(await runCli(['--claude-hook'], deps)).toBe(0);
    expect(out).toEqual([]);
  });
});

describe('installHook', () => {
  it('writes an executable hook into the git directory', () => {
    const source = join(workspace, 'pre-commit');
    writeFileSync(source, '#!/bin/sh\n# PII guard\nexit 0\n');
    mkdirSync(join(workspace, '.git'), { recursive: true });

    const result = installHook(source, join(workspace, '.git'));
    expect(result.installed).toBe(true);
    expect(readFileSync(result.hookPath, 'utf8')).toContain('PII guard');
  });

  it('refuses to clobber someone else\'s pre-commit hook', () => {
    const source = join(workspace, 'pre-commit');
    writeFileSync(source, '#!/bin/sh\n# PII guard\n');
    const hooks = join(workspace, '.git', 'hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-commit'), '#!/bin/sh\nlint-staged\n');
    chmodSync(join(hooks, 'pre-commit'), 0o755);

    const result = installHook(source, join(workspace, '.git'));
    expect(result.installed).toBe(false);
    expect(result.conflict).toContain('lint-staged');
    expect(readFileSync(join(hooks, 'pre-commit'), 'utf8')).toContain('lint-staged');
  });

  it('replaces its own earlier version', () => {
    const source = join(workspace, 'pre-commit');
    writeFileSync(source, '#!/bin/sh\n# PII guard v2\n');
    const hooks = join(workspace, '.git', 'hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(join(hooks, 'pre-commit'), '#!/bin/sh\n# PII guard v1\n');

    expect(installHook(source, join(workspace, '.git')).installed).toBe(true);
    expect(readFileSync(join(hooks, 'pre-commit'), 'utf8')).toContain('v2');
  });
});
