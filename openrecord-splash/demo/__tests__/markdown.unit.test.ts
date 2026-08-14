/**
 * The markdown parser behind assistant replies.
 *
 * The parser deliberately produces a typed tree rather than HTML — `<Markdown>`
 * turns it into React elements, and React escapes every text node on the way
 * out. So the security property to pin here is *structural*: markup in the
 * model's output must survive as plain text in a text span, never as a tag or
 * an attribute, and an image token must never become an arbitrary source.
 */

import { describe, expect, test } from 'bun:test';
import { parseInline, parseMarkdown, type Block, type InlineSpan } from '../src/markdown';

/** Flatten a parsed document back to the text a reader would see. */
function textOf(blocks: Block[]): string {
  const spanText = (spans: InlineSpan[]) => spans.map((s) => s.text).join('');
  return blocks
    .map((b) => {
      switch (b.kind) {
        case 'heading':
          return spanText(b.spans);
        case 'list':
          return b.items.map(spanText).join('\n');
        case 'quote':
        case 'paragraph':
          return b.lines.map(spanText).join('\n');
        case 'image':
          return `[image:${b.name}]`;
        default: {
          // `b` is `never` while the switch names every `Block` kind, so the
          // annotation is what fails the build when a kind is added — the job
          // the missing `default` used to do, minus the unreachable-code error
          // that broke `tsc` for the whole demo. The throw keeps the runtime
          // guarantee that every path returns a string: a fall-through would
          // put `undefined` in the joined text and read as a parse bug.
          const unhandled: never = b;
          throw new Error(`textOf: unhandled block ${JSON.stringify(unhandled)}`);
        }
      }
    })
    .join('\n');
}

describe('markup in model output stays text', () => {
  test('a script tag parses as a single text span', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('paragraph');
    // One text span, verbatim — no tag node, nothing for React to interpret.
    const block = blocks[0]!;
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines[0]).toEqual([{ kind: 'text', text: '<script>alert(1)</script>' }]);
  });

  test('an event-handler attribute never becomes an attribute', () => {
    const blocks = parseMarkdown('<img src=x onerror="alert(1)">');
    const block = blocks[0]!;
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    // Every span is `text`; there is no span kind that could carry an attribute.
    expect(block.lines[0]!.every((s) => s.kind === 'text')).toBe(true);
    expect(textOf(blocks)).toBe('<img src=x onerror="alert(1)">');
  });

  test('angle brackets in ordinary clinical text survive intact', () => {
    // Reference ranges legitimately contain "<", so this is the common case,
    // not just the attack case.
    const blocks = parseMarkdown('Total Cholesterol reference range is <200 mg/dL');
    expect(textOf(blocks)).toContain('<200 mg/dL');
  });

  test('markup inside emphasis is still text', () => {
    const spans = parseInline('**<b>bold</b>**');
    expect(spans).toEqual([{ kind: 'bold', text: '<b>bold</b>' }]);
  });

  test('markup inside a bullet is still text', () => {
    const blocks = parseMarkdown('- <iframe src="https://evil.example"></iframe>');
    const block = blocks[0]!;
    if (block.kind !== 'list') throw new Error('expected a list');
    expect(block.items[0]!.every((s) => s.kind === 'text')).toBe(true);
  });
});

describe('parseInline', () => {
  test('bold, italic, and code each get their own span', () => {
    expect(parseInline('**b** and *i* and `c`')).toEqual([
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' and ' },
      { kind: 'italic', text: 'i' },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'c' },
    ]);
  });

  test('plain text is one span', () => {
    expect(parseInline('nothing special here')).toEqual([{ kind: 'text', text: 'nothing special here' }]);
  });

  test('bold wins over italic on the same run of asterisks', () => {
    expect(parseInline('**not italic**')).toEqual([{ kind: 'bold', text: 'not italic' }]);
  });

  test('an asterisk inside a word is left alone', () => {
    // Otherwise a dose like "5*10" would silently become emphasis.
    expect(parseInline('value 5*10 units')).toEqual([{ kind: 'text', text: 'value 5*10 units' }]);
  });

  test('code spans are not re-parsed for emphasis', () => {
    expect(parseInline('`**literal**`')).toEqual([{ kind: 'code', text: '**literal**' }]);
  });

  test('an empty line yields no spans', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('parseMarkdown structure', () => {
  test('headings carry their level', () => {
    const blocks = parseMarkdown('## Current Medications');
    expect(blocks[0]).toEqual({ kind: 'heading', level: 2, spans: [{ kind: 'text', text: 'Current Medications' }] });
  });

  test('consecutive bullets group into one list', () => {
    const blocks = parseMarkdown('- one\n- two\n- three');
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    if (block.kind !== 'list') throw new Error('expected a list');
    expect(block.items).toHaveLength(3);
  });

  test('a blank line splits paragraphs', () => {
    const blocks = parseMarkdown('first para\n\nsecond para');
    expect(blocks.filter((b) => b.kind === 'paragraph')).toHaveLength(2);
  });

  test('single newlines stay inside one paragraph as separate lines', () => {
    const blocks = parseMarkdown('**Atorvastatin**\n40mg daily');
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    if (block.kind !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.lines).toHaveLength(2);
  });

  test('consecutive quote lines group into one blockquote', () => {
    const blocks = parseMarkdown('> line one\n> line two');
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    if (block.kind !== 'quote') throw new Error('expected a quote');
    expect(block.lines).toHaveLength(2);
  });

  test('a list interrupts a paragraph rather than merging into it', () => {
    const blocks = parseMarkdown('intro line\n- a\n- b');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list']);
  });

  test('empty and nullish input parse to nothing', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
    expect(parseMarkdown(undefined)).toEqual([]);
  });

  test('a realistic reply parses into the expected block sequence', () => {
    const blocks = parseMarkdown(
      ['## Billing', '', '3 charges outstanding.', '', '- ER visit — $420.00', '- Radiology — $189.00', '', '> Draft message', ''].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'quote']);
  });
});

describe('image tokens', () => {
  test('a known token becomes a named placeholder', () => {
    const blocks = parseMarkdown('Here it is:\n\n[image:xray]\n\nImpression follows.');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'image', 'paragraph']);
    const image = blocks[1]!;
    if (image.kind !== 'image') throw new Error('expected an image');
    expect(image.name).toBe('xray');
  });

  test('a token that looks like a URL is not treated as one', () => {
    // Only [a-z0-9_-] matches, so a model cannot smuggle a source in here.
    const blocks = parseMarkdown('[image:https://evil.example/x.png]');
    expect(blocks.every((b) => b.kind !== 'image')).toBe(true);
  });

  test('a token with trailing text on the line is not a placeholder', () => {
    const blocks = parseMarkdown('[image:xray] and then some words');
    expect(blocks.every((b) => b.kind !== 'image')).toBe(true);
  });

  test('unknown names still parse; the renderer decides what to do with them', () => {
    const blocks = parseMarkdown('[image:mri]');
    const image = blocks[0]!;
    if (image.kind !== 'image') throw new Error('expected an image');
    expect(image.name).toBe('mri');
  });
});
