import { describe, it, expect } from 'bun:test';
import { BASE_URL } from './helpers';

describe('Health check', () => {
  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
