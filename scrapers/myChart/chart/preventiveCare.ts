import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../core/myChartRequest";
import * as cheerio from 'cheerio';

export type PreventiveCareItem = {
  name: string;
  status: 'overdue' | 'not_due' | 'completed' | 'unknown';
  overdueSince: string;
  notDueUntil: string;
  previouslyDone: string[];
  completedDate: string;
}

type StatusDetails = {
  status: PreventiveCareItem['status'];
  overdueSince: string;
  notDueUntil: string;
  completedDate: string;
}

const EMPTY_STATUS: StatusDetails = {
  status: 'unknown',
  overdueSince: '',
  notDueUntil: '',
  completedDate: '',
};

// The page's own title, which sits in the same text flow as the screening
// names. Pairing it with the text that follows is what produced the synthetic
// record this parser replaced, so it is the one piece of chrome worth naming.
const PAGE_TITLES = new Set(['preventive care', 'health advisories']);

// "Overdue since 01/01/2024", the bare badge "Overdue", etc. Returns undefined
// for anything that isn't a status, which is also how a screening name is told
// apart from the status text that follows it.
function parseStatus(text: string): StatusDetails | undefined {
  const overdueSince = /^overdue since\s+(.+)$/i.exec(text);
  if (overdueSince) return { ...EMPTY_STATUS, status: 'overdue', overdueSince: overdueSince[1]!.trim() };

  const notDueUntil = /^not due until\s+(.+)$/i.exec(text);
  if (notDueUntil) return { ...EMPTY_STATUS, status: 'not_due', notDueUntil: notDueUntil[1]!.trim() };

  const completedOn = /^completed on\s+(.+)$/i.exec(text);
  if (completedOn) return { ...EMPTY_STATUS, status: 'completed', completedDate: completedOn[1]!.trim() };

  const bare = text.trim().toLowerCase();
  if (bare === 'overdue') return { ...EMPTY_STATUS, status: 'overdue' };
  if (bare === 'not due' || bare === 'due') return { ...EMPTY_STATUS, status: 'not_due' };
  if (bare === 'completed') return { ...EMPTY_STATUS, status: 'completed' };

  return undefined;
}

// A row can carry both a badge ("Overdue") and a dated phrase ("Overdue since
// 01/01/2024"); keep whichever pieces actually said something.
function mergeStatus(acc: StatusDetails, next: StatusDetails): StatusDetails {
  return {
    status: next.status !== 'unknown' ? next.status : acc.status,
    overdueSince: next.overdueSince || acc.overdueSince,
    notDueUntil: next.notDueUntil || acc.notDueUntil,
    completedDate: next.completedDate || acc.completedDate,
  };
}

function parsePreviouslyDone(text: string): string[] | undefined {
  const match = /previously done:\s*(.+)$/i.exec(text);
  if (!match) return undefined;
  return match[1]!.split(',').map(d => d.trim()).filter(d => d.length > 0);
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Text-flow pages have no structure saying which line is a name, so a name is
// whatever isn't already something else: a status, a previously-done list, a
// bare date belonging to the line above, or the page's own title.
function isScreeningName(line: string): boolean {
  if (line.length === 0) return false;
  if (PAGE_TITLES.has(line.toLowerCase())) return false;
  if (parseStatus(line)) return false;
  if (parsePreviouslyDone(line)) return false;
  if (/^[\d/\-.\s]+$/.test(line)) return false;
  return true;
}

// Rows first: one <tr> is one screening, so the name, the status badge and the
// detail text can't be mistaken for a neighbour's. The row's own structure says
// which cell is the name — no guessing at what a screening is or isn't.
function parseRows($: cheerio.CheerioAPI): PreventiveCareItem[] {
  const items: PreventiveCareItem[] = [];

  $('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return; // header row

    const name = clean($(cells[0]).text());
    if (name.length === 0 || parseStatus(name)) return;

    let details = EMPTY_STATUS;
    const previouslyDone: string[] = [];
    cells.each((_i, cell) => {
      const text = clean($(cell).text());
      const status = parseStatus(text);
      if (status) details = mergeStatus(details, status);
      const done = parsePreviouslyDone(text);
      if (done) previouslyDone.push(...done);
    });

    // A table on the page that has nothing to do with advisories won't have a
    // status anywhere in the row, and isn't a record. This also drops a header
    // row built from <td> rather than <th>.
    if (details.status === 'unknown') return;

    items.push({ name, ...details, previouslyDone });
  });

  return items;
}

// Block-level elements don't contribute whitespace to `.text()`, so sibling
// cells and paragraphs come back glued together as one line. Separating them
// first is what keeps unrelated records from merging into one string.
function blockSeparatedText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer').remove();
  $('br, td, th, tr, li, p, div, section, article, h1, h2, h3, h4, h5, h6, span').each((_, el) => {
    $(el).after('\n');
  });
  return $('body').text();
}

// Fallback for a page that renders advisories as flowing text rather than a
// table: a screening name on one line, its status on the next.
function parseLines(html: string): PreventiveCareItem[] {
  const lines = blockSeparatedText(html)
    .split('\n')
    .map(l => clean(l))
    .filter(l => l.length > 0);

  const items: PreventiveCareItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const name = lines[i]!; // loop condition guarantees i < lines.length
    if (!isScreeningName(name)) continue;

    const next = lines[i + 1];
    const details = next === undefined ? undefined : parseStatus(next);
    if (!details) continue;

    const previouslyDone: string[] = [];
    for (let j = i + 2; j < Math.min(i + 6, lines.length); j++) {
      const done = parsePreviouslyDone(lines[j]!); // j < lines.length per loop bound
      if (done) {
        previouslyDone.push(...done);
        break;
      }
    }

    items.push({ name, ...details, previouslyDone });
  }

  return items;
}

export async function getPreventiveCare(mychartRequest: MyChartRequest): Promise<PreventiveCareItem[]> {
  const resp = await makeAuthenticatedRequest(mychartRequest, { path: '/HealthAdvisories' });
  const html = await resp.text();

  const rowItems = parseRows(cheerio.load(html));
  if (rowItems.length > 0) return rowItems;

  return parseLines(html);
}
