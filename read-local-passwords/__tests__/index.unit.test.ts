// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, it, expect, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

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

void mock.module('../chromium', () => ({
  getChromiumLogins: () => chromiumResult(),
  chromiumProfileRoots: () => [{ name: 'Chrome', root: '/fake/Chrome' }, { name: 'Arc', root: '/fake/Arc' }, { name: 'Brave', root: '/fake/Brave' }],
}));
void mock.module('../firefox', () => ({ getFirefoxLogins: () => firefoxResult(), firefoxProfileRoots: () => ['/fake/Firefox'] }));

const { blockedBrowsers, getAllBrowserLogins, getMyChartAccounts, isSupportedPlatform } = await import('../index');

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

describe('blockedBrowsers', () => {
  const failWith = (codes: Record<string, string>) =>
    spyOn(fs, 'readdirSync').mockImplementation(((dir: string) => {
      const code = codes[dir];
      if (code) throw Object.assign(new Error(code), { code });
      return [];
    }) as unknown as typeof fs.readdirSync);

  /** Fail every open with the code given for its folder name (EPERM otherwise); returns the folders tried. */
  const guardedOpens = (codes: Record<string, string> = {}) => {
    const open = spyOn(fs, 'openSync').mockImplementation(((file: string) => {
      const code = codes[path.basename(file)] ?? 'EPERM';
      throw Object.assign(new Error(code), { code });
    }) as unknown as typeof fs.openSync);
    return () => open.mock.calls.map(([file]) => path.basename(String(file)));
  };

  afterEach(() => mock.restore());

  it('names the browsers whose folder macOS refused', () => {
    // EPERM is macOS privacy protection; Full Disk Access lifts it.
    setPlatform('darwin');
    failWith({ '/fake/Chrome': 'EPERM', '/fake/Firefox': 'EPERM' });

    expect(blockedBrowsers()).toEqual(['Chrome', 'Firefox']);
  });

  it('opens a guarded folder once a browser is blocked, which is what gets Claude listed under Full Disk Access', () => {
    // A refused browser folder does not add Claude to that list; a refused
    // classic Full Disk Access location does (verified with a probe app).
    setPlatform('darwin');
    failWith({ '/fake/Chrome': 'EPERM' });
    const tried = guardedOpens();

    blockedBrowsers();
    expect(tried()).toEqual(['Safari']);
  });

  it('moves on to the next guarded folder only when one does not exist', () => {
    setPlatform('darwin');
    failWith({ '/fake/Chrome': 'EPERM' });
    const tried = guardedOpens({ Safari: 'ENOENT' });

    blockedBrowsers();
    expect(tried()).toEqual(['Safari', 'Mail']);
  });

  it('does not count a browser that is not installed, or a folder Full Disk Access would not open', () => {
    setPlatform('darwin');
    failWith({ '/fake/Chrome': 'ENOENT', '/fake/Brave': 'EACCES' });
    const tried = guardedOpens();

    expect(blockedBrowsers()).toEqual([]);
    expect(tried()).toEqual([]);
  });

  it('is empty off macOS', () => {
    setPlatform('win32');
    failWith({ '/fake/Chrome': 'EPERM' });

    expect(blockedBrowsers()).toEqual([]);
  });
});
