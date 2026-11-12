// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';
import * as homer from '../../data/homer';
import * as shapes from '../../data/realShapes';
import { getPreferencesWireShape } from '../notificationPreferences';

/**
 * `GetPreferences` is the one settings payload the fake builds rather than
 * conforms (see the handler), so nothing else holds it to the captured
 * skeleton. Every key it emits must be one a real instance sends.
 */
const body = getPreferencesWireShape(homer.notificationPreferences) as unknown as Record<string, Record<string, Record<string, unknown>>>;
const keysOf = (o: object) => Object.keys(o).sort();

describe('GetPreferences wire shape', () => {
  it('emits exactly the captured top-level keys', () => {
    expect(keysOf(body)).toEqual(keysOf(shapes.getPreferences));
  });

  it('emits only captured keys inside each id-keyed map', () => {
    for (const map of ['groupers', 'concepts', 'medias', 'additionalItemSections'] as const) {
      const allowed = Object.keys(shapes.getPreferences[map]['*']);
      for (const value of Object.values(body[map]!)) {
        expect(Object.keys(value).filter((k) => !allowed.includes(k))).toEqual([]);
      }
    }
  });

  it('carries the link keys on the linking group only, as real instances do', () => {
    const groupers = Object.values(body.groupers!);
    expect(groupers.filter((g) => 'otherPreferencesLinkPath' in g).map((g) => g.title)).toEqual(['Care Companion']);
  });

  it('joins by ids that resolve', () => {
    const order = body.grouperOrder as unknown as string[];
    expect(order.every((id) => id in body.groupers!)).toBe(true);
    for (const g of Object.values(body.groupers!)) {
      for (const c of g.conceptIds as string[]) {
        expect(body.concepts![c]).toBeDefined();
        for (const m of body.concepts![c]!.mediaIds as string[]) expect(body.medias![m]).toBeDefined();
      }
    }
  });

  it('answers an empty but well-formed payload for a record with no topics', () => {
    const empty = getPreferencesWireShape({ ...homer.notificationPreferences, groupers: [] });
    expect(empty.groupers).toEqual({});
    expect(empty.grouperOrder).toEqual([]);
    expect(keysOf(empty)).toEqual(keysOf(shapes.getPreferences));
  });
});
