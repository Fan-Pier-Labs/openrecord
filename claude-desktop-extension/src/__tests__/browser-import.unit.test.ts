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
    confidence: 'unverified' as const,
    unverifiedReason: 'host did not respond',
  },
];

void mock.module('../../../read-local-passwords/index', () => ({
  isSupportedPlatform: () => true,
  findMyChartCandidates: async () => candidates,
}));

const { scanBrowserPasswords, takeImportedCandidate, releaseImportedCandidate, _clearHeldImports } =
  await import('../browser-import');

describe('scanBrowserPasswords', () => {
  beforeEach(() => _clearHeldImports());
  afterEach(() => _clearHeldImports());

  it('never puts a password in the summary the model sees', async () => {
    const scan = await scanBrowserPasswords();
    const serialized = JSON.stringify(scan);

    expect(serialized).not.toContain('donuts123');
    expect(serialized).not.toContain('pretzels456');
    // And nothing named like a password field leaked either.
    expect(serialized).not.toContain('"pass"');
  });

  it('separates confirmed accounts from unverified ones', async () => {
    const scan = await scanBrowserPasswords();

    expect(scan.confirmed.map(c => c.hostname)).toEqual(['mychart.example.org']);
    expect(scan.unverified.map(c => c.hostname)).toEqual(['mychart.gone.example']);
    expect(scan.unverified[0]!.unverified_reason).toBe('host did not respond');
  });

  it('surfaces the instance name so the user recognises the health system', async () => {
    const scan = await scanBrowserPasswords();
    expect(scan.confirmed[0]!.instance_name).toBe('Springfield General');
  });

  it('redeems an import_id back to the full credential, in-process only', async () => {
    const scan = await scanBrowserPasswords();
    const held = takeImportedCandidate(scan.confirmed[0]!.import_id);

    expect(held?.pass).toBe('donuts123');
    expect(held?.user).toBe('homer');
  });

  it('does not redeem an id that was never issued', () => {
    expect(takeImportedCandidate('not-a-real-id')).toBeUndefined();
  });

  it('forgets a credential once it has been connected', async () => {
    const scan = await scanBrowserPasswords();
    const id = scan.confirmed[0]!.import_id;

    releaseImportedCandidate(id);

    expect(takeImportedCandidate(id)).toBeUndefined();
  });
});
