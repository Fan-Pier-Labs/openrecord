/**
 * export_everything → list_export_items → organize_export, through the
 * extension's real handlers against fake-mychart. The session and account
 * lookup are stubbed so nothing touches the credential store, and exports go
 * to a temp directory instead of ~/Downloads.
 */
import { beforeAll, describe, expect, it, mock } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { myChartUserPassLogin } from '../../../scrapers/myChart/auth/login';
import { resetFakeMyChart } from '../../../scrapers/myChart/__tests__/fake-mychart/mountMode';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

await resetFakeMyChart(HOST);
const login = await myChartUserPassLogin({ hostname: HOST, user: 'homer', pass: 'donuts123', protocol: 'http' });
if (login.state !== 'logged_in') throw new Error(`homer login failed: ${login.state}`);
const session = login.mychartRequest;

void mock.module('../session-manager', () => ({
  resolveSession: async (account: string) => {
    if (account !== `homer@${HOST}`) throw new Error(`No saved account for ${account}.`);
    return session;
  },
}));
void mock.module('../credential-store', () => ({ lookupAccount: () => ({ hostname: HOST, username: 'homer' }) }));

const { registerExportTools } = await import('../export-tools');

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpb-export-'));
const tools = new Map<string, Handler>();
registerExportTools(
  { registerTool: (name: string, _config: unknown, handler: Handler) => tools.set(name, handler) } as unknown as McpServer,
  () => ({}),
  () => base,
);
const call = (name: string, args: Record<string, unknown>) => tools.get(name)!(args);

describe('export tools', () => {
  let exportDir: string;

  beforeAll(async () => {
    const result = await call('export_everything', { account: `homer@${HOST}` });
    expect(result.isError).toBeUndefined();
    exportDir = JSON.parse(result.content[0]!.text).export_dir;
  }, 120_000);

  it('exports into a new folder under the base directory', () => {
    expect(path.dirname(exportDir)).toBe(base);
    expect(fs.existsSync(path.join(exportDir, 'index.json'))).toBe(true);
  });

  it('lists records, then groups the ones the model picks', async () => {
    const listing = (await call('list_export_items', { export_dir: exportDir })).content[0]!.text;
    expect(listing).toMatch(/^total: \d+ {3}next_offset: null/);
    const lipid = listing.split('\n').find((line) => line.includes('Lipid Panel'))!.split(' | ')[0]!;

    const result = await call('organize_export', {
      export_dir: exportDir,
      groups: [{ name: 'Cholesterol', item_ids: [lipid, 'visit-999'] }],
    });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.unknown_ids).toEqual(['visit-999']);
    expect(fs.readFileSync(path.join(exportDir, 'By health issue', 'Cholesterol.md'), 'utf8')).toContain('Lipid Panel');
  });

  it('answers errors as tool errors', async () => {
    expect((await call('export_everything', { account: 'nobody@nowhere' })).isError).toBe(true);
    expect((await call('list_export_items', { export_dir: 'relative/path' })).isError).toBe(true);
    expect((await call('organize_export', { export_dir: base, groups: [{ name: 'x', item_ids: [] }] })).isError).toBe(true);
  });
});
