import { describe, it, expect } from 'bun:test';
import { htmlToText, rtfToText } from '../htmlText';

describe('htmlToText', () => {
  it('turns block elements into lines and keeps inline text together', () => {
    const text = htmlToText('<div class="note"><h3>ED Note</h3><p><strong>CC:</strong> pain.</p><p>Plan: rest.</p></div>');
    expect(text).toBe('ED Note\n\nCC: pain.\nPlan: rest.');
  });

  it('renders list items as bullets', () => {
    const text = htmlToText('<h3>Medications</h3><ul><li>Lisinopril 10mg</li><li>Atorvastatin 20mg</li></ul>');
    expect(text).toBe('Medications\n\n- Lisinopril 10mg\n- Atorvastatin 20mg');
  });

  it('renders table rows as tab-separated cells', () => {
    const text = htmlToText('<table><tr><th>Test</th><th>Value</th></tr><tr><td>Sodium</td><td>140</td></tr></table>');
    expect(text).toBe('Test\tValue\nSodium\t140');
  });

  it('drops scripts and styles, honours <br>, collapses whitespace', () => {
    const text = htmlToText('<style>p{}</style><script>x()</script><p>a   b<br>c</p>');
    expect(text).toBe('a b\nc');
  });

  it('decodes entities and never emits markup', () => {
    const text = htmlToText('<p>Tom &amp; Jerry &lt;3</p><img src="x.png" alt="y">');
    expect(text).toBe('Tom & Jerry <3');
    expect(text).not.toContain('<p>');
  });

  it('keeps whitespace inside <pre>', () => {
    expect(htmlToText('<pre>a\n  b</pre>')).toBe('a\n  b');
  });

  it('passes plain text through and returns empty for empty', () => {
    expect(htmlToText('just text')).toBe('just text');
    expect(htmlToText('')).toBe('');
  });
});

describe('rtfToText', () => {
  it('strips control words, groups and hex escapes', () => {
    const rtf = '{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\*\\generator Epic;}\\f0\\fs20 Positive\\par Caf\\\'e9 result}';
    expect(rtfToText(rtf)).toBe('Positive\nCafé result');
  });

  it('returns non-RTF strings unchanged', () => {
    expect(rtfToText('140')).toBe('140');
    expect(rtfToText('')).toBe('');
  });

  it('unescapes braces and backslashes', () => {
    expect(rtfToText('{\\rtf1 a\\{b\\}c \\\\ d}')).toBe('a{b}c \\ d');
  });
});
