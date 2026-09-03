import { describe, it, expect } from 'bun:test';
import { renderMarkdown } from '../markdown';

describe('renderMarkdown', () => {
  it('renders scalars as a definition list, in key order', () => {
    const md = renderMarkdown({ name: 'Lisinopril', refillable: false, count: 0, missing: null });
    expect(md).toBe(
      ['- **name**: Lisinopril', '- **refillable**: false', '- **count**: 0', '- **missing**: (none)', ''].join('\n'),
    );
  });

  it('keeps false, zero and empty strings visible rather than dropping them', () => {
    const md = renderMarkdown({ flag: false, n: 0, s: '' });
    expect(md).toContain('- **flag**: false');
    expect(md).toContain('- **n**: 0');
    expect(md).toContain('- **s**: (empty)');
  });

  it('renders arrays of scalars inline and empty arrays as (none)', () => {
    const md = renderMarkdown({ dates: ['01/01/2024', '02/01/2024'], allergies: [] });
    expect(md).toContain('- **dates**: 01/01/2024, 02/01/2024');
    expect(md).toContain('- **allergies**: (none)');
  });

  it('renders a flat array of objects as a table with the union of keys', () => {
    const md = renderMarkdown({
      medications: [
        { name: 'A', sig: 'daily' },
        { name: 'B', sig: 'weekly', pharmacy: 'Kwik-E-Mart' },
      ],
    });
    expect(md).toContain('## medications (2)');
    expect(md).toContain('| name | sig | pharmacy |');
    expect(md).toContain('| A | daily | (none) |');
    expect(md).toContain('| B | weekly | Kwik-E-Mart |');
  });

  it('escapes pipes and folds newlines inside table cells', () => {
    const md = renderMarkdown({ rows: [{ a: 'x|y', b: 'line1\nline2' }] });
    expect(md).toContain('| x\\|y | line1<br>line2 |');
  });

  it('falls back to sub-sections when an element is not flat', () => {
    const md = renderMarkdown({
      visits: [{ csn: '1', department: { name: 'Clinic', address: ['1 Main St'] } }],
    });
    expect(md).toContain('## visits (1)');
    expect(md).toContain('### visits 1');
    expect(md).toContain('- **csn**: 1');
    expect(md).toContain('#### department');
    expect(md).toContain('- **name**: Clinic');
    expect(md).toContain('- **address**: 1 Main St');
    expect(md).not.toContain('| csn |');
  });

  it('falls back to sub-sections when a string is long or multi-line', () => {
    const long = 'x'.repeat(80);
    const md = renderMarkdown({ notes: [{ title: 'A', body: long }] });
    expect(md).toContain('### notes 1');
    expect(md).toContain(`- **body**: ${long}`);
  });

  it('renders multi-line strings as paragraphs with hard breaks', () => {
    const md = renderMarkdown({ reportContentText: 'Findings: fine.\nImpression: also fine.' });
    expect(md).toContain('- **reportContentText**:\n\nFindings: fine.  \nImpression: also fine.');
  });

  it('renders nested objects as sub-sections with increasing heading depth', () => {
    const md = renderMarkdown({ header: { height: { value: '72', dateRecorded: '2026' } } });
    expect(md).toContain('## header');
    expect(md).toContain('### height');
    expect(md).toContain('- **value**: 72');
  });

  it('renders a top-level array and a title', () => {
    const md = renderMarkdown([{ name: 'A' }, { name: 'B' }], 'Immunizations');
    expect(md.startsWith('# Immunizations')).toBe(true);
    expect(md).toContain('## Immunizations (2)');
    expect(md).toContain('| name |');
  });

  it('renders null, primitives and empty objects', () => {
    expect(renderMarkdown(null)).toBe('(none)\n');
    expect(renderMarkdown('plain')).toBe('plain\n');
    expect(renderMarkdown(3)).toBe('3\n');
    expect(renderMarkdown({})).toBe('(empty)\n');
    expect(renderMarkdown({ list: [1, [2, 3]] })).toContain('- **list 2**: 2, 3');
  });

  it('never leaves three consecutive blank lines', () => {
    const md = renderMarkdown({ a: { b: { c: 1 } }, d: [{ e: { f: 2 } }] });
    expect(md).not.toMatch(/\n{3,}/);
  });
});
