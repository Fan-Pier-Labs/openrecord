/**
 * Registration-shape tests for the condensed-payload tools.
 *
 * The scrapers return everything MyChart returns; this client is where the
 * trimming happens, because a 220 KB `get_past_visits` result does not fit in
 * the context window of the thing that asked for it. What has to hold is that
 * the trimming is always reversible: a summarized tool must offer
 * `full_detail`, and asking for it must produce the untouched payload.
 *
 * The projection itself is tested in shared/__tests__/summaries.unit.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools';
import { CAPABILITY_SUMMARIZERS, FULL_DETAIL_PARAM } from '../../../shared/summaries';

type RegisteredTool = {
  config: { description?: string; inputSchema?: Record<string, unknown> };
};

function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: (name: string, config: RegisteredTool['config']) => {
      tools.set(name, { config });
    },
  } as unknown as McpServer;
  registerAllTools(server);
  return tools;
}

const tools = captureTools();

describe('summarized tool registration', () => {
  test('every summarized capability offers the full_detail escape hatch', () => {
    for (const id of Object.keys(CAPABILITY_SUMMARIZERS)) {
      const tool = tools.get(id);
      expect(tool, id).toBeDefined();
      expect(Object.keys(tool!.config.inputSchema ?? {}), id).toContain(FULL_DETAIL_PARAM.name);
    }
  });

  test('tells the model in the description that it is getting a condensed view', () => {
    for (const [id, summarizer] of Object.entries(CAPABILITY_SUMMARIZERS)) {
      expect(tools.get(id)!.config.description, id).toContain(summarizer.note);
    }
  });

  test('leaves every other tool untouched', () => {
    // full_detail is not a blanket parameter — a tool with no summarizer must
    // not advertise an option that would do nothing.
    for (const name of ['get_medications', 'get_lab_results', 'get_visit_notes', 'list_accounts']) {
      expect(Object.keys(tools.get(name)!.config.inputSchema ?? {}), name).not.toContain(
        FULL_DETAIL_PARAM.name,
      );
    }
  });
});
