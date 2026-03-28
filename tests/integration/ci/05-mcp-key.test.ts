import { describe, it, expect } from 'bun:test';
import { state, authedFetch } from './helpers';

describe('MCP API key lifecycle', () => {
  it('has no API key initially', async () => {
    const res = await authedFetch('/api/mcp-key');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasKey).toBe(false);
  });

  it('generates an API key', async () => {
    const res = await authedFetch('/api/mcp-key', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBeDefined();
    expect(body.key.length).toBeGreaterThan(10);
    expect(body.mcpUrl).toBeDefined();
    expect(body.mcpUrl).toContain('/api/mcp?key=');

    state.mcpApiKey = body.key;
  });

  it('reports hasKey after generation', async () => {
    const res = await authedFetch('/api/mcp-key');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasKey).toBe(true);
  });

  it('revokes the API key', async () => {
    const res = await authedFetch('/api/mcp-key', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('reports no key after revocation', async () => {
    const res = await authedFetch('/api/mcp-key');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasKey).toBe(false);
  });
});
