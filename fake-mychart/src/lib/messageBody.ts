/**
 * Wrap message text in the markup real MyChart serves for a message body.
 *
 * Epic never stores or returns a bare string here. A message the patient typed
 * as plain text comes back from GetConversationList as a `div.fmtConv` wrapper
 * holding one `<div data-paragraph="N">` per paragraph, each paragraph's words
 * inside a `<span>` carrying the inline font/colour styling, a blank paragraph
 * rendered as `&nbsp;`, and `\r\n` between the paragraph divs. Nine characters
 * of message carry roughly 200 bytes of it.
 *
 * The fake serves the same thing, for both fixture threads and anything sent
 * through it, because the scraper's job on a body is now to undo exactly this
 * — and a fixture that skipped the wrapper would let a converter regression
 * pass the whole suite.
 */

const WRAPPER_STYLE = 'line-height: normal; font-family: Arial; widows: 1; orphans: 1;';
const SPAN_STYLE = 'font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The Epic-formatted HTML for a message whose paragraphs are separated by newlines. */
export function epicMessageBody(text: string): string {
  const paragraphs = String(text).split(/\r\n|\n/);
  const divs = paragraphs.map((paragraph, i) => {
    // A blank paragraph is a single non-breaking space, never an empty span.
    const words = paragraph.trim() === '' ? '&nbsp;' : escapeHtml(paragraph);
    return `<div data-paragraph="${i + 1}"><span style="${SPAN_STYLE}" lang="en">${words}</span></div>`;
  });
  return `<div class="fmtConv" style="${WRAPPER_STYLE}">${divs.join('\r\n')}</div>`;
}
