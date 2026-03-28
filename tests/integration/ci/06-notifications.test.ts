import { describe, it, expect } from 'bun:test';
import { authedFetch } from './helpers';

describe('Notification preferences', () => {
  it('gets default preferences', async () => {
    const res = await authedFetch('/api/notifications/preferences');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
    expect(typeof body.includeContent).toBe('boolean');
  });

  it('enables notifications with content', async () => {
    const res = await authedFetch('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true, includeContent: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.includeContent).toBe(true);
  });

  it('verifies updated preferences', async () => {
    const res = await authedFetch('/api/notifications/preferences');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.includeContent).toBe(true);
  });

  it('disables notifications', async () => {
    const res = await authedFetch('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ enabled: false, includeContent: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.includeContent).toBe(false);
  });
});
