// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * `get_hospital_info` over real HTTP, against fake-mychart, with no session.
 * The scraper's own suite covers the profile in depth; this covers the
 * capability's argument mapping and its choice of http for a local host.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */

import { beforeAll, describe, expect, it } from 'bun:test';

import { resetFakeMyChart } from '../../scrapers/myChart/__tests__/fake-mychart/mountMode';
import type { HospitalNetworkProfile } from '../../scrapers/myChart/prelogin/types';
import { executeCapability } from '../capabilities';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

describe('get_hospital_info over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('narrows the crawl and skips sections as asked', async () => {
    const profile = (await executeCapability(null, 'get_hospital_info', {
      hostname: HOST,
      specialties: ['Cardiology'],
      include_billing: false,
    })) as HospitalNetworkProfile;
    expect(profile.profile.organizationName).toBe('Springfield General Hospital');
    expect(profile.directory!.providers.map((p) => p.name).sort()).toEqual(['Cardio Carlson, MD', 'Julius Hibbert, MD']);
    expect(profile.billingEntities).toBeNull();
  });
});
