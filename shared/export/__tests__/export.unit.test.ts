import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { EXPORT_FORMAT, prune, relativeFrom, toIsoDate, type ExportFolder, type ExportIndex } from '../exportEverything';
import { ISSUES_DIR, listExportItems, organizeExport } from '../organizeExport';
import { createExportDir, nodeExportFolder } from '../nodeExportFolder';

function memoryFolder(files: Record<string, string> = {}): ExportFolder & { files: Record<string, string> } {
  return {
    files,
    async write(p, data) {
      files[p] = typeof data === 'string' ? data : `<${data.length} bytes>`;
    },
    async read(p) {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p]!;
    },
  };
}

function exportWith(items: ExportIndex['items']) {
  const index: ExportIndex = { format: EXPORT_FORMAT, hostname: 'h', patient: 'me', exportedAt: '2026-01-01T00:00:00Z', items, failures: [] };
  return memoryFolder({ 'index.json': JSON.stringify(index) });
}

describe('toIsoDate', () => {
  it('reads every date shape MyChart uses, without shifting a local date across UTC', () => {
    expect(toIsoDate('2026-01-10T14:00:00.000Z')).toBe('2026-01-10');
    expect(toIsoDate('1/5/2026')).toBe('2026-01-05');
    expect(toIsoDate('01/10/2026 09:00:00 AM')).toBe('2026-01-10');
    expect(toIsoDate('Jan 10, 2026')).toBe('2026-01-10');
    expect(toIsoDate(`/Date(${new Date(2026, 0, 10, 12).getTime()})/`)).toBe('2026-01-10');
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate('soon')).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });
});

describe('prune', () => {
  it('drops null, empty strings and empty collections but keeps false and 0', () => {
    expect(prune({ a: null, b: '', c: [], d: {}, e: false, f: 0, g: { h: '' }, i: [null, 'x'] })).toEqual({ e: false, f: 0, i: ['x'] });
    expect(prune({ a: null })).toBeUndefined();
  });
});

describe('relativeFrom', () => {
  it('links between export files', () => {
    expect(relativeFrom(`${ISSUES_DIR}/Knee.md`, 'records/Visits/a.md')).toBe('../records/Visits/a.md');
    expect(relativeFrom('records/Imaging/x.md', 'records/Imaging/x - images/001.jpg')).toBe('x - images/001.jpg');
    expect(relativeFrom('README.md', 'records/a.md')).toBe('records/a.md');
  });
});

describe('organizeExport', () => {
  const items: ExportIndex['items'] = [
    { id: 'visit-1', category: 'Visit', date: '2026-03-01', title: 'Orthopedics', about: 'knee pain', files: ['records/Visits/2026-03-01 Orthopedics.md'] },
    { id: 'imaging-1', category: 'Imaging', date: '2026-02-01', title: 'MRI Knee', about: '', files: ['records/Imaging/2026-02-01 MRI Knee.md', 'records/Imaging/2026-02-01 MRI Knee - images/001.jpg'] },
    { id: 'bill-1', category: 'Bill', date: null, title: 'Office | visit', about: '', files: ['records/Billing/undated Office visit.md'] },
    { id: 'lab-1', category: 'Lab result', date: '2025-01-01', title: 'A1c', about: '', files: ['records/Lab results/2025-01-01 A1c.md'] },
  ];

  it('writes one dated timeline per issue, linking into records/', async () => {
    const folder = exportWith(items);
    const result = await organizeExport(folder, [{ name: 'Right knee', summary: 'Torn meniscus.', item_ids: ['visit-1', 'imaging-1', 'bill-1', 'bill-1'] }]);
    expect(result.unknownIds).toEqual([]);
    expect(result.ungrouped).toBe(1);

    const page = folder.files[`${ISSUES_DIR}/Right knee.md`]!;
    expect(page).toContain('Torn meniscus.');
    expect(page).toContain('3 records, 2026-02-01 to 2026-03-01.');
    // Undated first, then oldest to newest; a pipe in a title can't break the table.
    expect(page.indexOf('Office \\| visit')).toBeLessThan(page.indexOf('MRI Knee'));
    expect(page.indexOf('MRI Knee')).toBeLessThan(page.indexOf('Orthopedics'));
    expect(page).toContain('(<../records/Imaging/2026-02-01 MRI Knee.md>)');
    expect(page).toContain('| 1 file |');

    const overview = folder.files[`${ISSUES_DIR}/README.md`]!;
    expect(overview).toContain('[Right knee](<Right knee.md>) | 3');
    expect(overview).toContain('Not under any issue (1)');
    expect(overview).toContain('A1c');
  });

  it('reports ids that are not in the export instead of inventing records', async () => {
    const folder = exportWith(items);
    const result = await organizeExport(folder, [{ name: 'Knee', item_ids: ['visit-1', 'visit-99'] }]);
    expect(result.unknownIds).toEqual(['visit-99']);
  });

  it('keeps two issues that sanitize to the same file name apart', async () => {
    const folder = exportWith(items);
    const result = await organizeExport(folder, [{ name: 'Knee/left', item_ids: [] }, { name: 'Knee:left', item_ids: [] }]);
    expect(result.pages).toEqual([`${ISSUES_DIR}/README.md`, `${ISSUES_DIR}/Knee_left.md`, `${ISSUES_DIR}/Knee_left (2).md`]);
  });

  it('refuses a folder that is not a finished export', async () => {
    await expect(organizeExport(memoryFolder(), [{ name: 'x', item_ids: [] }])).rejects.toThrow(/not finished|not an OpenRecord export/);
    await expect(organizeExport(memoryFolder({ 'index.json': '{"format":"other"}' }), [{ name: 'x', item_ids: [] }])).rejects.toThrow(
      /not an OpenRecord export/,
    );
  });
});

describe('listExportItems', () => {
  it('pages through one line per record', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `lab-${i + 1}`, category: 'Lab result', date: null, title: `T${i}`, about: '', files: [] }));
    const folder = exportWith(items);
    const first = await listExportItems(folder, 0, 3);
    expect(first).toEqual({ total: 5, items: ['lab-1 | undated | Lab result | T0', 'lab-2 | undated | Lab result | T1', 'lab-3 | undated | Lab result | T2'], nextOffset: 3 });
    expect((await listExportItems(folder, 3, 3)).nextOffset).toBeNull();
  });
});

describe('nodeExportFolder', () => {
  it('writes nested files and refuses to climb out of the export', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'export-'));
    const dir = createExportDir(base, 'x');
    expect(createExportDir(base, 'x')).toBe(path.join(base, 'x (2)'));
    const folder = nodeExportFolder(dir);
    await folder.write('records/Visits/a.md', 'hi');
    expect(await folder.read('records/Visits/a.md')).toBe('hi');
    await expect(folder.write('../escape.md', 'no')).rejects.toThrow(/outside the export/);
    expect(fs.existsSync(path.join(base, 'escape.md'))).toBe(false);
  });
});
