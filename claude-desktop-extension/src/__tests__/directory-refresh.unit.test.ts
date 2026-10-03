/**
 * The extension's monthly directory refresh: a saved run is searched at once, a
 * fresh one is not redone, and a stale or missing one is rerun and saved.
 * Getting this wrong is silent — a list that never refreshes, or a crawl on
 * every launch — so it is pinned here with a stub network.
 */
import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { setTestTransport } from '../../../scrapers/http';
import { clearDirectoryCache, searchMyChartDirectory } from '../../../scrapers/list-all-mycharts/searchDirectory';
import { startDirectoryRefresh } from '../directory-refresh';

const LOGIN_PAGE = '<input name="__RequestVerificationToken">';

function tempCache(saved?: { refreshedAt: string; name: string }): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'directory-refresh-')), 'mychart-instances.json');
  if (saved) {
    const instances = [{ name: saved.name, url: 'https://saved.example/MyChart/', logoUrl: '', slgId: 's1', aliases: [] }];
    fs.writeFileSync(file, JSON.stringify({ refreshedAt: saved.refreshedAt, instances }));
  }
  return file;
}

/** Epic's directory with one organization, whose portal serves a login page. */
function serveDirectory(requests: string[]): void {
  setTestTransport((url) => {
    requests.push(url);
    if (url.includes('/cached-api/help/organizations/')) {
      const organizations = [{ slgId: 'r1', name: 'Refreshed Health', loginUrl: 'https://refreshed.example/MyChart/' }];
      return Promise.resolve(new Response(JSON.stringify({ organizations }), { status: 200 }));
    }
    return Promise.resolve(new Response(LOGIN_PAGE, { status: 200 }));
  });
}

const tick = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) await tick(10);
  expect(condition()).toBe(true);
}

afterEach(() => {
  setTestTransport(null);
  clearDirectoryCache();
});

describe('startDirectoryRefresh', () => {
  it('searches a fresh saved run at once, and does not redo it', async () => {
    const requests: string[] = [];
    serveDirectory(requests);
    startDirectoryRefresh(tempCache({ refreshedAt: new Date().toISOString(), name: 'Saved Health' }));

    const result = await searchMyChartDirectory('Saved Health');
    expect(result.source).toBe('live');
    expect(result.matches[0]?.slgId).toBe('s1');
    await tick(50);
    expect(requests).toEqual([]);
  });

  it('leaves a run that is weeks but not a month old alone', async () => {
    const requests: string[] = [];
    serveDirectory(requests);
    startDirectoryRefresh(tempCache({ refreshedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), name: 'Saved Health' }));
    await tick(50);
    expect(requests).toEqual([]);
  });

  it('reruns a stale saved run in the background, then searches and saves the new one', async () => {
    const requests: string[] = [];
    serveDirectory(requests);
    const cache = tempCache({ refreshedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), name: 'Saved Health' });
    startDirectoryRefresh(cache);

    // The stale run is searched while the new one is under way…
    expect((await searchMyChartDirectory('Saved Health')).matches[0]?.slgId).toBe('s1');
    // …then the new run replaces it: the same refresh as a release, login check and all.
    await until(() => fs.readFileSync(cache, 'utf8').includes('Refreshed Health'));
    expect(requests).toContain('https://refreshed.example/MyChart/');
    expect((await searchMyChartDirectory('Refreshed Health')).matches[0]?.slgId).toBe('r1');
  });

  it('runs a refresh when nothing has been saved yet', async () => {
    const requests: string[] = [];
    serveDirectory(requests);
    const cache = tempCache();
    startDirectoryRefresh(cache);
    await until(() => fs.existsSync(cache));
    expect((await searchMyChartDirectory('Refreshed Health')).source).toBe('live');
  });
});
