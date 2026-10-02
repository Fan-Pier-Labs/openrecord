/** `--action export` against fake-mychart: the whole chart lands in a new folder under --output. */
import { beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { myChartUserPassLogin } from '../../../scrapers/myChart/auth/login';
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode';
import { exportAccount } from '../capabilityActions';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

describe('exportAccount', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('writes the export under --output and reports success', async () => {
    const login = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' });
    if (login.state !== 'logged_in') throw new Error(`homer login failed: ${login.state}`);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-export-'));

    expect(await exportAccount({ hostname: HOST, request: login.mychartRequest }, undefined, { outputDir: out })).toBe(true);

    const [dir] = fs.readdirSync(out);
    expect(dir).toStartWith('OpenRecord export - ');
    expect(JSON.parse(fs.readFileSync(path.join(out, dir!, 'index.json'), 'utf8')).items.length).toBeGreaterThan(0);
  }, 120_000);

  it('fails cleanly when the output directory cannot be created', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-export-')), 'not-a-dir');
    fs.writeFileSync(file, '');
    const session = { hostname: HOST, request: null as never };
    expect(await exportAccount(session, undefined, { outputDir: file })).toBe(false);
  });
});
