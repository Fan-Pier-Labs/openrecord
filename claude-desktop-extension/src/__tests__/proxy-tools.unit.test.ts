/**
 * Registration-shape tests for the proxy (multi-patient) tools.
 *
 * Registers everything on a capturing stub server and asserts the proxy
 * surface is wired the way the shared layer expects: the two proxy tools
 * exist with the right read/write annotations, every scraper tool exposes the
 * optional `patient` parameter, and the meta tools do not. The behavior
 * behind the handlers lives in scrapers/myChart/proxyTools.ts and is tested
 * there (plus end-to-end in scrapers/myChart/__tests__/fake-mychart/proxy.test.ts).
 */

import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools';

type RegisteredTool = {
  config: {
    description?: string;
    inputSchema?: Record<string, unknown>;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
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

describe('proxy tool registration', () => {
  test('list_proxy_targets is registered as a read tool', () => {
    const tool = tools.get('list_proxy_targets');
    expect(tool).toBeDefined();
    expect(tool!.config.annotations?.readOnlyHint).toBe(true);
    expect(Object.keys(tool!.config.inputSchema ?? {})).toEqual(['account']);
  });

  test('switch_proxy_target is registered as a non-read tool requiring patient', () => {
    const tool = tools.get('switch_proxy_target');
    expect(tool).toBeDefined();
    expect(tool!.config.annotations?.readOnlyHint).toBe(false);
    expect(Object.keys(tool!.config.inputSchema ?? {}).sort()).toEqual(['account', 'patient']);
  });

  test('every scraper tool exposes the optional patient parameter', () => {
    // Representative sample across reads, writes, and the raw-registered
    // imaging tool — all go through the same active-patient guard.
    for (const name of ['get_medications', 'get_lab_results', 'send_message', 'request_refill', 'download_imaging_study']) {
      const tool = tools.get(name);
      expect(tool).toBeDefined();
      expect(Object.keys(tool!.config.inputSchema ?? {})).toContain('patient');
    }
  });

  test('meta tools do not take a patient parameter', () => {
    for (const name of ['list_accounts', 'search_mycharts', 'get_hospital_info', 'setup_account', 'complete_2fa', 'disconnect_account']) {
      const tool = tools.get(name);
      expect(tool).toBeDefined();
      expect(Object.keys(tool!.config.inputSchema ?? {})).not.toContain('patient');
    }
  });

  test('refusal guidance in tool descriptions points at the switch tool', () => {
    const list = tools.get('list_proxy_targets')!;
    expect(list.config.description).toContain('switch_proxy_target');
  });
});
