/**
 * Parking behind check_pending_call. Deadlines are passed in as a few
 * milliseconds; the 10-minute cap is exercised by moving the clock.
 */
import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CAPABILITIES } from '../../../shared/capabilities';
import { CHECK_TOOL, MAX_RUN_MS, checkPendingCall, resetPendingCalls, runGuarded, unsettledCallOnAccount } from '../pending-call';

const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] });
const text = (r: CallToolResult): string => (r.content[0] as { text: string }).text;
const idOf = (r: CallToolResult): string => /id "([^"]+)"/.exec(text(r))![1]!;
const tick = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });
/** A handler whose completion the test controls. */
function deferred() {
  let resolve!: (r: CallToolResult) => void;
  const promise = new Promise<CallToolResult>((res) => {
    resolve = res;
  });
  return { fn: () => promise, resolve };
}
const ACCOUNT = { account: 'homer@mychart.example.org' };

beforeEach(() => resetPendingCalls());
afterEach(() => setSystemTime());

describe('runGuarded', () => {
  it('returns a fast result, or a thrown error as an error result, and parks nothing', async () => {
    expect(await runGuarded('get_profile', ACCOUNT, () => ok('profile'), 50)).toEqual(ok('profile'));
    const err = await runGuarded('get_profile', ACCOUNT, () => Promise.reject(new Error('boom')), 50);
    expect([err.isError, text(err)]).toEqual([true, 'Error: boom']);
  });

  it('parks a call that misses the deadline under an id, and blocks only its identical repeat', async () => {
    const d = deferred();
    const parked = await runGuarded('send_message', { account: 'X', body: 'hi' }, d.fn, 5);
    expect(text(parked)).toMatch(/^send_message \(id "[0-9a-f-]{36}"\) is still running after/);

    let ran = false;
    const repeat = await runGuarded('send_message', { body: 'hi', account: 'X' }, () => {
      ran = true;
      return ok('twice');
    }, 5);
    expect([ran, repeat.isError]).toEqual([false, true]);
    expect(text(repeat)).toContain(`already running (started 0m 0s ago). Call ${CHECK_TOOL} with id "${idOf(parked)}"`);

    expect(await runGuarded('send_message', { account: 'X', body: 'other' }, () => ok('other'), 50)).toEqual(ok('other'));
    expect(await runGuarded('get_allergies', ACCOUNT, () => ok('allergies'), 50)).toEqual(ok('allergies'));

    d.resolve(ok('sent'));
    await tick();
    const unread = await runGuarded('send_message', { account: 'X', body: 'hi' }, () => ok('twice'), 5);
    expect(text(unread)).toContain('finished, with its result unread');
  });

  it('does not block an identical call that is merely inside the deadline', async () => {
    let runs = 0;
    const d = deferred();
    const run = () => {
      runs++;
      return d.fn();
    };
    const [a, b] = [runGuarded('get_billing', ACCOUNT, run, 1000), runGuarded('get_billing', ACCOUNT, run, 1000)];
    d.resolve(ok('bills'));
    expect([await a, await b, runs]).toEqual([ok('bills'), ok('bills'), 2]);
  });
});

describe('checkPendingCall', () => {
  it('returns each parked result by id exactly once', async () => {
    const d1 = deferred();
    const d2 = deferred();
    const a = idOf(await runGuarded('get_billing', ACCOUNT, d1.fn, 5));
    const b = idOf(await runGuarded('get_documents', ACCOUNT, d2.fn, 5));
    d2.resolve(ok('docs'));
    await tick();
    expect(await checkPendingCall({ id: b })).toEqual(ok('docs'));
    expect((await checkPendingCall({ id: b })).isError).toBe(true);

    const waiting = checkPendingCall({ id: a }, 1000);
    d1.resolve(ok('bills'));
    expect(await waiting).toEqual(ok('bills'));
  });

  it('reports a still-running call after the wait, or at once with wait: false', async () => {
    const d = deferred();
    const id = idOf(await runGuarded('get_billing', ACCOUNT, d.fn, 5));
    expect(text(await checkPendingCall({ id }, 5))).toMatch(/is still running \(\d+m \d+s so far/);
    expect(text(await checkPendingCall({ id, wait: false }, 60_000))).toContain('abandon: true');
    d.resolve(ok('bills'));
  });

  it('abandon frees the repeat, keeps the proxy guard until the scrape settles, and discards the result', async () => {
    const d = deferred();
    const id = idOf(await runGuarded('get_billing', { account: 'Homer@MyChart.example.org' }, d.fn, 5));
    expect(unsettledCallOnAccount('homer@mychart.example.org')?.id).toBe(id);
    expect(unsettledCallOnAccount('marge@mychart.example.org')).toBeUndefined();

    const r = await checkPendingCall({ id, abandon: true });
    expect(text(r)).toContain('already sent still lands');
    expect(text(r)).toContain('switch_proxy_target on homer@mychart.example.org refuses');
    expect(unsettledCallOnAccount('homer@mychart.example.org')?.id).toBe(id);
    expect(await runGuarded('get_billing', { account: 'Homer@MyChart.example.org' }, () => ok('again'), 50)).toEqual(ok('again'));

    d.resolve(ok('bills'));
    await tick();
    expect(unsettledCallOnAccount('homer@mychart.example.org')).toBeUndefined();
    expect((await checkPendingCall({ id })).isError).toBe(true);
  });

  it('gives up at the 10-minute cap, and never waits past it', async () => {
    const d = deferred();
    const id = idOf(await runGuarded('get_billing', ACCOUNT, d.fn, 5));
    // 10 ms short of the cap: a 60 s wait must be cut to that, then count as the cap.
    setSystemTime(new Date(Date.now() + MAX_RUN_MS - 10));
    const r = await checkPendingCall({ id }, 60_000);
    expect([r.isError, text(r)]).toEqual([true, expect.stringContaining('Gave up on get_billing')]);
    expect(await runGuarded('get_billing', ACCOUNT, () => ok('fresh'), 50)).toEqual(ok('fresh'));
    d.resolve(ok('bills'));
  });
});

describe('registered through the server', () => {
  type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;

  it('guards every tool, and switch_proxy_target waits for a parked read on its account', async () => {
    expect(CAPABILITIES.some((c) => c.id === 'switch_proxy_target')).toBe(true);
    const { registerAllTools } = await import('../tools');
    const tools = new Map<string, Handler>();
    registerAllTools({
      registerTool: (name: string, _config: unknown, handler: Handler) => {
        tools.set(name, handler);
      },
    } as unknown as McpServer);

    const d = deferred();
    const id = idOf(await runGuarded('get_billing', ACCOUNT, d.fn, 5));
    expect(text(await tools.get('get_billing')!(ACCOUNT))).toContain('This exact call is already running');
    expect(text(await tools.get('switch_proxy_target')!({ ...ACCOUNT, patient: 'me' }))).toContain(
      `get_billing (id "${id}") is still reading this account's chart`,
    );
    expect(text(await tools.get('switch_proxy_target')!({ account: 'marge@mychart.example.org', patient: 'me' }))).not.toContain('still reading');
    expect((await tools.get('list_accounts')!({})).isError).toBeUndefined();

    d.resolve(ok('bills'));
    await tick();
    expect(await tools.get(CHECK_TOOL)!({ id })).toEqual(ok('bills'));
  });
});
