/**
 * `--action get-imaging` end to end: the BUILT CLI against the CI fake-mychart.
 *
 * The unit test mocks executeCapability, which is how a listing-shape mismatch
 * (`{ orders }` iterated as an array) shipped with every unit test green. This
 * runs the real capability chain and the real decoder, so the shape the CLI
 * reads is the shape the processor actually returns.
 *
 * Requires `cd npm-package && bun run build` and the docker-compose.ci.yaml
 * fake-mychart on port 4000.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode';

const HOST = process.env.CI_FAKE_MYCHART_CLI_HOST || 'localhost:4000';
const CLI_BIN = path.resolve(__dirname, '..', '..', 'dist', 'cli.cjs');
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-get-imaging-'));
const OUTPUT_DIR = path.join(TEMP_DIR, 'imaging-output');

beforeAll(async () => {
  if (!fs.existsSync(CLI_BIN)) {
    throw new Error(`Built CLI binary not found at ${CLI_BIN}. Run: cd npm-package && bun run build`);
  }
  await resetFakeMyChart(HOST);
});

afterAll(() => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe('mychart-cli --action get-imaging against fake-mychart', () => {
  it('lists every study, then downloads and decodes each one with pictures', () => {
    const result = spawnSync(
      CLI_BIN,
      ['--host', HOST, '--user', 'homer', '--pass', 'donuts123', '--local', '--no-cache',
        '--action', 'get-imaging', '--output', OUTPUT_DIR],
      // HOME redirected so the cookie cache and credential stores land in the temp dir.
      { cwd: TEMP_DIR, env: { ...process.env, HOME: TEMP_DIR }, encoding: 'utf-8', timeout: 120_000 },
    );
    const output = result.stdout + result.stderr;
    expect(output).not.toContain('is not iterable');
    expect(result.status).toBe(0);

    const hostDir = path.join(OUTPUT_DIR, HOST);
    const orders = JSON.parse(fs.readFileSync(path.join(hostDir, 'all-imaging.json'), 'utf-8')) as Array<{
      orderName: string;
      image_id: string | null;
    }>;
    const withPictures = orders.filter((order) => order.image_id);
    expect(withPictures.length).toBeGreaterThan(0);
    expect(output).toContain(`${orders.length} imaging result(s)`);
    for (const order of withPictures) {
      expect(output).toContain(`${order.orderName}: wrote `);
      expect(output).not.toContain(`${order.orderName}: wrote 0 of`);
    }

    const jpegs = fs.readdirSync(hostDir).filter((name) => name.endsWith('.jpg'));
    expect(jpegs.length).toBeGreaterThan(0);
    for (const name of jpegs) {
      const bytes = fs.readFileSync(path.join(hostDir, name));
      expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    }
  }, 120_000);
});
