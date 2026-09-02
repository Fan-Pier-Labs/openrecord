import * as cheerio from 'cheerio';

/**
 * MyChart message bodies are HTML on the wire, not text.
 *
 * A message a patient typed as one line comes back as a `div.fmtConv` wrapper
 * holding one `<div data-paragraph="N">` per paragraph, each with an inline
 * `<span style="font-size: ...; font-family: ...; color: ..." lang="en">`
 * around the words, `&nbsp;` for a blank line and `\r\n` between the blocks.
 * Nine characters of message carry roughly 200 bytes of markup, and a long
 * thread multiplies the wrapper once per message.
 *
 * Every consumer of a body wants the words: the MCP server and the mobile
 * agent hand it to a model, the CLI prints it to a terminal. So the scraper
 * converts once, here, and no client ever holds external HTML taken from a
 * health record — which is also what keeps a future thread view away from
 * `dangerouslySetInnerHTML`. If a render site ever needs the original markup,
 * add a separate, explicitly-named field for it (see `contentHtml` on visit
 * notes) rather than putting HTML back into `messageBody`.
 */

/** Tags whose end is a line break: what Epic's formatter emits, plus the usual suspects. */
const BLOCK_SELECTOR = [
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
].join(', ');

/** Tags that carry no words — their text content is markup, not message. */
const DROPPED_SELECTOR = 'script, style, noscript, head, template';

/**
 * A line break we put there, so it can be told apart from whitespace that was
 * only ever source formatting. A private-use code point, because the HTML
 * parser rewrites a NUL to U+FFFD before we would ever see it again.
 */
const BREAK = '\ue000';

/**
 * The words of an Epic message body, with its paragraph structure kept as
 * newlines: one `\n` between paragraphs, and a blank line wherever the body
 * had an `&nbsp;`-only paragraph.
 *
 * Plain text in is plain text out, so this is safe to run over an endpoint (or
 * a fixture) that never wrapped the body in the first place.
 */
export function messageBodyToText(body: string | undefined): string {
  if (!body) return '';
  // Nothing to unwrap: no tags and no entities. Skips the parse for the
  // endpoints and instances that hand back bare text.
  if (!body.includes('<') && !body.includes('&')) return body.trim();

  const $ = cheerio.load(body.split(BREAK).join(''));

  $(DROPPED_SELECTOR).remove();
  $('br').replaceWith(BREAK);

  // A link whose text hides its destination keeps the destination: the words
  // alone would tell a reader to "click here" with nowhere to go. Written as
  // text rather than appended as markup, so an href can't reopen the tree.
  $('a[href]').each((_, el) => {
    const anchor = $(el);
    const href = anchor.attr('href') ?? '';
    const words = anchor.text();
    if (href && !words.includes(href)) anchor.text(`${words} (${href})`);
  });

  // Only blocks with no block inside them, so a `td` in a `tr` in a `table`
  // ends one line rather than three.
  $(BLOCK_SELECTOR).each((_, el) => {
    const block = $(el);
    if (block.find(BLOCK_SELECTOR).length === 0) block.append(BREAK);
  });

  return tidy($.root().text());
}

/**
 * Real whitespace is source formatting — Epic puts a literal `\r\n` between
 * its paragraph divs, and that is not a line anyone typed — so it collapses
 * to a space, and only our own breaks survive as newlines. A blank line the
 * sender *did* type arrives as `&nbsp;`, which becomes a line holding one
 * space and then, after the trim, an empty one. Which is exactly right.
 */
function tidy(text: string): string {
  return text
    .replace(/[\u00a0\u200b\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .split(BREAK)
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
