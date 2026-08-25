import { describe, it, expect, afterEach, mock } from 'bun:test';

/**
 * The package entry point. Two things matter here: the platform guard must stop
 * everything before a store is touched, and one unreadable store must not cost
 * us the other — a Keychain prompt the user denies for Chrome should still leave
 * Firefox's logins available.
 *
 * The guard is checked against `process.platform` precisely so a test can
 * exercise it; `os.platform()` is a native call that cannot be stubbed, and a
 * guard written against it would run against the developer's real store.
 */

let chromiumResult: () => Promise<unknown> = () => Promise.resolve([]);
let firefoxResult: () => Promise<unknown> = () => Promise.resolve([]);

void mock.module('../chromium', () => ({ getChromiumLogins: () => chromiumResult() }));
void mock.module('../firefox', () => ({ getFirefoxLogins: () => firefoxResult() }));

const { getAllBrowserLogins, getMyChartAccounts, isSupportedPlatform } = await import('../index');

const originalPlatform = process.platform;
const setPlatform = (value: string): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true });
};

afterEach(() => {
  setPlatform(originalPlatform);
  chromiumResult = () => Promise.resolve([]);
  firefoxResult = () => Promise.resolve([]);
});

describe('isSupportedPlatform', () => {
  it('is true on macOS and Windows', () => {
    for (const platform of ['darwin', 'win32']) {
      setPlatform(platform);
      expect(isSupportedPlatform()).toBe(true);
    }
  });

  it('is false everywhere else', () => {
    for (const platform of ['linux', 'freebsd', 'android']) {
      setPlatform(platform);
      expect(isSupportedPlatform()).toBe(false);
    }
  });
});

describe('on an unsupported platform', () => {
  it('reads no logins at all', async () => {
    setPlatform('linux');
    chromiumResult = () => Promise.reject(new Error('must not be called'));
    firefoxResult = () => Promise.reject(new Error('must not be called'));

    expect(await getAllBrowserLogins()).toEqual([]);
  });

  it('finds no accounts, without making a network call', async () => {
    setPlatform('linux');
    expect(await getMyChartAccounts()).toEqual([]);
  });
});

describe('getAllBrowserLogins', () => {
  const entry = (source: string) => ({ url: `https://${source}.example/`, user: 'homer', pass: 'x', success: true, source });

  it('merges what every store returned', async () => {
    setPlatform('darwin');
    chromiumResult = () => Promise.resolve([entry('chrome')]);
    firefoxResult = () => Promise.resolve([entry('firefox')]);

    expect((await getAllBrowserLogins()).map(l => l.source)).toEqual(['chrome', 'firefox']);
  });

  it('keeps one store when the other fails', async () => {
    // A denied Keychain prompt or a profile mid-upgrade must not cost the user
    // the logins we *can* read.
    setPlatform('darwin');
    chromiumResult = () => Promise.reject(new Error('keychain denied'));
    firefoxResult = () => Promise.resolve([entry('firefox')]);

    expect((await getAllBrowserLogins()).map(l => l.source)).toEqual(['firefox']);
  });

  it('returns nothing, rather than throwing, when every store fails', async () => {
    setPlatform('darwin');
    chromiumResult = () => Promise.reject(new Error('keychain denied'));
    firefoxResult = () => Promise.reject(new Error('primary password set'));

    expect(await getAllBrowserLogins()).toEqual([]);
  });
});
