/**
 * Markup to plain text, for the `<field>Text` fields.
 *
 * Markup never leaves `raw` (rule 9 in `docs/processor-layer-proposal.md`).
 * This produces the text the other modes carry, via `html-to-text`: block
 * elements become line breaks, headings sit on their own lines, list items
 * become bullets, tables become aligned columns. cheerio's `.text()` is not
 * enough on its own — it drops every block boundary, so a note's paragraphs,
 * list items and table cells run together into one line.
 *
 * The converter parses to a tree and never re-emits markup, so nothing it
 * returns is ever rendered as HTML downstream.
 */

import { convert, type HtmlToTextOptions } from 'html-to-text';

const OPTIONS: HtmlToTextOptions = {
  wordwrap: false,
  preserveNewlines: false,
  selectors: [
    // MyChart's notes are prose, not shouting: keep headings as written.
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((selector) => ({ selector, options: { uppercase: false } })),
    // A link's href is portal plumbing; its text is the content.
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'img', format: 'skip' },
    { selector: 'ul', options: { itemPrefix: '- ' } },
    { selector: 'ol', options: { itemPrefix: '- ' } },
    // Lab and visit tables read as columns; header cells stay as written.
    { selector: 'table', format: 'dataTable', options: { uppercaseHeaderCells: false } },
  ],
};

/** HTML (a fragment or a whole document) as plain text. */
export function htmlToText(html: string): string {
  if (!html) return '';
  return convert(html, OPTIONS).trim();
}
