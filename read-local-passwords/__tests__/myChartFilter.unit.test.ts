import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { setTestTransport } from '../../scrapers/http';
import { resetHostLimiters } from '../../shared/hostConcurrency';
import { classifyMyChartEntries } from '../myChartFilter';
import type { PasswordStoreEntry } from '../types';

/**
 * The classifier is the part of browser import that decides what the user is
 * shown, so these tests pin the two rules it exists to enforce: a saved
 * credential is never silently discarded, and a host that redirects into a
 * known instance is the *same* account as that instance, not a second one.
 *
 * `mychart.uchealth.org` and `mychart.bmc.org` are real entries in the bundled
 * directory; `not-a-portal.example` deliberately is not.
 */

const KNOWN_HOST = 'mychart.uchealth.org';
const OTHER_KNOWN_HOST = 'mychart.bmc.org';

function entry(overrides: Partial<PasswordStoreEntry> & { url: string }): PasswordStoreEntry {
  return { user: 'homer', pass: 'donuts123', success: true, source: 'Chrome', ...overrides };
}

/** Answer every probe with one canned response. */
function respond(handler: (url: string) => Response): void {
  setTestTransport(async (url: string) => handler(url));
}

const loginPage = () => new Response('<div id="mainLoginContent">sign in</div>', { status: 200 });

