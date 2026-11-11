// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

/**
 * The one invariant that matters here: a password read out of the browser must
 * never reach a tool result, because tool results are sent to the model. The
 * scan returns an opaque `import_id` and keeps the credential in this process.
 */

const candidates = [
  {
    key: 'aaaa1111',
    url: 'https://mychart.example.org/MyChart/',
    hostname: 'mychart.example.org',
    user: 'homer',
    pass: 'donuts123',
    success: true,
    source: 'Chrome',
    confidence: 'directory' as const,
    instanceName: 'Springfield General',
  },
  {
    key: 'bbbb2222',
    url: 'https://mychart.gone.example/MyChart/',
    hostname: 'mychart.gone.example',
    user: 'marge',
    pass: 'pretzels456',
    success: true,
    source: 'Firefox',
    confidence: 'probed' as const,
  },
  // Homer again, saved in Firefox with an older password.
  {
    key: 'cccc3333',
    url: 'https://mychart.example.org/MyChart/Authentication/Login',
    hostname: 'mychart.example.org',
    user: 'Homer',
    pass: 'oldDonuts',
    success: true,
    source: 'Firefox',
    confidence: 'directory' as const,
    instanceName: 'Springfield General',
  },
];

void mock.module('../../../read-local-passwords/index', () => ({
  isSupportedPlatform: () => true,
  findMyChartCandidates: async () => candidates,
  blockedBrowsers: () => ['Firefox'],
}));

const { scanBrowserPasswords, takeImportedCandidates, releaseImportedCandidate, _clearHeldImports } =
  await import('../browser-import');

describe('scanBrowserPasswords', () => {
  beforeEach(() => _clearHeldImports());
  afterEach(() => _clearHeldImports());

  it('never puts a password in the summary the model sees', async () => {
    const scan = await scanBrowserPasswords();
    const serialized = JSON.stringify(scan);

    expect(serialized).not.toContain('donuts123');
    expect(serialized).not.toContain('pretzels456');
    expect(serialized).not.toContain('oldDonuts');
    // And nothing named like a password field leaked either.
    expect(serialized).not.toContain('"pass"');
  });

  it('returns every confirmed account, with how it was confirmed', async () => {
    const scan = await scanBrowserPasswords();

    expect(scan.accounts.map(c => c.hostname)).toEqual(['mychart.example.org', 'mychart.gone.example']);
    expect(scan.accounts.map(c => c.confidence)).toEqual(['directory', 'probed']);
  });

  it('names the browsers macOS would not let it read', async () => {
    expect((await scanBrowserPasswords()).blocked_browsers).toEqual(['Firefox']);
  });

  it('surfaces the instance name so the user recognises the health system', async () => {
    const scan = await scanBrowserPasswords();
    expect(scan.accounts[0]!.instance_name).toBe('Springfield General');
  });

  it('redeems an import_id back to the full credential, in-process only', async () => {
    const scan = await scanBrowserPasswords();
    const held = takeImportedCandidates(scan.accounts[1]!.import_id);

    expect(held?.map(c => c.pass)).toEqual(['pretzels456']);
    expect(held?.[0]?.user).toBe('marge');
  });

  it('offers a login saved in two browsers once, holding both passwords', async () => {
    const scan = await scanBrowserPasswords();
    const homer = scan.accounts.filter(c => c.hostname === 'mychart.example.org');

    expect(homer).toHaveLength(1);
    expect(homer[0]!.source).toBe('Chrome and Firefox');
    expect(takeImportedCandidates(homer[0]!.import_id)?.map(c => c.pass)).toEqual(['donuts123', 'oldDonuts']);
  });

  it('does not redeem an id that was never issued', () => {
    expect(takeImportedCandidates('not-a-real-id')).toBeUndefined();
  });

  it('forgets a credential once it has been connected', async () => {
    const scan = await scanBrowserPasswords();
    const id = scan.accounts[0]!.import_id;

    releaseImportedCandidate(id);

    expect(takeImportedCandidates(id)).toBeUndefined();
  });
});
