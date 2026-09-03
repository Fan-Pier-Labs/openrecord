/**
 * Reading values out of a page's inline scripts, against the shapes Epic
 * emits and the ones that used to defeat a regex.
 */
import { describe, expect, it } from 'bun:test';

import { parseInlineScripts, readAssignedLiteral, readCallArguments, readDeclaredLiteral } from '../inlineScript';

const scripts = (js: string) => parseInlineScripts(`<html><body><script type="text/javascript">${js}</script></body></html>`, '');

describe('parseInlineScripts', () => {
  it('skips a script that does not mention what is being read', () => {
    const html = '<script>var other = 1;</script><script>var model = {"a":1};</script>';
    expect(readDeclaredLiteral(parseInlineScripts(html, 'model'), 'model')).toEqual({ a: 1 });
    expect(parseInlineScripts(html, 'model')).toHaveLength(1);
  });

  it('skips a script that does not parse instead of throwing', () => {
    expect(parseInlineScripts('<script>var model = {[[[</script>', 'model')).toEqual([]);
  });

  it('ignores JavaScript that is loaded rather than inlined', () => {
    // An external script has no source on the page to read, whatever it defines.
    expect(parseInlineScripts('<script src="/bundle.js"></script>', 'model')).toEqual([]);
  });
});

describe('readAssignedLiteral', () => {
  it('reads a dotted assignment and stops at the end of its value', () => {
    // Two statements on one line: the second must not run into the first.
    const found = readAssignedLiteral(scripts('$$WP.Estimates.RecentSAs = [];$$WP.Estimates.OtherSAs = [{"Id":"a"}];'), '$$WP.Estimates.RecentSAs');
    expect(found).toEqual([]);
  });

  it('keeps brackets and quotes that live inside a string value', () => {
    const found = readAssignedLiteral(scripts(`$$WP.Estimates.OtherSAs = [{"Title":"A ] } \\" B"}];`), '$$WP.Estimates.OtherSAs');
    expect(found).toEqual([{ Title: 'A ] } " B' }]);
  });

  it('reads a value the instance wrote as JavaScript rather than JSON', () => {
    const found = readAssignedLiteral(scripts("$$WP.Estimates.OtherSAs = [{Id: 'a', Title: 'B', Rank: -2}];"), '$$WP.Estimates.OtherSAs');
    expect(found).toEqual([{ Id: 'a', Title: 'B', Rank: -2 }]);
  });

  it('does not confuse a different property of the same object', () => {
    expect(readAssignedLiteral(scripts('$$WP.Estimates.Back = "False";'), '$$WP.Estimates.OtherSAs')).toBeUndefined();
  });
});

describe('readDeclaredLiteral', () => {
  it('finds a declaration nested inside a function, with more statements after it', () => {
    const found = readDeclaredLiteral(
      scripts(`$(function () { var model = {"Locations":[{"Id":"1"}],"HasCompletedCaptcha":false}; var c = new $$WP.C('', model); });`),
      'model',
    );
    expect(found).toEqual({ Locations: [{ Id: '1' }], HasCompletedCaptcha: false });
  });

  it('returns undefined when nothing declares the name', () => {
    expect(readDeclaredLiteral(scripts('var other = 1;'), 'model')).toBeUndefined();
  });
});

describe('readCallArguments', () => {
  it('reads every call of one dotted callee, in order', () => {
    const found = readCallArguments(scripts('$$WP.Strings.addMnemonic("a", "1");$$WP.Strings.addMnemonic("b", "2");'), '$$WP.Strings.addMnemonic');
    expect(found).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
  });

  it('reads through the HTMLUnencode wrapper Epic puts on text values', () => {
    const found = readCallArguments(scripts('$$WP.Strings.addMnemonic("a", HTMLUnencode("Springfield &amp; Co"));'), '$$WP.Strings.addMnemonic');
    expect(found).toEqual([['a', 'Springfield &amp; Co']]);
  });

  it('gives undefined for an argument that is not a literal', () => {
    const found = readCallArguments(scripts('$$WP.Strings.addMnemonic("a", "1", false, $$WP.Strings.EncodingTypes.None);'), '$$WP.Strings.addMnemonic');
    expect(found).toEqual([['a', '1', false, undefined]]);
  });

  it('ignores a call with the same method name on a different object', () => {
    expect(readCallArguments(scripts('Other.Strings.addMnemonic("a", "1");'), '$$WP.Strings.addMnemonic')).toEqual([]);
  });
});
