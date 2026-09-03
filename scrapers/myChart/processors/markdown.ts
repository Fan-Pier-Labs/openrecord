/**
 * The one generic markdown renderer behind the `standard` and `concise` modes.
 *
 * Generic on purpose: a per-capability template is a second place for a field
 * to go missing. Whatever is in the object is on the page, in the object's key
 * order, so `standard` markdown and `json` are provably the same data.
 *
 * Rendering rules:
 *   - scalars → `- **key**: value`
 *   - arrays of scalars → `- **key**: a, b, c` (`(none)` when empty)
 *   - arrays of flat objects → a table; anything with nested values, long or
 *     multi-line strings → one sub-section per element
 *   - nested objects → a sub-section
 *   - multi-line strings → a paragraph with hard line breaks, so a note reads
 *     as a note rather than one run-on line
 *   - `null` / `undefined` → `(none)`; booleans and numbers verbatim
 */

import { markdownTable } from 'markdown-table';

const MAX_TABLE_CELL = 60;

type Scalar = string | number | boolean | null | undefined;

function isScalar(value: unknown): value is Scalar {
  return value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scalarText(value: Scalar): string {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'string') return value.trim() === '' ? '(empty)' : value;
  return String(value);
}

function cell(value: unknown): string {
  const text = isScalar(value)
    ? scalarText(value)
    : Array.isArray(value)
      ? value.map((v) => (isScalar(v) ? scalarText(v) : JSON.stringify(v))).join(', ')
      : JSON.stringify(value);
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/** A value that can sit in a table cell: a short scalar, or a short list of them. */
function isTabular(value: unknown): boolean {
  if (isScalar(value)) return typeof value !== 'string' || value.length <= MAX_TABLE_CELL;
  if (Array.isArray(value)) return value.every(isScalar) && value.join(', ').length <= MAX_TABLE_CELL;
  return false;
}

function heading(level: number, text: string): string {
  return `${'#'.repeat(Math.min(level, 6))} ${text}`;
}

function paragraph(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('  \n');
}

function renderTable(rows: Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  // markdown-table owns the table syntax; `cell` owns what goes in a cell.
  // Delimiters are not aligned: padding every cell to the widest one in its
  // column turns a 20-visit table into mostly spaces.
  return markdownTable(
    [columns, ...rows.map((row) => columns.map((c) => cell(row[c])))],
    { alignDelimiters: false },
  ).split('\n');
}

function renderArray(key: string, items: unknown[], level: number, out: string[]): void {
  if (items.length === 0) {
    out.push(`- **${key}**: (none)`);
    return;
  }
  if (items.every(isScalar)) {
    out.push(`- **${key}**: ${items.map((v) => scalarText(v)).join(', ')}`);
    return;
  }
  out.push('', heading(level, `${key} (${items.length})`), '');
  const records = items.filter(isRecord);
  if (records.length === items.length && records.every((r) => Object.values(r).every(isTabular))) {
    out.push(...renderTable(records));
    return;
  }
  items.forEach((item, index) => {
    if (isRecord(item)) {
      out.push(heading(level + 1, `${key} ${index + 1}`), '');
      renderObject(item, level + 1, out);
      out.push('');
    } else if (Array.isArray(item)) {
      renderArray(`${key} ${index + 1}`, item, level + 1, out);
    } else {
      out.push(`- ${scalarText(item as Scalar)}`);
    }
  });
}

function renderObject(value: Record<string, unknown>, level: number, out: string[]): void {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    out.push('(empty)');
    return;
  }
  for (const [key, child] of entries) {
    if (isScalar(child)) {
      if (typeof child === 'string' && child.includes('\n')) {
        out.push(`- **${key}**:`, '', paragraph(child), '');
      } else {
        out.push(`- **${key}**: ${scalarText(child)}`);
      }
    } else if (Array.isArray(child)) {
      renderArray(key, child, level + 1, out);
    } else if (isRecord(child)) {
      out.push('', heading(level + 1, key), '');
      renderObject(child, level + 1, out);
    }
  }
}

/**
 * Render any JSON-serializable value as markdown. The optional title is an
 * `#` heading; sections of the value start at `##` either way.
 */
export function renderMarkdown(value: unknown, title?: string): string {
  const out: string[] = [];
  if (title) out.push(heading(1, title), '');
  if (isScalar(value)) {
    out.push(typeof value === 'string' && value.includes('\n') ? paragraph(value) : scalarText(value));
  } else if (Array.isArray(value)) {
    renderArray(title ?? 'items', value, 2, out);
  } else if (isRecord(value)) {
    renderObject(value, 1, out);
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}
