/**
 * Every registered tool carries a human-readable title, in both of the places
 * MCP puts one.
 *
 * `Tool.title` is the current field; `ToolAnnotations.title` is the original.
 * Clients disagree about which they read, and a missing one is invisible from
 * here — the tool simply lists under its snake_case id in whichever client
 * reads the field that was left out. This file is the thing that notices.
 *
 * It covers both halves of the registry: the tools hand-written in `tools.ts`
 * (account setup and the MCPB-specific credential management) and the ones
 * derived from `shared/capabilities/`, where the title comes from the registry
 * entry and must arrive unaltered.
 */

import { describe, expect, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from '../tools';
import { CAPABILITIES } from '../../../shared/capabilities';

type Config = {
  title?: string;
  description?: string;
  annotations?: { title?: string; readOnlyHint?: boolean; openWorldHint?: boolean };
};

function captureTools(): Map<string, Config> {
  const tools = new Map<string, Config>();
  const server = {
    registerTool: (name: string, config: Config) => {
      tools.set(name, config);
    },
  } as unknown as McpServer;
  registerAllTools(server);
  return tools;
}

const tools = captureTools();

describe('tool metadata', () => {
  test('every tool has a title in both MCP locations, and they agree', () => {
    const missing: string[] = [];
    for (const [name, config] of tools) {
      if (!config.title?.trim() || config.annotations?.title !== config.title) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  test('every tool has a description', () => {
    const missing = [...tools].filter(([, c]) => !c.description?.trim()).map(([name]) => name);
    expect(missing).toEqual([]);
  });

  test('a title is a label, not the tool id repeated back', () => {
    for (const [name, config] of tools) {
      expect(config.title).not.toBe(name);
    }
  });

  test('capability tools take their title from the registry, unchanged', () => {
    for (const capability of CAPABILITIES) {
      expect(tools.get(capability.id)?.title).toBe(capability.title);
    }
  });

  test('the hand-written account tools are titled too', () => {
    // Named explicitly: these are the ones no registry entry can supply a
    // title for, so nothing else in the suite would notice one going missing.
    for (const name of [
      'list_accounts',
      'get_setup_widget',
      'get_hospital_info',
      'setup_account',
      'import_browser_passwords',
      'connect_imported_account',
      'complete_2fa',
      'disconnect_account',
    ]) {
      expect(tools.get(name)?.title).toBeTruthy();
    }
  });

  test('every tool declares whether it is read-only', () => {
    for (const [, config] of tools) {
      expect(typeof config.annotations?.readOnlyHint).toBe('boolean');
    }
  });
});
