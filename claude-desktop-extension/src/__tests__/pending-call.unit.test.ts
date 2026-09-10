/**
 * Parking behind check_pending_call: a call that beats the deadline is
 * invisible, one that misses it is parked under an id, only an identical call
 * is refused meanwhile, several can park at once, and abandon frees the
 * caller without pretending to stop the work — which is why the proxy-switch
 * guard keeps seeing an abandoned call until it settles.
 *
 * Deadlines are passed in as a few milliseconds; the 10-minute cap is
 * exercised by moving the clock with `setSystemTime`.
 */
import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CAPABILITIES } from '../../../shared/capabilities';
import {
  CHECK_TOOL,
  MAX_RUN_MS,
  checkPendingCall,
  resetPendingCalls,
  runGuarded,
  unsettledCallOnAccount,
} from '../pending-call';

const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] });
const text = (r: CallToolResult): string => (r.content[0] as { text: string }).text;
const idOf = (r: CallToolResult): string => /id "([^"]+)"/.exec(text(r))![1]!;

/** A handler whose completion the test controls. */
function deferred() {
  let resolve!: (r: CallToolResult) => void;
  const promise = new Promise<CallToolResult>((res) => {
    resolve = res;
  });
  return { fn: () => promise, resolve };
}

const tick = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

const ACCOUNT = { account: 'homer@mychart.example.org' };

beforeEach(() => resetPendingCalls());
afterEach(() => setSystemTime());

