import { describe, it, expect } from 'bun:test';
import { htmlToText } from '../htmlText';

describe('htmlToText', () => {
  it('keeps block boundaries that cheerio .text() would drop', () => {
    const text = htmlToText('<div class="note"><h3>ED Note</h3><p><strong>CC:</strong> pain.</p><p>Plan: rest.</p></div>');
    expect(text).toBe('ED Note\n\nCC: pain.\n\nPlan: rest.');
  });

  it('renders list items as bullets and headings as written, not shouted', () => {
    const text = htmlToText('<h3>Medications</h3><ul><li>Lisinopril 10mg</li><li>Atorvastatin 20mg</li></ul>');
    expect(text).toBe('Medications\n\n- Lisinopril 10mg\n- Atorvastatin 20mg');
  });

  it('renders tables as aligned columns with header cells as written', () => {
    const text = htmlToText('<table><tr><th>Test</th><th>Value</th></tr><tr><td>Sodium</td><td>140</td></tr></table>');
    expect(text.split('\n')).toEqual(['Test     Value', 'Sodium   140']);
  });

  it('drops scripts, styles, images and link targets; keeps link text', () => {
    const text = htmlToText('<style>p{}</style><script>x()</script><p>See <a href="/MyChart/x">your results</a><img src="x.png" alt="y"></p>');
    expect(text).toBe('See your results');
  });

  it('decodes entities, honours <br>, collapses whitespace, never emits markup', () => {
    const text = htmlToText('<p>Tom &amp; Jerry &lt;3</p><p>a   b<br>c</p>');
    expect(text).toBe('Tom & Jerry <3\n\na b\nc');
    expect(text).not.toContain('<p>');
  });

  it('keeps whitespace inside <pre>', () => {
    expect(htmlToText('<pre>a\n  b</pre>')).toBe('a\n  b');
  });

  it("empties a line Epic padded with a non-breaking space", () => {
    // A blank line in a MyChart message body is a paragraph holding one
    // `&nbsp;`. Left alone it comes back as an invisible-but-not-empty line.
    expect(htmlToText('<div>one</div><div>&nbsp;</div><div>two</div>')).toBe('one\n\ntwo');
    // Only trailing padding goes; a <pre>'s leading indent is content.
    expect(htmlToText('<pre>a\n  b  </pre>')).toBe('a\n  b');
  });

  it('passes plain text through and returns empty for empty', () => {
    expect(htmlToText('just text')).toBe('just text');
    expect(htmlToText('')).toBe('');
  });
});
