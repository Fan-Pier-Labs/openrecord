/**
 * Group an export's records by health issue — "everything about my shoulder":
 * the visits, notes, labs, imaging, messages and bills, in date order.
 *
 * Deciding which record belongs to which issue is the model's job — a bill
 * says "Office visit", not "shoulder", and only something reading the visit it
 * came from can tell. Everything else is deterministic: the model hands back
 * item ids from {@link listExportItems}, and this writes the pages, so a
 * grouping can only ever point at records that exist.
 */

import {
  EXPORT_FORMAT,
  EXPORT_INDEX_FILE,
  relativeFrom,
  type ExportFolder,
  type ExportIndex,
  type ExportItem,
} from './exportEverything';
import { safeFileName } from '../../scrapers/myChart/core/safeFileName';

export const ISSUES_DIR = 'By health issue';

export interface IssueGroup {
  name: string;
  /** A sentence or two on what the issue is and how it went. */
  summary?: string | undefined;
  item_ids: string[];
}

async function readExportIndex(folder: ExportFolder): Promise<ExportIndex> {
  let index: ExportIndex;
  try {
    index = JSON.parse(await folder.read(EXPORT_INDEX_FILE)) as ExportIndex;
  } catch {
    throw new Error(
      `No ${EXPORT_INDEX_FILE} in that folder. It is not an OpenRecord export, or the export has not finished yet.`,
    );
  }
  if (index.format !== EXPORT_FORMAT) throw new Error(`${EXPORT_INDEX_FILE} is not an OpenRecord export (${String(index.format)}).`);
  return index;
}

/** One line per record — compact enough that a whole chart fits in front of a model a page at a time. */
function formatExportItem(item: ExportItem): string {
  return [item.id, item.date ?? 'undated', item.category, item.title, item.about].filter(Boolean).join(' | ');
}

export async function listExportItems(
  folder: ExportFolder,
  offset = 0,
  limit = 400,
): Promise<{ total: number; items: string[]; nextOffset: number | null }> {
  const { items } = await readExportIndex(folder);
  const page = items.slice(offset, offset + limit);
  return {
    total: items.length,
    items: page.map(formatExportItem),
    nextOffset: offset + limit < items.length ? offset + limit : null,
  };
}

function timeline(page: string, items: ExportItem[]): string[] {
  const sorted = [...items].sort((a, b) => (a.date ?? '0000').localeCompare(b.date ?? '0000'));
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  return [
    '| Date | Type | Record | Files |',
    '| --- | --- | --- | --- |',
    ...sorted.map((item) => {
      const [record, ...rest] = item.files.map((f) => relativeFrom(page, f));
      const extra = rest.length ? `${rest.length} file${rest.length === 1 ? '' : 's'}` : '';
      return `| ${item.date ?? '—'} | ${item.category} | [${cell(item.title)}](<${record}>)${item.about ? ` — ${cell(item.about)}` : ''} | ${extra} |`;
    }),
  ];
}

export async function organizeExport(
  folder: ExportFolder,
  groups: readonly IssueGroup[],
): Promise<{ pages: string[]; unknownIds: string[]; ungrouped: number }> {
  if (!groups.length) throw new Error('Pass at least one group.');
  const index = await readExportIndex(folder);
  const byId = new Map(index.items.map((item) => [item.id, item]));
  const unknownIds: string[] = [];
  const grouped = new Set<string>();
  const usedNames = new Set<string>();
  const pages: Array<{ group: IssueGroup; path: string; items: ExportItem[] }> = [];

  for (const group of groups) {
    const items: ExportItem[] = [];
    for (const id of new Set(group.item_ids)) {
      const item = byId.get(id);
      if (item) {
        items.push(item);
        grouped.add(id);
      } else {
        unknownIds.push(id);
      }
    }
    let name = safeFileName(group.name, 'Issue');
    for (let n = 2; usedNames.has(name.toLowerCase()); n++) name = `${safeFileName(group.name, 'Issue')} (${n})`;
    usedNames.add(name.toLowerCase());
    pages.push({ group, path: `${ISSUES_DIR}/${name}.md`, items });
  }

  for (const { group, path, items } of pages) {
    const dates = items.map((i) => i.date).filter((d): d is string => !!d).sort();
    await folder.write(
      path,
      [
        `# ${group.name}`,
        '',
        ...(group.summary ? [group.summary, ''] : []),
        `${items.length} records${dates.length ? `, ${dates[0]} to ${dates[dates.length - 1]}` : ''}.`,
        '',
        ...timeline(path, items),
        '',
      ].join('\n'),
    );
  }

  const ungrouped = index.items.filter((item) => !grouped.has(item.id));
  const overview = `${ISSUES_DIR}/README.md`;
  await folder.write(
    overview,
    [
      '# By health issue',
      '',
      'Grouped by Claude from the records in this export. A record can sit under more than one issue;',
      'the files themselves stay in `records/`, and every link here points there.',
      '',
      '| Issue | Records |',
      '| --- | --- |',
      ...pages.map(({ group, path, items }) => `| [${group.name}](<${relativeFrom(overview, path)}>) | ${items.length} |`),
      '',
      `## Not under any issue (${ungrouped.length})`,
      '',
      ...(ungrouped.length ? timeline(overview, ungrouped) : ['Every record is under at least one issue.']),
      '',
    ].join('\n'),
  );
  await folder.write(`${ISSUES_DIR}/groups.json`, JSON.stringify(groups, null, 2));

  return { pages: [overview, ...pages.map((p) => p.path)], unknownIds, ungrouped: ungrouped.length };
}
