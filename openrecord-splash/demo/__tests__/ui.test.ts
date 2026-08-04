/**
 * The demo's rendering helpers.
 *
 * `renderMarkdown` takes model output and turns it into DOM. Model output is
 * untrusted — a prompt-injected reply, or just a lab value that happens to
 * contain a `<`. The escaping tests are the important ones here: this is a
 * health app, and the project's rule is that no external content ever reaches
 * the DOM as markup.
 */

import { describe, expect, test, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';

beforeAll(() => {
  // ui.js is browser code; give it a DOM before importing.
  const window = new Window();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.HTMLElement = window.HTMLElement;
  g.DocumentFragment = window.DocumentFragment;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

async function ui() {
  // @ts-expect-error — plain ES modules, no type declarations by design
  return import('../ui.js');
}

function html(fragment: Any): string {
  const host = document.createElement('div');
  host.append(fragment);
  return host.innerHTML;
}

describe('renderMarkdown — escaping', () => {
  test('a script tag is rendered as text, never as markup', async () => {
    const { renderMarkdown } = await ui();
    const out = html(renderMarkdown('<script>alert(1)</script>'));
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  test('an image with an error handler never becomes an element', async () => {
    const { renderMarkdown } = await ui();
    const host = document.createElement('div');
    host.append(renderMarkdown('<img src=x onerror="alert(1)">'));

    // The payload survives as text, which is inert — what matters is that no
    // element was created and nothing carries an event-handler attribute.
    expect(host.querySelectorAll('img')).toHaveLength(0);
    expect(host.querySelector('p')?.textContent).toBe('<img src=x onerror="alert(1)">');
    for (const node of host.querySelectorAll('*')) {
      for (const attr of node.attributes) expect(attr.name.startsWith('on')).toBe(false);
    }
  });

  test('angle brackets in ordinary text are escaped, not treated as markup', async () => {
    const { renderMarkdown } = await ui();
    const host = document.createElement('div');
    // Reference ranges legitimately contain "<", so this is the common case,
    // not just the attack case.
    host.append(renderMarkdown('Total Cholesterol reference range is <200 mg/dL'));

    expect(html(renderMarkdown('range <200'))).toContain('&lt;200');
    expect(host.querySelectorAll('*')).toHaveLength(1); // just the <p>
    expect(host.textContent).toContain('<200 mg/dL');
  });

  test('escaping survives inline markdown', async () => {
    const { renderMarkdown } = await ui();
    const out = html(renderMarkdown('**<b>bold</b>**'));
    expect(out).toContain('<strong>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).not.toContain('<b>');
  });

  test('an injected iframe inside a bullet stays text', async () => {
    const { renderMarkdown } = await ui();
    const out = html(renderMarkdown('- <iframe src="https://evil.example"></iframe>'));
    expect(out).toContain('<li>');
    expect(out).not.toContain('<iframe');
  });
});

describe('renderMarkdown — structure', () => {
  test('headings render at a demoted level', async () => {
    const { renderMarkdown } = await ui();
    expect(html(renderMarkdown('## Current Medications'))).toContain('<h4>Current Medications</h4>');
  });

  test('bullets group into one list', async () => {
    const { renderMarkdown } = await ui();
    const out = html(renderMarkdown('- one\n- two\n- three'));
    expect(out.match(/<ul>/g)).toHaveLength(1);
    expect(out.match(/<li>/g)).toHaveLength(3);
  });

  test('a blank line splits paragraphs', async () => {
    const { renderMarkdown } = await ui();
    const out = html(renderMarkdown('first para\n\nsecond para'));
    expect(out.match(/<p>/g)).toHaveLength(2);
  });

  test('single newlines inside a paragraph become line breaks', async () => {
    const { renderMarkdown } = await ui();
    expect(html(renderMarkdown('**Atorvastatin**\n40mg daily'))).toContain('<br>');
  });

  test('blockquotes group, and inline code renders', async () => {
    const { renderMarkdown } = await ui();
    expect(html(renderMarkdown('> line one\n> line two'))).toContain('<blockquote>');
    expect(html(renderMarkdown('slot `slot-001` is open'))).toContain('<code>slot-001</code>');
  });

  test('bold and italic both render', async () => {
    const { renderMarkdown } = await ui();
    const out = html(renderMarkdown('**bold** and *italic*'));
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
  });

  test('empty input produces nothing', async () => {
    const { renderMarkdown } = await ui();
    expect(html(renderMarkdown(''))).toBe('');
    expect(html(renderMarkdown(null))).toBe('');
  });
});

describe('image tokens', () => {
  test('a token becomes a placeholder, not an arbitrary URL', async () => {
    const { renderMarkdown } = await ui();
    const out = html(renderMarkdown('Here it is:\n\n[image:xray]\n\nImpression follows.'));
    expect(out).toContain('data-image="xray"');
    expect(out).not.toContain('<img');
  });

  test('a token that looks like a URL is not treated as one', async () => {
    const { renderMarkdown } = await ui();
    // Only [a-z0-9_-] matches, so this stays plain text.
    const out = html(renderMarkdown('[image:https://evil.example/x.png]'));
    expect(out).not.toContain('data-image');
    expect(out).not.toContain('<img');
  });

  test('hydrateImages drops unknown placeholders instead of guessing', async () => {
    const { renderMarkdown, hydrateImages } = await ui();
    const host = document.createElement('div');
    host.append(renderMarkdown('[image:mri]'));
    hydrateImages(host);
    expect(host.querySelectorAll('figure')).toHaveLength(0);
  });
});

describe('el()', () => {
  test('refuses raw html outright', async () => {
    const { el } = await ui();
    expect(() => el('div', { html: '<b>x</b>' })).toThrow('raw html is not allowed');
  });

  test('sets text content rather than markup', async () => {
    const { el } = await ui();
    const node = el('span', { text: '<b>not bold</b>' });
    expect(node.textContent).toBe('<b>not bold</b>');
    expect(node.querySelector('b')).toBeNull();
  });

  test('applies classes, attributes, and children', async () => {
    const { el } = await ui();
    const node = el('div', { class: 'a b', 'data-x': '1' }, el('span', { text: 'kid' }), 'tail');
    expect(node.className).toBe('a b');
    expect(node.getAttribute('data-x')).toBe('1');
    expect(node.textContent).toBe('kidtail');
  });

  test('skips null and false props and children', async () => {
    const { el } = await ui();
    const node = el('div', { class: null, hidden: false }, null, false, 'only');
    expect(node.hasAttribute('hidden')).toBe(false);
    expect(node.textContent).toBe('only');
  });
});

describe('activity-panel helpers', () => {
  test('describeResult flags errors and counts collection items', async () => {
    const { describeResult } = await ui();
    expect(describeResult({ error: 'nope' }).ok).toBe(false);
    expect(describeResult([1, 2, 3]).label).toContain('3 items');
    expect(describeResult({ results: [1, 2] }).label).toContain('2 items');
    expect(describeResult({ conversations: [1] }).label).toContain('1 items');
    expect(describeResult({ success: true }).label).toContain('ok');
  });

  test('summarizeArgs drops empties and truncates long values', async () => {
    const { summarizeArgs } = await ui();
    expect(summarizeArgs({})).toBe('');
    expect(summarizeArgs({ limit: 50, instance: '' })).toBe('limit: 50');
    expect(summarizeArgs({ body: 'x'.repeat(60) })).toContain('…');
  });
});

describe('fallbackNote', () => {
  test('distinguishes "never had a model" from "lost the model"', async () => {
    const { fallbackNote } = await ui();
    expect(fallbackNote(false)).toContain('no model endpoint is configured');
    expect(fallbackNote(true)).toContain('unavailable or rate limited');
  });
});
