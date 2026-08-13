/**
 * Markdown parser for assistant replies.
 *
 * Parses to a small typed tree that `<Markdown>` turns into React elements.
 * Nothing here produces an HTML string, so there is no `dangerouslySetInnerHTML`
 * anywhere in the demo — React escapes every text node on the way out. Model
 * output is untrusted (prompt injection, or just a lab value containing `<`),
 * and this is a health app, so that boundary is not negotiable.
 *
 * The grammar covers exactly what the assistant is prompted to emit: `##`
 * headings, `-` bullets, `>` blockquotes, bold/italic/code spans, and the
 * `[image:name]` token the imaging tools use to place an attachment.
 */

export type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string };

export type Block =
  | { kind: 'heading'; level: number; spans: InlineSpan[] }
  | { kind: 'paragraph'; lines: InlineSpan[][] }
  | { kind: 'list'; items: InlineSpan[][] }
  | { kind: 'quote'; lines: InlineSpan[][] }
  /** A named placeholder. The renderer decides what — if anything — it maps to. */
  | { kind: 'image'; name: string };

/**
 * Split one line into inline spans. Deliberately single-pass and
 * non-recursive: nested emphasis isn't something the assistant emits, and
 * supporting it would add backtracking for no benefit.
 */
export function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|(?<![*\w])\*([^*\n]+)\*(?![*\w])/g;
  let last = 0;

  for (const match of line.matchAll(pattern)) {
    const at = match.index;
    if (at > last) spans.push({ kind: 'text', text: line.slice(last, at) });

    if (match[1] !== undefined) spans.push({ kind: 'code', text: match[1] });
    else if (match[2] !== undefined) spans.push({ kind: 'bold', text: match[2] });
    else if (match[3] !== undefined) spans.push({ kind: 'italic', text: match[3] });

    last = at + match[0].length;
  }

  if (last < line.length) spans.push({ kind: 'text', text: line.slice(last) });
  return spans;
}

const IMAGE_TOKEN = /^\[image:([a-z0-9_-]+)\]$/i;

/** Parse a full assistant reply into blocks. */
export function parseMarkdown(source: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  const lines = String(source ?? '').split('\n');

  let paragraph: InlineSpan[][] = [];
  let list: InlineSpan[][] = [];
  let quote: InlineSpan[][] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'list', items: list });
    list = [];
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ kind: 'quote', lines: quote });
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    const image = IMAGE_TOKEN.exec(line);
    if (image) {
      flushAll();
      // Group 1 is non-optional in IMAGE_TOKEN, so it is present on any match.
      blocks.push({ kind: 'image', name: image[1]!.toLowerCase() });
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      // Both groups are non-optional, so they are present on any match.
      blocks.push({ kind: 'heading', level: heading[1]!.length, spans: parseInline(heading[2]!) });
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushQuote();
      list.push(parseInline(bullet[1]!));
      continue;
    }

    const quoted = /^>\s?(.*)$/.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(parseInline(quoted[1]!));
      continue;
    }

    flushList();
    flushQuote();
    paragraph.push(parseInline(line));
  }

  flushAll();
  return blocks;
}
