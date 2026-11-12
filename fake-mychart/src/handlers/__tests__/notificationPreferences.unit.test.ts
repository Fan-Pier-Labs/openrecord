// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';
import type { NextRequest } from 'next/server';
import * as homer from '@/data/homer';
import * as shapes from '@/data/realShapes';
import { buildDataset } from '@/lib/dataset';
import { notificationPreferencesPost } from '../notificationPreferences';

/**
 * `GetPreferences` is the one settings payload the handler builds rather than
 * conforms (see the handler), so nothing else holds it to the captured
 * skeleton. Every key it emits must be one a real instance sends.
 */
async function getPreferences(ds = homer) {
  const handler = notificationPreferencesPost['api/communicationpreferences/getpreferences']!;
  const res = await handler({ request: {} as NextRequest, path: '', lower: '', ds });
  return (await res.json()) as Record<string, Record<string, Record<string, unknown>>>;
}

const keysOf = (o: object) => Object.keys(o).sort();

describe('GetPreferences wire shape', () => {
  it('emits exactly the captured top-level keys', async () => {
    expect(keysOf(await getPreferences())).toEqual(keysOf(shapes.getPreferences));
  });

  it('emits only captured keys inside each id-keyed map', async () => {
    const body = await getPreferences();
    for (const map of ['groupers', 'concepts', 'medias', 'additionalItemSections'] as const) {
      const allowed = Object.keys(shapes.getPreferences[map]['*']);
      for (const value of Object.values(body[map]!)) {
        expect(Object.keys(value).filter((k) => !allowed.includes(k))).toEqual([]);
      }
    }
  });

  it('carries the link keys on the linking group only, as real instances do', async () => {
    const groupers = Object.values((await getPreferences()).groupers!);
    expect(groupers.filter((g) => 'otherPreferencesLinkPath' in g).map((g) => g.title)).toEqual(['Care Companion']);
  });

  it('joins by ids that resolve', async () => {
    const body = await getPreferences();
    const order = body.grouperOrder as unknown as string[];
    expect(order.every((id) => id in body.groupers!)).toBe(true);
    for (const g of Object.values(body.groupers!)) {
      for (const c of g.conceptIds as string[]) {
        expect(body.concepts![c]).toBeDefined();
        for (const m of body.concepts![c]!.mediaIds as string[]) expect(body.medias![m]).toBeDefined();
      }
    }
  });

  it('answers an empty but well-formed payload for a record with no fixture', async () => {
    const body = await getPreferences(buildDataset({}));
    expect(body.groupers).toEqual({});
    expect(body.grouperOrder).toEqual([] as never);
  });
});
