/**
 * Registration-shape tests for the condensed-payload tools.
 *
 * The scrapers return everything MyChart returns; this client is where the
 * trimming happens, because a 220 KB `get_past_visits` result does not fit in
 * the context window of the thing that asked for it. What has to hold at
 * registration time is that the trimming is visible and reversible: a
 * summarized tool must advertise the condensing in its description and must
 * offer `full_detail`.
 *
 * Which capabilities carry a summary — and that this file branches on the flag
 * rather than an id — is asserted in shared/__tests__/capability-parity.unit.test.ts,
 * alongside the identical rule for `rendersMedia`. The projections themselves
 * are tested in shared/__tests__/summaries.unit.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools';
import { CAPABILITIES } from '../../../shared/capabilities';
import { FULL_DETAIL_PARAM } from '../../../shared/summaries';

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
  test('every summarized capability offers the full_detail escape hatch, and says so', () => {
    const summarized = CAPABILITIES.filter((c) => c.summary);
    expect(summarized.length).toBeGreaterThan(0);

    for (const capability of summarized) {
      const tool = tools.get(capability.id);
      expect(tool, capability.id).toBeDefined();
      expect(Object.keys(tool!.config.inputSchema ?? {}), capability.id).toContain(FULL_DETAIL_PARAM.name);
      expect(tool!.config.description, capability.id).toContain(capability.summary!.note);
    }
  });

  test('leaves every other tool untouched', () => {
    // full_detail is not a blanket parameter — a tool with no summary must not
    // advertise an option that would do nothing.
    for (const name of ['get_medications', 'get_lab_results', 'get_visit_notes', 'list_accounts']) {
      expect(Object.keys(tools.get(name)!.config.inputSchema ?? {}), name).not.toContain(
        FULL_DETAIL_PARAM.name,
      );
    }
  });
});
