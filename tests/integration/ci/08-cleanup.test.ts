import { describe, it, expect } from 'bun:test';
import { state, authedFetch } from './helpers';

describe('Cleanup', () => {
  it('deletes the MyChart instance', async () => {
    expect(state.instanceId).toBeTruthy();

    const res = await authedFetch(`/api/mychart-instances/${state.instanceId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('instance list is empty after deletion', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('deleted instance returns 404', async () => {
    const res = await authedFetch(`/api/mychart-instances/${state.instanceId}`);
    expect(res.status).toBe(404);
  });
});
