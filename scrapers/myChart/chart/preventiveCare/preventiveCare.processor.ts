/**
 * Preventive care processor. Field decisions: docs/processor-layer-proposal.md, `get_preventive_care`.
 *
 * The payload is `POST /HealthAdvisories/GetTopics`, whose envelope is
 * `{ HealthAdvisoryViewModelList, HealthAdvisorySettings }` — captured live on
 * one instance (`/MyChart-PRD`, 13 topics). Topics pass through whole under a
 * derived `dueStatus`, rather than through a fixed field list: one instance is
 * not enough evidence to fix that list, and a list built from one capture
 * silently drops whatever a second Epic release adds.
 *
 * **`HealthAdvisoryViewModelList` absent is not "no screenings due".** The
 * controller reads a non-empty `Text` as the error surface and a null list as
 * "none" (`healthadvisoriescontroller.min.js`), so a null or empty list is a
 * real answer and anything else — a failed request, an error `Text`, an
 * envelope without the key — is named in `unavailable` instead. That
 * distinction is the whole bug this file was rewritten for: `/HealthAdvisories`
 * is a client-rendered shell on that instance (zero `<table>` elements in
 * 111KB of page), and parsing it for a table returned `items: []` for a chart
 * that has 13 advisories.
 *
 * The HTML parser is kept as a fallback for an instance that still renders the
 * table server-side. No captured instance does, so it fills only the fields a
 * table row can prove and is reached only when the API did not answer.
 */

import * as cheerio from 'cheerio';
import { answered, findRequest, type RawResponse } from '../../core/rawResponse';
import { htmlToText } from '../../processors/htmlText';
import type { Processor } from '../../processors/processor';
import { list, rec, text } from '../../processors/read';

export const ADVISORIES_PAGE_PATH = '/HealthAdvisories';
export const GET_TOPICS_PATH = '/HealthAdvisories/GetTopics';

/**
 * `StatusCode` normalized. The nine codes are the client's own switch; the
 * four marked below are the ones seen on the wire, and an unrecognized or
 * custom code (Epic's `<code>^<display text>` form) comes out `unknown` rather
 * than being guessed at.
 */
export type PreventiveCareStatus =
  | 'overdue' // 100_OVERDUE — observed
  | 'due'
  | 'due_soon'
  | 'postponed'
  | 'not_due' // 500_NOTDUE — observed
  | 'addressed'
  | 'satisfied' // 700_SATISFIED — observed
  | 'aged_out' // 800_AGED_OUT — observed
  | 'excluded'
  | 'unknown';

const STATUS_BY_CODE: Record<string, PreventiveCareStatus> = {
  '100_OVERDUE': 'overdue',
  '200_DUE': 'due',
  '300_DUESOON': 'due_soon',
  '400_POSTPONED': 'postponed',
  '500_NOTDUE': 'not_due',
  '600_ADDRESSED': 'addressed',
  '700_SATISFIED': 'satisfied',
  '800_AGED_OUT': 'aged_out',
  '900_EXCLUDED': 'excluded',
};

/** A topic as MyChart sent it, plus the one field this processor computes. */
export type PreventiveCareItemStandard = Record<string, unknown> & { dueStatus: PreventiveCareStatus };

export interface PreventiveCareStandard {
  /** `HealthAdvisoryViewModelList`, pass-through, each with a derived `dueStatus`. */
  items: PreventiveCareItemStandard[];
  /** `HealthAdvisorySettings`, pass-through. */
  settings: Record<string, unknown>;
  /**
   * Derived: what did not answer, by path. Non-empty means the item list is
   * "not known", not "empty" — see the note above.
   */
  unavailable: string[];
}

/** `StatusCode` → {@link PreventiveCareStatus}. Epic's custom `<code>^<text>` form has no known meaning. */
export function statusFromCode(code: unknown): PreventiveCareStatus {
  return STATUS_BY_CODE[text(code).trim().toUpperCase()] ?? 'unknown';
}