describe('classifyMyChartEntries', () => {
  beforeEach(() => {
    resetHostLimiters();
    // Any probe in these tests is a failure unless the test opts into one.
    respond(() => new Response('nope', { status: 404 }));
  });

  afterEach(() => setTestTransport(null));

  it('accepts a known instance from the directory without any network call', async () => {
    let requests = 0;
    respond(() => {
      requests++;
      return loginPage();
    });

    const [candidate] = await classifyMyChartEntries([entry({ url: `https://${KNOWN_HOST}/MyChart/accesscheck.asp` })]);

    expect(candidate!.confidence).toBe('directory');
    expect(candidate!.hostname).toBe(KNOWN_HOST);
    expect(candidate!.instanceName).toBeTruthy();
    expect(requests).toBe(0);
  });

  it('ignores saved logins that are not health portals at all', async () => {
    const results = await classifyMyChartEntries([
      entry({ url: 'https://news.example.com/login' }),
      entry({ url: 'https://mail.example.com/' }),
    ]);

    expect(results).toHaveLength(0);
  });

  it('does not mistake a lookalike domain for a portal', async () => {
    // Real trap, taken from an actual password store: a naive "epic" substring
    // search pulls in a games storefront and a ski pass. They are dropped
    // outright rather than shown as unverified — the unverified tier is for
    // portal-shaped hosts we could not confirm, not for everything that ever
    // shared three letters with "Epic".
    let requests = 0;
    respond(() => {
      requests++;
      return loginPage();
    });

    const results = await classifyMyChartEntries([
      entry({ url: 'https://accounts.epicgames.com/resetPassword' }),
      entry({ url: 'https://www.epicpass.com/account/create-account.aspx' }),
    ]);

    expect(results).toHaveLength(0);
    expect(requests).toBe(0);
  });

  it('confirms an unknown host whose login page is Epic', async () => {
    respond(url => (url.includes('newportal.example') ? loginPage() : new Response('', { status: 404 })));

    const [candidate] = await classifyMyChartEntries([entry({ url: 'https://mychart.newportal.example/MyChart/' })]);

    expect(candidate!.confidence).toBe('probed');
    expect(candidate!.hostname).toBe('mychart.newportal.example');
  });

  it('follows a retired domain into the instance it now redirects to', async () => {
    respond(url =>
      url.includes('oldhospital.example')
        ? new Response(null, { status: 302, headers: { location: `https://${KNOWN_HOST}/MyChart/` } })
        : loginPage(),
    );

    const [candidate] = await classifyMyChartEntries([entry({ url: 'https://mychart.oldhospital.example/MyChart/' })]);

    // Landing on a known instance makes this a directory match, not a probe.
    expect(candidate!.confidence).toBe('directory');
    expect(candidate!.hostname).toBe(KNOWN_HOST);
  });

  it('keeps a portal-shaped host that never answers, rather than dropping it', async () => {
    // The case the whole `unverified` tier exists for: the password is real,
    // but the old domain has stopped resolving, so we cannot prove anything.
    setTestTransport(async () => {
      throw new Error('ENOTFOUND');
    });

    const [candidate] = await classifyMyChartEntries([entry({ url: 'https://mychart.gone.example/MyChart/' })]);

    expect(candidate!.confidence).toBe('unverified');
    expect(candidate!.unverifiedReason).toMatch(/did not respond/);
    expect(candidate!.pass).toBe('donuts123');
  });

  it('reports a host that answers but serves no Epic login page', async () => {
    respond(() => new Response('<html>parked domain</html>', { status: 200 }));

    const [candidate] = await classifyMyChartEntries([entry({ url: 'https://patientportal.parked.example/' })]);

    expect(candidate!.confidence).toBe('unverified');
    expect(candidate!.unverifiedReason).toMatch(/no Epic login page/);
  });

  it('makes no requests at all when host checks are disabled', async () => {
    let requests = 0;
    respond(() => {
      requests++;
      return loginPage();
    });

    const [candidate] = await classifyMyChartEntries(
      [entry({ url: 'https://mychart.unknown.example/MyChart/' })],
      { probeUnknownHosts: false },
    );

    expect(requests).toBe(0);
    expect(candidate!.confidence).toBe('unverified');
  });

  it('collapses an old domain and its successor into one account', async () => {
    respond(url =>
      url.includes('oldhospital.example')
        ? new Response(null, { status: 302, headers: { location: `https://${KNOWN_HOST}/MyChart/` } })
        : loginPage(),
    );

    const results = await classifyMyChartEntries([
      entry({ url: `https://${KNOWN_HOST}/MyChart/` }),
      entry({ url: 'https://mychart.oldhospital.example/MyChart/' }),
    ]);

    // Same login, two saved URLs — one account, keyed by where it resolves.
    expect(results).toHaveLength(1);
    expect(results[0]!.hostname).toBe(KNOWN_HOST);
  });

  it('keeps two different people on the same hostname apart', async () => {
    const results = await classifyMyChartEntries([
      entry({ url: `https://${KNOWN_HOST}/MyChart/`, user: 'homer' }),
      entry({ url: `https://${KNOWN_HOST}/MyChart/`, user: 'marge', pass: 'pretzels456' }),
    ]);

    expect(results).toHaveLength(2);
    expect(results.map(r => r.user ?? '').sort((a, b) => a.localeCompare(b))).toEqual(['homer', 'marge']);
  });

  it('treats a username that differs only in case as the same login', async () => {
    const results = await classifyMyChartEntries([
      entry({ url: `https://${KNOWN_HOST}/MyChart/`, user: 'Homer' }),
      entry({ url: `https://${KNOWN_HOST}/MyChart/`, user: 'homer' }),
    ]);

    expect(results).toHaveLength(1);
  });

  it('skips rows that failed to decrypt', async () => {
    const results = await classifyMyChartEntries([
      entry({ url: `https://${KNOWN_HOST}/MyChart/`, pass: null, success: false }),
    ]);

    expect(results).toHaveLength(0);
  });

  it('sorts confirmed accounts ahead of unverified ones', async () => {
    setTestTransport(async () => {
      throw new Error('ENOTFOUND');
    });

    const results = await classifyMyChartEntries([
      entry({ url: 'https://mychart.gone.example/MyChart/' }),
      entry({ url: `https://${OTHER_KNOWN_HOST}/MyChart/` }),
    ]);

    expect(results[0]!.confidence).toBe('directory');
    expect(results[results.length - 1]!.confidence).toBe('unverified');
  });
});
