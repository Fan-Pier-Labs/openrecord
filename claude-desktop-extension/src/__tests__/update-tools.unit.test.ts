/**
 * The tool-surface half of update checking: check_for_updates is registered
 * as a read tool, and the one-shot update notice is appended to the next
 * successful tool result by the central interceptor in registerAllTools —
 * whichever tool that happens to be — then never again.
 *
 * memfs loads first: list_accounts reads the credential store and the
 * checker persists its throttle state, both under ~/.openrecord-mcpb.
 */
import * as memfs from './memfs';
import { beforeEach, describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools';
import { checkForUpdate, _resetForTests } from '../update-check';
import { EXTENSION_VERSION } from '../version';

type ToolResult = { content: { type: string; text?: string }[]; isError?: boolean };
type RegisteredTool = {
  config: { annotations?: { readOnlyHint?: boolean } };
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

function releasesFetch(version: string): typeof globalThis.fetch {
  return (async () =>
    new Response(
      JSON.stringify([
        {
          tag_name: `mcpb-v${version}`,
          html_url: `https://github.com/Fan-Pier-Labs/openrecord/releases/tag/mcpb-v${version}`,
          draft: false,
          prerelease: false,
          assets: [
            {
              name: 'openrecord.mcpb',
              browser_download_url: `https://github.com/Fan-Pier-Labs/openrecord/releases/download/mcpb-v${version}/openrecord.mcpb`,
            },
          ],
        },
      ]),
      { status: 200 },
    )) as unknown as typeof globalThis.fetch;
}

beforeEach(() => {
  memfs.reset();
  _resetForTests();
});

describe('check_for_updates tool', () => {
  test('is registered as a read tool with no parameters', () => {
    const tool = captureTools().get('check_for_updates');
    expect(tool).toBeDefined();
    expect(tool!.config.annotations?.readOnlyHint).toBe(true);
  });

  test('the handler always does a live check and reports versions + download URL', async () => {
    const tools = captureTools();
    // Seed a fresh cache saying "current" — force must bypass it.
    await checkForUpdate({ fetchFn: releasesFetch(EXTENSION_VERSION) });
    _resetForTests();

    const realFetch = globalThis.fetch;
    globalThis.fetch = releasesFetch('99.0.0');
    try {
      const result = await tools.get('check_for_updates')!.handler({});
      const payload = JSON.parse(result.content[0].text ?? '{}') as Record<string, unknown>;
      expect(payload.installed_version).toBe(EXTENSION_VERSION);
      expect(payload.latest_version).toBe('99.0.0');
      expect(payload.update_available).toBe(true);
      expect(payload.download_url).toContain('openrecord.mcpb');
      expect(payload.how_to_update).toBeDefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('the handler reports an honest failure when GitHub is unreachable', async () => {
    const tools = captureTools();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as unknown as typeof globalThis.fetch;
    try {
      const result = await tools.get('check_for_updates')!.handler({});
      const payload = JSON.parse(result.content[0].text ?? '{}') as Record<string, unknown>;
      expect(payload.installed_version).toBe(EXTENSION_VERSION);
      expect(payload.check_failed).toBe(true);
      expect(payload.update_available).toBe(false);
      expect(result.isError).not.toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('update notice interception', () => {
  test('a pending notice is appended to the next successful tool result, once', async () => {
    const tools = captureTools();
    await checkForUpdate({ fetchFn: releasesFetch('99.0.0') });

    const first = await tools.get('list_accounts')!.handler({});
    const firstTexts = first.content.map(c => c.text ?? '');
    expect(firstTexts.some(t => t.includes('v99.0.0') && t.includes('update'))).toBe(true);

    const second = await tools.get('list_accounts')!.handler({});
    const secondTexts = second.content.map(c => c.text ?? '');
    expect(secondTexts.some(t => t.includes('v99.0.0'))).toBe(false);
  });

  test('no notice is appended when the extension is current', async () => {
    const tools = captureTools();
    await checkForUpdate({ fetchFn: releasesFetch(EXTENSION_VERSION) });
    const result = await tools.get('list_accounts')!.handler({});
    const texts = result.content.map(c => c.text ?? '');
    expect(texts.some(t => t.includes('update is available'))).toBe(false);
  });
});
