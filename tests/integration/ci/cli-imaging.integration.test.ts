/**
 * CLI Integration Test — imaging download with anatomical slice sorting.
 *
 * Runs the BUILT CLI's `--action get-imaging` against fake-mychart and
 * asserts the parts only this flow exercises end to end:
 *
 * - every CLO wrapper decodes strictly (no text-based fallback fires)
 * - the SAG RECON series' five instances come back as five DIFFERENT images
 *   (the fake keys CustomImageServlet on objectUID, like a real server)
 * - the CLI sorts the slices by calibration.orientation.positionPatient —
 *   the fixture positions are deliberately out of instance order, and the
 *   pixel content (a cone sliced along Y) makes the correct order checkable
 *   from the decoded JPEGs: disc area must increase monotonically
 *
 * Requires the docker-compose.ci.yaml fake-mychart on port 4000 and the
 * built CLI (`cd npm-package && bun run build`). Run: bun run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode';

const FAKE_MYCHART_HOST = process.env.CI_FAKE_MYCHART_CLI_HOST || 'localhost:4000';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const CLI_BIN = path.join(PROJECT_ROOT, 'npm-package', 'dist', 'cli.cjs');

// Temp working dir so imaging-output/ and .cookie-cache/ land here, not in the repo.
const TEMP_DIR = fs.mkdtempSync(path.join(PROJECT_ROOT, '.test-cli-imaging-'));

function runCli(args: string[], timeoutMs = 180_000): Promise<{ code: number; stdout: string; stderr: string }> {
  if (!fs.existsSync(CLI_BIN)) {
    throw new Error(`Built CLI binary not found at ${CLI_BIN}. Run: cd npm-package && bun run build`);
  }
  return new Promise((resolve) => {
    const proc = spawn(CLI_BIN, args, {
      cwd: TEMP_DIR,
      env: { ...process.env, HOME: TEMP_DIR },
      timeout: timeoutMs,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    proc.on('error', (err) => resolve({ code: 1, stdout, stderr: stderr + '\n' + err.message }));
  });
}

/** Pixels brighter than mid-gray — the slice's disc, which grows with position. */
async function brightPixelCount(jpgPath: string): Promise<number> {
  const { data } = await sharp(jpgPath).grayscale().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (const v of data) if (v > 128) count++;
  return count;
}

let output = '';
let sagReconDir = '';

beforeAll(async () => {
  await resetFakeMyChart(FAKE_MYCHART_HOST);

  const result = await runCli([
    '--host', FAKE_MYCHART_HOST,
    '--user', 'homer',
    '--pass', 'donuts123',
    '--local',
    '--no-cache',
    '--action', 'get-imaging',
  ]);
  output = result.stdout + result.stderr;
  expect(result.code).toBe(0);

  sagReconDir = path.join(TEMP_DIR, 'imaging-output', FAKE_MYCHART_HOST, 'CT_Head_without_Contrast', 'SAG_RECON');
}, 240_000);

afterAll(() => {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe('CLI get-imaging against fake-mychart', () => {
  it('decodes every wrapper strictly — the text fallback never fires', () => {
    expect(output).not.toContain('AMF3 parsing failed');
    expect(output).not.toContain('falling back to text-based detection');
  });

  it('sorts the SAG RECON slices by anatomical position', () => {
    // Fixture positions span -37.5mm..62.5mm on Y with X and Z constant.
    expect(output).toContain('Sorted 5 slices by y-position (range: 100.0mm)');
    expect(output).not.toContain('Slice sorting failed');
  });

  it('writes five per-instance slices whose disc area grows with sorted position', async () => {
    const files = ['0001.jpg', '0002.jpg', '0003.jpg', '0004.jpg', '0005.jpg'].map((f) =>
      path.join(sagReconDir, f),
    );
    for (const f of files) expect(fs.existsSync(f)).toBe(true);

    // Five different instances → five different images.
    const bytes = files.map((f) => fs.readFileSync(f).toString('base64'));
    expect(new Set(bytes).size).toBe(5);

    // The cone: disc area must increase monotonically once slices are in
    // anatomical order. Download order would break this — the fixture's
    // positions are shuffled on purpose.
    const areas: number[] = [];
    for (const f of files) areas.push(await brightPixelCount(f));
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i]).toBeGreaterThan(areas[i - 1]);
    }
  }, 60_000);
});
