/**
 * `get_raw_data` — the escape hatch under the condensing layer.
 *
 * Every capability tool returns the compact rendering from `./condense.ts`,
 * so a model that needs a field this extension trims has to be able to ask
 * for the untouched scraper payload. This asserts the two things about that
 * tool that would be dangerous to get wrong: it reaches every read capability,
 * and it reaches nothing else. A generic runner that also dispatched the
 * writes would be a second way to send a message to a doctor — carrying this
 * tool's read-only annotation, so Claude Desktop would show the user a
 * harmless-looking lookup while the message went out.
 *
 * The success path needs a live MyChart session and is covered by
 * `multi-account.integration.test.ts`; what is exercised here is registration
 * shape and every refusal.
 */

import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools';
import { CAPABILITIES } from '../../../shared/capabilities';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
type RegisteredTool = {
  config: { description?: string; inputSchema?: Record<string, unknown>; annotations?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
};

function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: (name: string, config: RegisteredTool['config'], handler: RegisteredTool['handler']) => {
      tools.set(name, { config, handler });
    },
  } as unknown as McpServer;
  registerAllTools(server);
  return tools;
}

const tools = captureTools();
const rawData = tools.get('get_raw_data')!;

const call = (args: Record<string, unknown>) => rawData.handler(args);
const message = (result: ToolResult) => result.content.map((c) => c.text).join('\n');

describe('registration', () => {
  test('is registered as a read tool taking a capability and its arguments', () => {
    expect(rawData).toBeDefined();
    expect(rawData.config.annotations?.readOnlyHint).toBe(true);
    expect(Object.keys(rawData.config.inputSchema ?? {}).sort()).toEqual([
      'account',
      'args',
      'capability',
      'patient',
    ]);
  });

  test('names every read capability it will run, so a model does not have to guess', () => {
    // Derived from the registry, so a capability added there is offered here
    // the same day rather than being invisible until someone updates a list.
    for (const capability of CAPABILITIES) {
      if (capability.kind !== 'read' || capability.rendersMedia) continue;
      expect(rawData.config.description).toContain(capability.id);
    }
  });
});

describe('refusals', () => {
  test('refuses a write capability and points at the tool that has the confirmation', async () => {
    const result = await call({ account: 'nobody@example.org', capability: 'send_message' });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('only runs read tools');
    expect(message(result)).toContain('send_message');
  });

  test('refuses an account-security capability', async () => {
    const result = await call({ account: 'nobody@example.org', capability: 'setup_totp' });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('only runs read tools');
  });

  test('refuses the imaging download, whose raw payload is pixel bytes', async () => {
    const result = await call({ account: 'nobody@example.org', capability: 'download_imaging_study' });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('image data');
  });

  test('lists the runnable capabilities when handed an unknown one', async () => {
    const result = await call({ account: 'nobody@example.org', capability: 'get_horoscope' });
    expect(result.isError).toBe(true);
    expect(message(result)).toContain('get_lab_results');
  });

  test('a read capability gets past the guard and fails on the missing account instead', async () => {
    // Proves the refusal above is about the capability's kind, not about
    // every call failing for an unrelated reason.
    const result = await call({ account: 'nobody@example.org', capability: 'get_lab_results' });
    expect(result.isError).toBe(true);
    expect(message(result)).not.toContain('only runs read tools');
  });
});
