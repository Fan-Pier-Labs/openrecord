// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../scrapers/http';
import { executeCapability } from '../capabilities';
import { detailedMessage } from '../detailedError';
import { ANONYMOUS_EMAIL, FEATURE_REQUEST_ENDPOINT, FEATURE_REQUEST_SITE } from '../featureRequest';

let sent: Array<{ url: string; body: Record<string, unknown> }> = [];

function answer(status: number) {
  sent = [];
  setTestTransport((url, init) => {
    sent.push({ url, body: JSON.parse(init.body as string) as Record<string, unknown> });
    return Promise.resolve(new Response(status === 200 ? '{"ok":true}' : '{"error":"x"}', { status }));
  });
}

afterEach(() => setTestTransport(null));

describe('send_feature_request', () => {
  it('sends the description with whatever identity the user agreed to share', async () => {
    answer(200);
    const result = await executeCapability(null, 'send_feature_request', {
      request: 'Export my lab results to a spreadsheet',
      name: 'Pat Example',
      email: 'pat@example.com',
      hospital: 'mychart.example.org',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe(FEATURE_REQUEST_ENDPOINT);
    expect(sent[0]!.body).toEqual({
      site: FEATURE_REQUEST_SITE,
      request: 'Export my lab results to a spreadsheet',
      name: 'Pat Example',
      email: 'pat@example.com',
      hospital: 'mychart.example.org',
    });
    expect(result).toMatchObject({ sent: true, anonymous: false });
  });

  it('sends only the description when anonymous, with the placeholder email the Lambda requires', async () => {
    answer(200);
    const result = await executeCapability(null, 'send_feature_request', { request: 'Track my steps' });

    expect(sent[0]!.body).toEqual({ site: FEATURE_REQUEST_SITE, request: 'Track my steps', email: ANONYMOUS_EMAIL });
    expect(result).toEqual({ sent: true, anonymous: true, submitted: { request: 'Track my steps' } });
  });

  it('refuses an empty description without sending anything', async () => {
    answer(200);
    await expect(executeCapability(null, 'send_feature_request', { request: '  ' })).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });

  it('keeps what was sent out of the error when the service refuses it', async () => {
    answer(400);
    const err = await executeCapability(null, 'send_feature_request', {
      request: 'Track my steps',
      email: 'pat@example.com',
    }).catch((e: unknown) => e);

    expect(String((err as Error).message)).not.toContain('pat@example.com');
    expect(String((err as Error).message)).not.toContain('Track my steps');
    expect(detailedMessage(err)).toContain('email address');
  });
});
