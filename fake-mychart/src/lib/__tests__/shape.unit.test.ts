import { describe, it, expect } from 'bun:test';
import { conformToShape } from '../shape';

describe('conformToShape', () => {
  it('fills fields the fixture omits with the template neutral value', () => {
    const template = { a: '', b: false, c: 0, nested: { x: '', y: false } };
    expect(conformToShape(template, { a: 'set' })).toEqual({
      a: 'set', b: false, c: 0, nested: { x: '', y: false },
    });
  });

  it('lets the fixture win on every field it sets, including falsy ones', () => {
    const template = { a: 'template', b: true };
    expect(conformToShape(template, { a: '', b: false })).toEqual({ a: '', b: false });
  });

  it('keeps fixture-only keys', () => {
    expect(conformToShape({ a: '' }, { a: 'x', extra: 1 })).toEqual({ a: 'x', extra: 1 });
  });

  it('conforms every array element to the template element shape', () => {
    const template = { list: [{ id: '', flag: false }] };
    expect(conformToShape(template, { list: [{ id: '1' }, { flag: true }] })).toEqual({
      list: [{ id: '1', flag: false }, { id: '', flag: true }],
    });
  });

  it('an empty template array passes fixture elements through untouched', () => {
    expect(conformToShape({ list: [] }, { list: [{ anything: 1 }] })).toEqual({ list: [{ anything: 1 }] });
  });

  it('applies a "*" map template to every fixture key without inventing keys', () => {
    const template = { byId: { '*': { name: '', n: 0 } } };
    expect(conformToShape(template, { byId: { A: { name: 'a' }, B: { n: 2 } } })).toEqual({
      byId: { A: { name: 'a', n: 0 }, B: { name: '', n: 2 } },
    });
    expect(conformToShape(template, {})).toEqual({ byId: {} });
  });

  it('neutral copies collapse nested "*" maps and arrays to empty', () => {
    const template = { outer: { map: { '*': { x: '' } }, list: [{ y: 0 }], s: '' } };
    expect(conformToShape(template, {})).toEqual({ outer: { map: {}, list: [], s: '' } });
  });

  it('a bare-array template conforms a bare-array fixture', () => {
    const template = [{ id: '', n: 0 }];
    expect(conformToShape(template, [{ id: 'a' }])).toEqual([{ id: 'a', n: 0 }]);
  });
});
