import { describe, it, expect } from 'bun:test';
import { state, authedFetch, FAKE_MYCHART_HOSTNAME } from './helpers';

describe('MyChart instance management', () => {
  it('creates a new MyChart instance', async () => {
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: FAKE_MYCHART_HOSTNAME,
        username: 'homer',
        password: 'donuts123',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.hostname).toBe(FAKE_MYCHART_HOSTNAME);
    expect(body.username).toBe('homer');
    expect(body.connected).toBe(false);

    state.instanceId = body.id;
  });

  it('lists the instance', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(state.instanceId);
    expect(body[0].hostname).toBe(FAKE_MYCHART_HOSTNAME);
  });

  it('gets instance by ID', async () => {
    const res = await authedFetch(`/api/mychart-instances/${state.instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(state.instanceId);
  });

  it('connects to fake-mychart (login)', async () => {
    const res = await authedFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        myChartInstanceId: state.instanceId,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // fake-mychart may or may not require 2FA depending on config
    if (body.state === 'need_2fa') {
      // Complete 2FA with the fake code
      const twofaRes = await authedFetch('/api/twofa', {
        method: 'POST',
        body: JSON.stringify({
          sessionKey: body.sessionKey,
          code: '123456',
        }),
      });
      expect(twofaRes.status).toBe(200);
      const twofaBody = await twofaRes.json();
      expect(twofaBody.state).toBe('logged_in');
      state.sessionKey = twofaBody.sessionKey;
    } else {
      expect(body.state).toBe('logged_in');
      state.sessionKey = body.sessionKey;
    }

    expect(state.sessionKey).toBeTruthy();
  }, 30_000);

  it('instance shows as connected', async () => {
    const res = await authedFetch(`/api/mychart-instances/${state.instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(true);
  });

  it('rejects duplicate instance', async () => {
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: FAKE_MYCHART_HOSTNAME,
        username: 'homer',
        password: 'donuts123',
      }),
    });
    expect(res.status).toBe(409);
  });

  it('rejects blocked instance (central.mychart.org)', async () => {
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: 'central.mychart.org',
        username: 'test',
        password: 'test',
      }),
    });
    expect(res.status).toBe(400);
  });
});