// ── The server-rendered fallback ────────────────────────────────────────────

// The page's own title, which sits in the same text flow as the screening
// names. Pairing it with the text that follows is what produced the synthetic
// record this parser replaced, so it is the one piece of chrome worth naming.
const PAGE_TITLES = new Set(['preventive care', 'health advisories']);

/** What a table row can prove, under the field names GetTopics uses for the same facts. */
interface PageStatus {
  dueStatus: PreventiveCareStatus;
  FormattedDueDate: string;
  FormattedLastDoneDate: string;
}

const EMPTY_STATUS: PageStatus = { dueStatus: 'unknown', FormattedDueDate: '', FormattedLastDoneDate: '' };

// "Overdue since 01/01/2024", the bare badge "Overdue", etc. Returns undefined
// for anything that isn't a status, which is also how a screening name is told
// apart from the status text that follows it. A "Completed" badge maps to
// `satisfied`: it is the same fact `700_SATISFIED` records, and keeping one
// vocabulary is what lets a caller read either source the same way.
function parseStatus(line: string): PageStatus | undefined {
  const overdueSince = /^overdue since\s+(.+)$/i.exec(line);
  if (overdueSince) return { ...EMPTY_STATUS, dueStatus: 'overdue', FormattedDueDate: overdueSince[1]!.trim() };

  const notDueUntil = /^not due until\s+(.+)$/i.exec(line);
  if (notDueUntil) return { ...EMPTY_STATUS, dueStatus: 'not_due', FormattedDueDate: notDueUntil[1]!.trim() };

  const completedOn = /^completed on\s+(.+)$/i.exec(line);
  if (completedOn) return { ...EMPTY_STATUS, dueStatus: 'satisfied', FormattedLastDoneDate: completedOn[1]!.trim() };

  const bare = line.trim().toLowerCase();
  if (bare === 'overdue') return { ...EMPTY_STATUS, dueStatus: 'overdue' };
  if (bare === 'due') return { ...EMPTY_STATUS, dueStatus: 'due' };
  if (bare === 'not due') return { ...EMPTY_STATUS, dueStatus: 'not_due' };
  if (bare === 'completed') return { ...EMPTY_STATUS, dueStatus: 'satisfied' };

  return undefined;
}

// A row can carry both a badge ("Overdue") and a dated phrase ("Overdue since
// 01/01/2024"); keep whichever pieces actually said something.
function mergeStatus(acc: PageStatus, next: PageStatus): PageStatus {
  return {
    dueStatus: next.dueStatus !== 'unknown' ? next.dueStatus : acc.dueStatus,
    FormattedDueDate: next.FormattedDueDate || acc.FormattedDueDate,
    FormattedLastDoneDate: next.FormattedLastDoneDate || acc.FormattedLastDoneDate,
  };
}

function parsePreviouslyDone(line: string): string[] | undefined {
  const match = /previously done:\s*(.+)$/i.exec(line);
  if (!match) return undefined;
  return match[1]!.split(',').map((d) => d.trim()).filter((d) => d.length > 0);
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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

function pageItem(Name: string, status: PageStatus, FormattedDoneDates: string[]): PreventiveCareItemStandard {
  return { Name, ...status, FormattedDoneDates };
}

// Rows first: one <tr> is one screening, so the name, the status badge and the
// detail text can't be mistaken for a neighbour's. The row's own structure says
// which cell is the name — no guessing at what a screening is or isn't.
function parseRows($: cheerio.CheerioAPI): PreventiveCareItemStandard[] {
  const items: PreventiveCareItemStandard[] = [];

  $('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length === 0) return; // header row

    const name = clean($(cells[0]).text());
    if (name.length === 0 || parseStatus(name)) return;

    let details = EMPTY_STATUS;
    const doneDates: string[] = [];
    cells.each((_i, cellEl) => {
      const cellText = clean($(cellEl).text());
      const status = parseStatus(cellText);
      if (status) details = mergeStatus(details, status);
      const done = parsePreviouslyDone(cellText);
      if (done) doneDates.push(...done);
    });

    // A table on the page that has nothing to do with advisories won't have a
    // status anywhere in the row, and isn't a record. This also drops a header
    // row built from <td> rather than <th>.
    if (details.dueStatus === 'unknown') return;

    items.push(pageItem(name, details, doneDates));
  });

  return items;
}

