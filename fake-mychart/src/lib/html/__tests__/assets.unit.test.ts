/**
 * The page CSS and inline JS are read off disk by name, so a rename or a typo
 * is invisible until a request for that page throws — and only for the pages an
 * integration suite happens to fetch. These tests tie the two halves together.
 */
import { describe, it, expect } from 'bun:test';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const HTML_DIR = join(import.meta.dir, '..');
const ASSET_DIR = join(HTML_DIR, 'assets');

/** Every `inlineStyle('a.css', …)` / `inlineScript('b.js', …)` argument. */
function referencedAssets(): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const file of readdirSync(HTML_DIR).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(join(HTML_DIR, file), 'utf8');
    for (const [, args] of source.matchAll(/inline(?:Style|Script)\(([^)]*)\)/g)) {
      for (const [, name] of args.matchAll(/'([^']+)'/g)) {
        refs.set(name!, [...(refs.get(name!) ?? []), file]);
      }
    }
  }
  return refs;
}

describe('html assets', () => {
  it('resolves every asset the page templates name', () => {
    const onDisk = new Set(readdirSync(ASSET_DIR));
    const missing = [...referencedAssets()].filter(([name]) => !onDisk.has(name));
    expect(missing.map(([name, files]) => `${name} (from ${files.join(', ')})`)).toEqual([]);
  });

  it('has no orphaned asset files', () => {
    const referenced = referencedAssets();
    const orphans = readdirSync(ASSET_DIR).filter(name => !referenced.has(name));
    expect(orphans).toEqual([]);
  });

  it('leaves no unsubstituted placeholder other than the mount prefix', () => {
    // `{{MP}}` is the one thing `inlineScript` rewrites; anything else spelled
    // that way would ship to the browser verbatim.
    const stray: string[] = [];
    for (const name of readdirSync(ASSET_DIR)) {
      const text = readFileSync(join(ASSET_DIR, name), 'utf8');
      for (const [placeholder] of text.matchAll(/\{\{[^}]*\}\}/g)) {
        if (placeholder !== '{{MP}}') stray.push(`${name}: ${placeholder}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it('keeps the mount prefix out of the stylesheets, which are never rewritten', () => {
    const withPlaceholder = readdirSync(ASSET_DIR)
      .filter(name => name.endsWith('.css'))
      .filter(name => readFileSync(join(ASSET_DIR, name), 'utf8').includes('{{MP}}'));
    expect(withPlaceholder).toEqual([]);
  });
});