describe('runGuarded', () => {
  it('returns a fast result untouched and parks nothing', async () => {
    expect(await runGuarded('get_profile', ACCOUNT, () => ok('profile'), 50)).toEqual(ok('profile'));
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('turns a thrown error into an error result, still parking nothing', async () => {
    const r = await runGuarded('get_profile', ACCOUNT, () => Promise.reject(new Error('boom')), 50);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Error: boom');
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('parks a call that misses the deadline under an id, and says not to repeat it', async () => {
    const d = deferred();
    const r = await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    expect(r.isError).toBeUndefined();
    expect(text(r)).toMatch(/^get_billing \(id "[^"]+"\) is still running after/);
    expect(text(r)).toContain(CHECK_TOOL);
    expect(text(r)).toContain('Do NOT call get_billing again with the same arguments');
    expect(idOf(r)).toMatch(/^[0-9a-f-]{36}$/);
    d.resolve(ok('bills'));
  });

  it('lets a different call run while one is parked', async () => {
    const d = deferred();
    await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    expect(await runGuarded('get_allergies', ACCOUNT, () => ok('allergies'), 50)).toEqual(ok('allergies'));
    // Same tool, different arguments, is a different call.
    expect(await runGuarded('get_billing', { account: 'marge@mychart.example.org' }, () => ok('marge'), 50)).toEqual(ok('marge'));
    d.resolve(ok('bills'));
  });

  it('refuses the identical call while it is parked, so a retry never doubles the work', async () => {
    let runs = 0;
    const d = deferred();
    const first = await runGuarded('send_message', { account: 'X', body: 'hi' }, () => {
      runs++;
      return d.fn();
    }, 5);
    const again = await runGuarded('send_message', { body: 'hi', account: 'X' }, () => {
      runs++;
      return d.fn();
    }, 5);
    expect(runs).toBe(1);
    expect(again.isError).toBe(true);
    expect(text(again)).toContain('This exact call is already running');
    expect(text(again)).toContain(idOf(first));
    d.resolve(ok('sent'));
  });

  it('does not block an identical call that is merely inside the deadline', async () => {
    // The host has not failed anything yet, so there is no retry to guard.
    let runs = 0;
    const d = deferred();
    const a = runGuarded('get_billing', ACCOUNT, () => {
      runs++;
      return d.fn();
    }, 1000);
    const b = runGuarded('get_billing', ACCOUNT, () => {
      runs++;
      return d.fn();
    }, 1000);
    d.resolve(ok('bills'));
    expect(await a).toEqual(ok('bills'));
    expect(await b).toEqual(ok('bills'));
    expect(runs).toBe(2);
  });

  it('refuses the identical call while its result is unread, pointing at the id', async () => {
    const d = deferred();
    const parked = await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    d.resolve(ok('bills'));
    await tick();

    const r = await runGuarded('get_billing', ACCOUNT, () => ok('never'), 5);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('already ran and its result is waiting to be read');
    expect(text(r)).toContain(idOf(parked));
  });

  it('parks several calls at once, each under its own id', async () => {
    const d1 = deferred();
    const d2 = deferred();
    const a = await runGuarded('get_billing', ACCOUNT, d1.fn, 5);
    const b = await runGuarded('get_documents', ACCOUNT, d2.fn, 5);
    expect(idOf(a)).not.toBe(idOf(b));

    const listing = await checkPendingCall({});
    expect(text(listing)).toContain('2 calls are pending');
    expect(text(listing)).toContain(idOf(a));
    expect(text(listing)).toContain(idOf(b));

    d2.resolve(ok('docs'));
    await tick();
    expect(await checkPendingCall({ id: idOf(b) })).toEqual(ok('docs'));
    d1.resolve(ok('bills'));
    await tick();
    expect(await checkPendingCall({})).toEqual(ok('bills'));
  });
});

describe('checkPendingCall', () => {
  it('returns the finished result exactly, once, with or without the id', async () => {
    const d = deferred();
    const parked = await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    d.resolve(ok('bills'));
    await tick();

    expect(await checkPendingCall({ id: idOf(parked) })).toEqual(ok('bills'));
    expect(text(await checkPendingCall({ id: idOf(parked) }))).toContain('No pending call has id');
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('waits for a running call and returns its result when it lands', async () => {
    const d = deferred();
    await runGuarded('get_billing', ACCOUNT, d.fn, 5);

    const waiting = checkPendingCall({}, 1000);
    d.resolve(ok('bills'));
    expect(await waiting).toEqual(ok('bills'));
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('reports the id, elapsed time and the abandon option when the wait runs out', async () => {
    const d = deferred();
    const parked = await runGuarded('get_billing', ACCOUNT, d.fn, 5);

    const r = await checkPendingCall({}, 5);
    expect(r.isError).toBeUndefined();
    expect(text(r)).toMatch(/get_billing \(id "[^"]+"\) is still running \(\d+m \d+s so far/);
    expect(text(r)).toContain(idOf(parked));
    expect(text(r)).toContain('abandon: true');
    d.resolve(ok('bills'));
  });

  it('with wait: false reports at once without waiting', async () => {
    const d = deferred();
    await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    const r = await checkPendingCall({ wait: false }, 60_000);
    expect(text(r)).toContain('is still running');
    d.resolve(ok('bills'));
  });

  it('abandon lets the identical call run again and says the work itself is not stopped', async () => {
    const d = deferred();
    await runGuarded('send_message', ACCOUNT, d.fn, 5);

    const r = await checkPendingCall({ abandon: true });
    expect(text(r)).toContain('Abandoned send_message');
    expect(text(r)).toContain('already sent still lands');
    expect(text(r)).toContain('switch_proxy_target on homer@mychart.example.org refuses');
    expect(await runGuarded('send_message', ACCOUNT, () => ok('sent again'), 50)).toEqual(ok('sent again'));
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');

    // The abandoned call finishing later must not come back as collectable.
    d.resolve(ok('sent'));
    await tick();
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('abandon discards a finished result unread', async () => {
    const d = deferred();
    await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    d.resolve(ok('bills'));
    await tick();
    expect(text(await checkPendingCall({ abandon: true }))).toContain('discarded unread');
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('gives up on a call past the 10-minute cap', async () => {
    const d = deferred();
    const parked = await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    setSystemTime(new Date(Date.now() + MAX_RUN_MS + 1000));

    const r = await checkPendingCall({ id: idOf(parked) }, 60_000);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Gave up on get_billing');
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
    // …and the identical call may run again.
    expect(await runGuarded('get_billing', ACCOUNT, () => ok('fresh'), 50)).toEqual(ok('fresh'));
    d.resolve(ok('bills'));
  });

  it('never waits past the 10-minute cap even when asked to wait', async () => {
    const d = deferred();
    await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    // 10 ms short of the cap: the wait must be clipped to that, not run 60 s.
    setSystemTime(new Date(Date.now() + MAX_RUN_MS - 10));
    const r = await checkPendingCall({}, 60_000);
    expect(text(r)).toContain('Gave up on get_billing');
    d.resolve(ok('bills'));
  });
});

describe('unsettledCallOnAccount', () => {
  it('sees a parked read on the account until it settles, abandoned or not', async () => {
    const d = deferred();
    const parked = await runGuarded('get_billing', { account: 'Homer@MyChart.example.org' }, d.fn, 5);
    expect(unsettledCallOnAccount('homer@mychart.example.org')?.id).toBe(idOf(parked));
    expect(unsettledCallOnAccount('marge@mychart.example.org')).toBeUndefined();

    await checkPendingCall({ abandon: true });
    expect(unsettledCallOnAccount('homer@mychart.example.org')?.id).toBe(idOf(parked));

    d.resolve(ok('bills'));
    await tick();
    expect(unsettledCallOnAccount('homer@mychart.example.org')).toBeUndefined();
  });

  it('ignores a call that is inside the deadline, and one whose result is merely unread', async () => {
    const d = deferred();
    await runGuarded('get_billing', ACCOUNT, d.fn, 5);
    d.resolve(ok('bills'));
    await tick();
    expect(unsettledCallOnAccount(ACCOUNT.account)).toBeUndefined();
  });
});

describe('registered through the server', () => {
  type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;

  it('switch_proxy_target is a capability, so the guard in tools.ts has something to attach to', () => {
    expect(CAPABILITIES.some((c) => c.id === 'switch_proxy_target')).toBe(true);
  });

  it('every guarded tool refuses only its own identical repeat, and switch_proxy_target waits for the read', async () => {
    const { registerAllTools } = await import('../tools');
    const tools = new Map<string, Handler>();
    registerAllTools({
      registerTool: (name: string, _config: unknown, handler: Handler) => {
        tools.set(name, handler);
      },
    } as unknown as McpServer);

    const d = deferred();
    const parked = await runGuarded('get_billing', ACCOUNT, d.fn, 5);

    // The identical call through the registered handler is refused by the guard.
    const repeat = await tools.get('get_billing')!(ACCOUNT);
    expect(repeat.isError).toBe(true);
    expect(text(repeat)).toContain('This exact call is already running');

    // The proxy switch on that account refuses; on another account it gets
    // as far as the (unconfigured) account lookup instead.
    const sw = await tools.get('switch_proxy_target')!({ ...ACCOUNT, patient: 'me' });
    expect(text(sw)).toContain(`get_billing (id "${idOf(parked)}") is still reading this account's chart`);
    const other = await tools.get('switch_proxy_target')!({ account: 'marge@mychart.example.org', patient: 'me' });
    expect(text(other)).not.toContain('still reading');

    // A different tool is not blocked at all.
    expect((await tools.get('list_accounts')!({})).isError).toBeUndefined();

    d.resolve(ok('bills'));
    await tick();
    expect(await tools.get(CHECK_TOOL)!({ id: idOf(parked) })).toEqual(ok('bills'));
  });
});