// Fallback for a page that renders advisories as flowing text rather than a
// table: a screening name on one line, its status on the next. The canonical
// converter keeps block boundaries as line breaks and table cells as tabs;
// the cells become lines too, since this parser pairs line with line.
function parseLines(html: string): PreventiveCareItemStandard[] {
  const $ = cheerio.load(html);
  $('nav, header, footer').remove();
  const lines = htmlToText($.html())
    .split(/[\n\t]/)
    .map((l) => clean(l))
    .filter((l) => l.length > 0);

  const items: PreventiveCareItemStandard[] = [];

  for (let i = 0; i < lines.length; i++) {
    const name = lines[i]!; // loop condition guarantees i < lines.length
    if (!isScreeningName(name)) continue;

    const next = lines[i + 1];
    const details = next === undefined ? undefined : parseStatus(next);
    if (!details) continue;

    const doneDates: string[] = [];
    for (let j = i + 2; j < Math.min(i + 6, lines.length); j++) {
      const done = parsePreviouslyDone(lines[j]!); // j < lines.length per loop bound
      if (done) {
        doneDates.push(...done);
        break;
      }
    }

    items.push(pageItem(name, details, doneDates));
  }

  return items;
}

/** Parse a server-rendered advisories page. Exported for tests. */
export function parsePreventiveCareHtml(html: string): PreventiveCareItemStandard[] {
  const rowItems = parseRows(cheerio.load(html));
  if (rowItems.length > 0) return rowItems;
  return parseLines(html);
}

// ── The processor ───────────────────────────────────────────────────────────

/** Concise keeps the screening, where it stands and the two dates that say why. */
const CONCISE_FIELDS = ['Name', 'dueStatus', 'Status', 'FormattedDueDate', 'FormattedLastDoneDate'] as const;

export const preventiveCareProcessor: Processor<PreventiveCareStandard> = {
  standard(raw: RawResponse): PreventiveCareStandard {
    const topics = findRequest(raw, GET_TOPICS_PATH);
    const envelope = answered(topics) ? rec(topics.body) : {};

    // The controller's own test for the error surface: a non-empty `Text`.
    // A successful response carries no `Text` key at all.
    const known =
      answered(topics) && text(envelope.Text).length === 0 && 'HealthAdvisoryViewModelList' in envelope;

    if (known) {
      return {
        items: list(envelope.HealthAdvisoryViewModelList).map((topic) => {
          const t = rec(topic);
          return { ...t, dueStatus: statusFromCode(t.StatusCode) };
        }),
        settings: rec(envelope.HealthAdvisorySettings),
        unavailable: [],
      };
    }

    // GetTopics did not answer with a list. The page is the only other source,
    // and on every captured instance it is a client-rendered shell with no
    // table in it — so an empty result here is reported as a gap, never as a
    // chart with no screenings due.
    const page = findRequest(raw, ADVISORIES_PAGE_PATH);
    return {
      items: parsePreventiveCareHtml(text(answered(page) ? page.body : undefined)),
      settings: {},
      unavailable: [GET_TOPICS_PATH],
    };
  },

  concise(standard) {
    return {
      items: standard.items.map((item) =>
        Object.fromEntries(CONCISE_FIELDS.map((field) => [field, item[field] ?? ''])),
      ),
      unavailable: standard.unavailable,
    };
  },
};
