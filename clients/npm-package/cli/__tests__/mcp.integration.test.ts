// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * `mychart-cli mcp` end to end, the way a user gets it: `npm pack` the built
 * package, then spawn `npx … mychart-cli mcp` from that tarball — what every MCP
 * client config in docs/mcp.md runs — and drive it over stdio with the SDK's own
 * client.
 *
 * Packing matters: inside the repo `dist/cli.cjs` resolves every devDependency
 * from node_modules, so a runtime dep that is neither bundled nor listed in
 * `dependencies` would pass here and break `npx` for every user. Under npx the
 * tarball's own dependency list is all it gets.
 *
 * Requires `cd clients/npm-package && bun run build` and the docker-compose.ci.yaml
 * fake-mychart on localhost:4000. The child runs with a temporary HOME (so a
 * fresh npm cache too) and the file secret backend, so it never touches the
 * real ~/.openrecord-mcpb or the OS keystore.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CAPABILITIES } from '../../../shared/capabilities';
import { resetFakeMyChart } from '../../../../scrapers/myChart/__tests__/fake-mychart/mountMode';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const PACKAGE_DIR = path.resolve(import.meta.dir, '..', '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mychart-cli-mcp-'));
let tarball = '';
let client: Client;

async function startServer(): Promise<Client> {
  const c = new Client({ name: 'mcp-integration-test', version: '1.0.0' });
  await c.connect(new StdioClientTransport({
    command: 'npx',
    args: ['-y', `--package=${tarball}`, 'mychart-cli', 'mcp'],
    cwd: HOME,
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
  return c;
}

type TextResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
async function call(name: string, args: Record<string, unknown> = {}): Promise<TextResult> {
  return (await client.callTool({ name, arguments: args })) as TextResult;
}
function json<T = Record<string, unknown>>(result: TextResult): T {
  return JSON.parse(result.content[0]!.text) as T;
}

beforeAll(async () => {
  if (!fs.existsSync(path.join(PACKAGE_DIR, 'dist', 'cli.cjs'))) {
    throw new Error(`Built CLI not found in ${PACKAGE_DIR}/dist. Run: cd clients/npm-package && bun run build`);
  }
  const [packed] = JSON.parse(execFileSync(
    'npm', ['pack', '--json', '--pack-destination', HOME],
    { cwd: PACKAGE_DIR, encoding: 'utf-8' },
  )) as Array<{ filename: string }>;
  tarball = path.join(HOME, packed!.filename);
  await resetFakeMyChart(HOST);
  // The first start installs the tarball's dependencies from the registry.
  client = await startServer();
}, 180_000);

afterAll(async () => {
  await client?.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe('npx mychart-cli mcp', () => {
  it('identifies itself as openrecord', () => {
    expect(client.getServerVersion()?.name).toBe('openrecord');
  });

  it('serves a tool for every capability, and none of the extension-only tools', async () => {
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const capability of CAPABILITIES) expect(names).toContain(capability.id);
    for (const meta of ['list_accounts', 'setup_account', 'complete_2fa', 'check_pending_call', 'send_feature_request']) {
      expect(names).toContain(meta);
    }
    for (const extensionOnly of ['get_setup_widget', 'connect_google_calendar', 'disconnect_google_calendar', 'set_telemetry']) {
      expect(names).not.toContain(extensionOnly);
    }
  });

  it('starts with no accounts and points at chat setup, not the widget', async () => {
    const result = await call('list_accounts');
    expect(json(result)).toMatchObject({ count: 0, secretStorage: 'file' });
    expect(result.content[1]!.text).toContain('setup_account');
    expect(result.content[1]!.text).not.toContain('get_setup_widget');
  });

  it('signs in with setup_account and reads the chart', async () => {
    const setup = await call('setup_account', { hostname: HOST, username: 'homer', password: 'donuts123' });
    expect(setup.isError).toBeFalsy();
    expect(json(setup)).toMatchObject({ state: 'logged_in', account: `homer@${HOST}` });

    const profile = await call('get_profile', { account: `homer@${HOST}` });
    expect(profile.isError).toBeFalsy();
    expect(profile.content[0]!.text).toContain('Homer');
  });

  it('completes 2FA in the chat: a wrong code re-issues the pending id, the right one signs in', async () => {
    const setup = json<{ state: string; pending_id: string }>(
      await call('setup_account', { hostname: HOST, username: 'marge', password: 'donuts123' }),
    );
    expect(setup.state).toBe('need_2fa');

    const wrong = json<{ state: string; pending_id: string }>(
      await call('complete_2fa', { pending_id: setup.pending_id, code: '000000' }),
    );
    expect(wrong.state).toBe('invalid_2fa');

    const right = await call('complete_2fa', { pending_id: wrong.pending_id, code: '123456' });
    expect(json(right)).toMatchObject({ state: 'logged_in', account: `marge@${HOST}` });
    expect((await call('get_profile', { account: `marge@${HOST}` })).content[0]!.text).toContain('Marge');
  });

  it('keeps the accounts in the temporary HOME, as the extension would', () => {
    expect(fs.existsSync(path.join(HOME, '.openrecord-mcpb'))).toBe(true);
  });

  it('signs back in silently with a saved passkey after the server process restarts', async () => {
    expect(json(await call('register_passkey', { account: `homer@${HOST}` }))).toMatchObject({ saved: true });
    await client.close();

    client = await startServer();
    const { accounts } = json<{ accounts: Array<{ account: string; sessionActive: boolean; hasPasskey: boolean }> }>(
      await call('list_accounts'),
    );
    expect(accounts.find((a) => a.account === `homer@${HOST}`)).toMatchObject({ sessionActive: false, hasPasskey: true });

    const profile = await call('get_profile', { account: `homer@${HOST}` });
    expect(profile.isError).toBeFalsy();
    expect(profile.content[0]!.text).toContain('Homer');
  }, 30_000);
});
