// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * `mychart-cli mcp` end to end: the BUILT binary, spawned the way an MCP client
 * spawns it, driven over stdio by the SDK's own client.
 *
 * Requires `cd clients/cli && bun run build` and the docker-compose.ci.yaml
 * fake-mychart on localhost:4000. The child runs with a temporary HOME and the
 * file secret backend, so it never touches the real ~/.openrecord-mcpb or the
 * OS keystore.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CAPABILITIES } from '../../../shared/capabilities';
import { resetFakeMyChart } from '../../../../scrapers/myChart/__tests__/fake-mychart/mountMode';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const CLI_BIN = path.resolve(import.meta.dir, '..', '..', 'dist', 'cli.cjs');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mychart-cli-mcp-'));

const client = new Client({ name: 'mcp-integration-test', version: '1.0.0' });

type TextResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
async function call(name: string, args: Record<string, unknown> = {}): Promise<TextResult> {
  return (await client.callTool({ name, arguments: args })) as TextResult;
}

beforeAll(async () => {
  if (!fs.existsSync(CLI_BIN)) {
    throw new Error(`Built CLI binary not found at ${CLI_BIN}. Run: cd clients/cli && bun run build`);
  }
  await resetFakeMyChart(HOST);
  await client.connect(new StdioClientTransport({
    command: 'node',
    args: [CLI_BIN, 'mcp'],
    env: {
      PATH: process.env.PATH ?? '',
      HOME,
      USERPROFILE: HOME,
      OPENRECORD_SECRET_BACKEND: 'file',
      NODE_ENV: 'test',
      MYCHART_CLI_TELEMETRY_DISABLED: '1',
    },
    stderr: 'ignore',
  }));
});

afterAll(async () => {
  await client.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe('mychart-cli mcp', () => {
  it('identifies itself as openrecord', () => {
    expect(client.getServerVersion()?.name).toBe('openrecord');
  });

  it('serves a tool for every capability, and none of the extension-only tools', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const capability of CAPABILITIES) expect(names).toContain(capability.id);
    for (const meta of ['list_accounts', 'setup_account', 'complete_2fa', 'check_pending_call']) {
      expect(names).toContain(meta);
    }
    for (const extensionOnly of ['get_setup_widget', 'connect_google_calendar', 'disconnect_google_calendar']) {
      expect(names).not.toContain(extensionOnly);
    }
  });

  it('starts with no accounts and points at chat setup, not the widget', async () => {
    const result = await call('list_accounts');
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ count: 0, secretStorage: 'file' });
    expect(result.content[1]!.text).toContain('setup_account');
    expect(result.content[1]!.text).not.toContain('get_setup_widget');
  });

  it('signs in with setup_account and reads the chart', async () => {
    const setup = await call('setup_account', { hostname: HOST, username: 'homer', password: 'donuts123' });
    expect(setup.isError).toBeFalsy();
    const { state, account } = JSON.parse(setup.content[0]!.text) as { state: string; account: string };
    expect(state).toBe('logged_in');

    const profile = await call('get_profile', { account });
    expect(profile.isError).toBeFalsy();
    expect(profile.content[0]!.text).toContain('Homer');
  });

  it('keeps the account in the temporary HOME, as the extension would', () => {
    expect(fs.existsSync(path.join(HOME, '.openrecord-mcpb'))).toBe(true);
  });
});
