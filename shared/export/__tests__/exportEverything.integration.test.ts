/**
 * The whole-chart export against fake-mychart: every kind of drill-down lands
 * on disk, and a patient mismatch refuses every read instead of exporting
 * someone else's chart.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { myChartUserPassLogin } from '../../../scrapers/myChart/auth/login';
import type { MyChartRequest } from '../../../scrapers/myChart/core/myChartRequest';
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode';
import { exportEverything, type ExportIndex } from '../exportEverything';
import { nodeExportFolder } from '../nodeExportFolder';
import { listExportItems, organizeExport } from '../organizeExport';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

async function loginHomer(): Promise<MyChartRequest> {
  const result = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' });
  if (result.state !== 'logged_in') throw new Error(`homer login failed: ${result.state}`);
  return result.mychartRequest;
}

describe('exportEverything against fake-mychart', () => {
  let dir: string;
  let index: ExportIndex;

  beforeAll(async () => {
    await resetFakeMyChart(HOST);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-export-'));
    index = await exportEverything(await loginHomer(), nodeExportFolder(dir), { hostname: HOST });
  }, 120_000);

  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');
  const item = (category: string, predicate: (files: string[]) => boolean = () => true) =>
    index.items.find((i) => i.category === category && predicate(i.files));

  it('writes every category as data, plus the README and the index last', () => {
    expect(fs.existsSync(path.join(dir, 'data/get_lab_results.json'))).toBe(true);
    expect(read('data/get_medications.md')).toContain('# Medications');
    expect(read('README.md')).toContain('# Medical record export');
    expect(JSON.parse(read('index.json')).items).toHaveLength(index.items.length);
  });

  it('puts each visit’s notes inside its record', () => {
    const visit = index.items.find((i) => i.category === 'Visit' && i.title === 'Annual Physical' && i.date === '2026-01-10')!;
    expect(read(visit.files[0]!)).toContain('# Progress Note');
    expect(visit.about).toContain('Note:');
  });

  it('saves documents, statements and attachments beside their records', () => {
    for (const category of ['Document', 'Billing statement', 'Message']) {
      const withFile = item(category, (files) => files.length > 1)!;
      expect(withFile).toBeDefined();
      expect(fs.statSync(path.join(dir, withFile.files[1]!)).size).toBeGreaterThan(0);
    }
  });

  it('decodes imaging studies to JPEGs', () => {
    const study = item('Imaging', (files) => files.some((f) => f.endsWith('.jpg')))!;
    const jpeg = fs.readFileSync(path.join(dir, study.files.find((f) => f.endsWith('.jpg'))!));
    expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
  });

  it('groups the finished export by the ids it lists', async () => {
    const folder = nodeExportFolder(dir);
    const { items } = await listExportItems(folder);
    const ids = items.filter((line) => /cholesterol|lipid/i.test(line)).map((line) => line.split(' | ')[0]!);
    expect(ids.length).toBeGreaterThan(1);
    await organizeExport(folder, [{ name: 'Cholesterol', item_ids: ids }]);
    expect(read('By health issue/Cholesterol.md')).toContain(`${ids.length} records`);
  });

  it('refuses every read when the active patient is not the one asked for', async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-export-'));
    const refused = await exportEverything(await loginHomer(), nodeExportFolder(other), { hostname: HOST, patient: 'Bart' });
    expect(refused.items).toEqual([]);
    expect(refused.failures.length).toBeGreaterThan(0);
    expect(refused.failures.every((f) => f.error.includes('switch_proxy_target'))).toBe(true);
    expect(fs.existsSync(path.join(other, 'data'))).toBe(false);
  });
});
