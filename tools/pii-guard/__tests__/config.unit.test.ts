/**
 * Configuration: the denylist format, the committed allowlist, and the paths
 * that opt out of scanning.
 *
 * The denylist parser gets the most attention here because it is the only place
 * a user writes anything, and a line it silently ignores is a value the guard
 * silently stops watching for.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../config';
import { denylistCandidates, loadDenylist, parseDenylist } from '../denylist';
import { nextSteps, runInstall } from '../install';

let workspace: string;
let previousDenylist: string | undefined;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'pii-guard-config-'));
  previousDenylist = process.env.PII_GUARD_DENYLIST;
  delete process.env.PII_GUARD_DENYLIST;
});

afterEach(() => {
  if (previousDenylist === undefined) delete process.env.PII_GUARD_DENYLIST;
  else process.env.PII_GUARD_DENYLIST = previousDenylist;
  rmSync(workspace, { recursive: true, force: true });
});

describe('parseDenylist', () => {
  it('ignores comments and blank lines', () => {
    const { needles, problems } = parseDenylist('# a comment\n\n   \nphone: 617 555 7788\n');
    expect(problems).toEqual([]);
    expect(needles).toHaveLength(1);
  });

  it('normalises a phone number to digits, with and without a country code', () => {
    const { needles } = parseDenylist('phone: +1 (617) 555-7788');
    expect(needles.map((needle) => needle.normalized)).toEqual(['16175557788', '6175557788']);
  });

  it('turns one date into every rendering it gets written in', () => {
    const { needles } = parseDenylist('dob: 1980-01-02');
    const normalized = needles.map((needle) => needle.normalized);
    expect(normalized).toContain('19800102');
    expect(normalized).toContain('01021980');
    // A written-out month is normalised as prose, not as digits.
    expect(normalized).toContain('january21980');
    // Dates are matched whole: a six-digit fragment of one is every other date.
    for (const needle of needles) expect(needle.minRun).toBe(needle.normalized.length);
  });

  it('splits an address into the whole thing and its local part', () => {
    const { needles } = parseDenylist('email: marigold@realdomain.com');
    expect(needles.map((needle) => needle.normalized))
      .toEqual(['marigold@realdomain.com', 'marigold']);
    expect(needles[0]?.minRun).toBe('marigold@realdomain.com'.length);
  });

  it('accepts per-entry threshold overrides', () => {
    const { needles, problems } = parseDenylist('name: Marigold Featherstone | minRun=6 | minRevealed=3');
    expect(problems).toEqual([]);
    expect(needles[0]).toMatchObject({ minRun: 6, minRevealed: 3 });
  });

  it('lets an explicit minRun override the whole-value rule for dates', () => {
    const { needles } = parseDenylist('dob: 1980-01-02 | minRun=4');
    expect(needles.some((needle) => needle.minRun === 4)).toBe(true);
  });

  it('reports every way a line can be wrong, rather than dropping it silently', () => {
    const { needles, problems } = parseDenylist([
      'nonsense',
      'colour: blue',
      'phone:',
      'name: Marigold | minRun=lots',
      'name: Marigold | wat=3',
      'mrn: 12',
    ].join('\n'));
    expect(problems).toHaveLength(6);
    expect(problems[0]).toContain('expected "kind: value"');
    expect(problems[1]).toContain('unknown kind');
    expect(problems[2]).toContain('empty value');
    expect(problems[3]).toContain('bad option');
    expect(problems[4]).toContain('unknown option');
    expect(problems[5]).toContain('under 3 characters');
    // The two well-formed halves of the bad-option lines still count.
    expect(needles).toHaveLength(2);
  });
});

describe('denylistCandidates', () => {
  it('prefers the environment override, then the git directory', () => {
    process.env.PII_GUARD_DENYLIST = '/tmp/override.txt';
    const candidates = denylistCandidates('/repo/.git');
    expect(candidates[0]).toBe('/tmp/override.txt');
    expect(candidates[1]).toBe(join('/repo/.git', 'pii-denylist.txt'));
    expect(candidates[2]).toContain(join('.config', 'openrecord', 'pii-denylist.txt'));
  });

  it('works outside a repository, where there is no git directory', () => {
    expect(denylistCandidates(null)).toHaveLength(1);
  });
});

describe('loadDenylist', () => {
  it('treats a missing denylist as normal rather than as an error', () => {
    expect(loadDenylist(join(workspace, 'nowhere'))).toEqual({ needles: [], path: null, problems: [] });
  });

  it('reads the first file that exists', () => {
    const gitDir = join(workspace, '.git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(gitDir, 'pii-denylist.txt'), 'phone: 617 555 7788\n');
    const loaded = loadDenylist(gitDir);
    expect(loaded.needles).toHaveLength(1);
    expect(loaded.path).toBe(join(gitDir, 'pii-denylist.txt'));
  });
});

describe('loadConfig', () => {
  it('reads the committed allowlist and the committed path opt-outs', () => {
    mkdirSync(join(workspace, 'tools', 'pii-guard'), { recursive: true });
    writeFileSync(
      join(workspace, 'tools', 'pii-guard', 'allowlist.txt'),
      '# fixtures\nHomer@Example.com\n\ndonuts123\n',
    );
    writeFileSync(join(workspace, '.pii-guard-allow'), '# generated\nfake-mychart/fixtures/**\n');

    const config = loadConfig(workspace, null);
    expect(config.allowlist.has('homer@example.com')).toBe(true);
    expect(config.allowlist.has('donuts123')).toBe(true);
    expect(config.skipPaths).toContain('fake-mychart/fixtures/**');
    // The guard's own directory is always skipped, configured or not — it
    // cannot document a rule without containing an example of what the rule
    // fires on.
    expect(config.skipPaths).toContain('tools/pii-guard/**');
  });

  it('is happy with neither file present', () => {
    const config = loadConfig(workspace, null);
    expect(config.allowlist.size).toBe(0);
    expect(config.denylistPath).toBeNull();
  });
});

describe('runInstall', () => {
  function io(): { deps: Parameters<typeof runInstall>[0]; lines: string[] } {
    const lines: string[] = [];
    mkdirSync(join(workspace, 'tools', 'pii-guard', 'hooks'), { recursive: true });
    writeFileSync(join(workspace, 'tools', 'pii-guard', 'hooks', 'pre-commit'), '#!/bin/sh\n# PII guard\n');
    return {
      lines,
      deps: {
        git: (args) => ({
          ok: true,
          stdout: args.includes('--show-toplevel') ? workspace : join(workspace, '.git'),
        }),
        log: (line) => lines.push(line),
      },
    };
  }

  it('installs the hook and then explains the missing denylist', () => {
    const { deps, lines } = io();
    expect(runInstall(deps)).toBe(0);
    expect(lines.join('\n')).toContain('installed');
    expect(lines.join('\n')).toContain('no denylist yet');
  });

  it('fails outside a repository', () => {
    const { deps, lines } = io();
    deps.git = () => ({ ok: false, stdout: '' });
    expect(runInstall(deps)).toBe(2);
    expect(lines.join('\n')).toContain('not inside a git repository');
  });

  it('stops rather than clobbering an existing hook', () => {
    const { deps, lines } = io();
    mkdirSync(join(workspace, '.git', 'hooks'), { recursive: true });
    writeFileSync(join(workspace, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nlint-staged\n');
    expect(runInstall(deps)).toBe(1);
    expect(lines.join('\n')).toContain('already exists');
  });

  it('confirms an existing denylist instead of explaining how to make one', () => {
    expect(nextSteps('/repo/.git/pii-denylist.txt', true)).toEqual(['pii-guard: using the denylist at /repo/.git/pii-denylist.txt']);
  });
});
