import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { setTestTransport } from '../../scrapers/http';
import { resetHostLimiters } from '../../shared/hostConcurrency';
import { classifyMyChartEntries } from '../myChartFilter';
import type { PasswordStoreEntry } from '../types';

/**
 * The classifier decides which saved passwords become offerable accounts, so
 * these tests pin the two rules it enforces: only confirmed portals are
 * returned, and a host that redirects into a known instance is the *same*
 * account as that instance, not a second one.
 *
 * `mychart.uchealth.org` and `mychart.bmc.org` are real entries in the bundled
 * directory; the `.example` hosts deliberately are not.
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
    // search pulls in a games storefront and a ski pass.
    let requests = 0;
    respond(() => {
      requests++;
      return loginPage();
    });

    const results = await classifyMyChartEntries([
      entry({ url: 'https://accounts.epicgames.com/resetPassword' }),
      entry({ url: 'https://www.epicpass.com/account/create-account.aspx' }),
    ]);

    // Dropped without even a probe: the URL never looked like a portal.
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

  it('drops a portal-shaped host that never answers', async () => {
    // A host we cannot reach is a host we cannot log into, so offering it would
    // only buy the user a failed attempt. They can re-run the import later.
    setTestTransport(async () => {
      throw new Error('ENOTFOUND');
    });

    const results = await classifyMyChartEntries([entry({ url: 'https://mychart.gone.example/MyChart/' })]);

    expect(results).toHaveLength(0);
  });

  it('drops a host that answers but serves no Epic login page', async () => {
    respond(() => new Response('<html>parked domain</html>', { status: 200 }));

    const results = await classifyMyChartEntries([entry({ url: 'https://patientportal.parked.example/' })]);

    expect(results).toHaveLength(0);
  });

  it('makes no requests, and returns only directory hits, when host checks are off', async () => {
    let requests = 0;
    respond(() => {
      requests++;
      return loginPage();
    });

    const results = await classifyMyChartEntries(
      [
        entry({ url: 'https://mychart.unknown.example/MyChart/' }),
        entry({ url: `https://${KNOWN_HOST}/MyChart/` }),
      ],
      { probeUnknownHosts: false },
    );

    expect(requests).toBe(0);
    expect(results.map(r => r.hostname)).toEqual([KNOWN_HOST]);
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

  it('sorts directory matches ahead of probed ones', async () => {
    respond(url => (url.includes('newportal.example') ? loginPage() : new Response('', { status: 404 })));

    const results = await classifyMyChartEntries([
      entry({ url: 'https://mychart.newportal.example/MyChart/' }),
      entry({ url: `https://${OTHER_KNOWN_HOST}/MyChart/` }),
    ]);

    expect(results.map(r => r.confidence)).toEqual(['directory', 'probed']);
  });
});
