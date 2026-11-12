// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * `send_feature_request` over real HTTP, against fake-mychart's stand-in for
 * the `fanpierlabs-forms` Lambda. Nothing here emails anyone.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */

import { beforeAll, describe, expect, it } from 'bun:test';

import { resetFakeMyChart } from '../../scrapers/myChart/__tests__/fake-mychart/mountMode';
import { detailedMessage } from '../detailedError';
import { sendFeatureRequest } from '../featureRequest';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const OPTIONS = { endpoint: `http://${HOST}/fanpierlabs-forms` };

describe('send_feature_request over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('is accepted with the user identified', async () => {
    const result = await sendFeatureRequest(
      { request: 'Export my results', name: 'Pat Example', email: 'pat@example.com', hospital: 'mychart.example.org' },
      OPTIONS,
    );
    expect(result.sent).toBe(true);
  });

  it('is accepted with only the description, on the placeholder email', async () => {
    const result = await sendFeatureRequest({ request: 'Export my results' }, OPTIONS);
    expect(result.submitted).toEqual({ request: 'Export my results' });
  });

  it('surfaces the 400 for a malformed email', async () => {
    const err = await sendFeatureRequest({ request: 'Export my results', email: 'not-an-email' }, OPTIONS).catch(
      (e: unknown) => e,
    );
    expect(detailedMessage(err)).toContain('email address');
  });
});
