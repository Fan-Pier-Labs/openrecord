/**
 * The one-at-a-time slot behind check_pending_call: a call that beats the
 * deadline is invisible, one that misses it parks its result, everything
 * else refuses meanwhile, and abandon frees the slot without pretending to
 * stop the work.
 *
 * Deadlines are passed in as a few milliseconds; the 10-minute cap is
 * exercised by moving the clock with `setSystemTime`.
 */
import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CHECK_TOOL, MAX_RUN_MS, checkPendingCall, resetPendingCall, runGuarded } from '../pending-call';

const ok = (text: string): CallToolResult => ({ content: [{ type: 'text', text }] });
const text = (r: CallToolResult): string => (r.content[0] as { text: string }).text;

/** A handler whose completion the test controls. */
function deferred() {
  let resolve!: (r: CallToolResult) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<CallToolResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { fn: () => promise, resolve, reject };
}

const tick = () =>
  new Promise<void>((r) => {
    setTimeout(r, 0);
  });

beforeEach(() => resetPendingCall());
afterEach(() => setSystemTime());

describe('runGuarded', () => {
  it('returns a fast result untouched and leaves nothing pending', async () => {
    expect(await runGuarded('get_profile', () => ok('profile'), 50)).toEqual(ok('profile'));
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('turns a thrown error into an error result, still untouched by the slot', async () => {
    const r = await runGuarded('get_profile', () => Promise.reject(new Error('boom')), 50);
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Error: boom');
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('hands back a note, not the result, when the deadline passes', async () => {
    const d = deferred();
    const r = await runGuarded('get_billing', d.fn, 5);
    expect(r.isError).toBeUndefined();
    expect(text(r)).toContain('get_billing is still running');
    expect(text(r)).toContain(CHECK_TOOL);
    expect(text(r)).toContain('Do NOT call get_billing again');
    d.resolve(ok('bills'));
  });

  it('refuses every other tool while a call is running, naming it', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);

    let ran = false;
    const r = await runGuarded('switch_proxy_target', () => {
      ran = true;
      return ok('switched');
    }, 5);
    expect(ran).toBe(false);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('get_billing is still running');
    expect(text(r)).toContain('Do NOT call get_billing again');
    d.resolve(ok('bills'));
  });

  it('refuses the same tool called again, so a retry never doubles the work', async () => {
    let runs = 0;
    const d = deferred();
    await runGuarded('send_message', () => {
      runs++;
      return d.fn();
    }, 5);
    await runGuarded('send_message', () => {
      runs++;
      return d.fn();
    }, 5);
    expect(runs).toBe(1);
    d.resolve(ok('sent'));
  });

  it('refuses while a finished result is waiting to be read', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);
    d.resolve(ok('bills'));
    await tick();

    const r = await runGuarded('get_profile', () => ok('profile'), 5);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('result of get_billing is finished and waiting to be read');
  });

  it('lets a new call through once the old one is past the 10-minute cap', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);
    setSystemTime(new Date(Date.now() + MAX_RUN_MS + 1000));

    expect(await runGuarded('get_profile', () => ok('profile'), 50)).toEqual(ok('profile'));
    d.resolve(ok('bills'));
  });
});

describe('checkPendingCall', () => {
  it('returns the finished result exactly, once, and clears the slot', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);
    d.resolve(ok('bills'));
    await tick();

    expect(await checkPendingCall({})).toEqual(ok('bills'));
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
    expect(await runGuarded('get_profile', () => ok('profile'), 50)).toEqual(ok('profile'));
  });

  it('waits for a running call and returns its result when it lands', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);

    const waiting = checkPendingCall({}, 1000);
    d.resolve(ok('bills'));
    expect(await waiting).toEqual(ok('bills'));
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('reports elapsed time and the abandon option when the wait runs out', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);

    const r = await checkPendingCall({}, 5);
    expect(r.isError).toBeUndefined();
    expect(text(r)).toMatch(/get_billing is still running \(\d+m \d+s so far/);
    expect(text(r)).toContain('abandon: true');
    d.resolve(ok('bills'));
  });

  it('with wait: false reports at once without waiting', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);

    const r = await checkPendingCall({ wait: false }, 60_000);
    expect(text(r)).toContain('get_billing is still running');
    d.resolve(ok('bills'));
  });

  it('abandon frees the slot and says the work itself is not stopped', async () => {
    const d = deferred();
    await runGuarded('send_message', d.fn, 5);

    const r = await checkPendingCall({ abandon: true });
    expect(text(r)).toContain('Abandoned send_message');
    expect(text(r)).toContain('already sent still lands');
    expect(await runGuarded('get_profile', () => ok('profile'), 50)).toEqual(ok('profile'));

    // The abandoned call finishing later must not resurrect the slot.
    d.resolve(ok('sent'));
    await tick();
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('abandon discards a finished result unread', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);
    d.resolve(ok('bills'));
    await tick();

    expect(text(await checkPendingCall({ abandon: true }))).toContain('discarded unread');
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
  });

  it('gives up on a call past the 10-minute cap and frees the slot', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);
    setSystemTime(new Date(Date.now() + MAX_RUN_MS + 1000));

    const r = await checkPendingCall({}, 60_000);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Gave up on get_billing after 10 minutes');
    expect(text(await checkPendingCall({}))).toContain('No tool call is pending');
    d.resolve(ok('bills'));
  });

  it('never waits past the 10-minute cap even when asked to wait', async () => {
    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);
    // 10 ms short of the cap: the wait must be clipped to that, not run 60 s.
    setSystemTime(new Date(Date.now() + MAX_RUN_MS - 10));

    const r = await checkPendingCall({}, 60_000);
    expect(text(r)).toContain('Gave up on get_billing');
    d.resolve(ok('bills'));
  });
});

describe('registered through the server', () => {
  it('every tool but check_pending_call refuses while one is pending', async () => {
    const { registerAllTools } = await import('../tools');
    type Handler = (args: Record<string, unknown>) => Promise<CallToolResult>;
    const tools = new Map<string, Handler>();
    const server = {
      registerTool: (name: string, _config: unknown, handler: Handler) => {
        tools.set(name, handler);
      },
    } as unknown as McpServer;
    registerAllTools(server);

    const d = deferred();
    await runGuarded('get_billing', d.fn, 5);
    for (const [name, handler] of tools) {
      if (name === CHECK_TOOL) continue;
      const r = await handler({});
      expect([name, r.isError]).toEqual([name, true]);
      expect(text(r)).toContain('get_billing is still running');
    }
    expect(text(await tools.get(CHECK_TOOL)!({ wait: false }))).toContain('get_billing is still running');
    d.resolve(ok('bills'));
    await tick();
    expect(await tools.get(CHECK_TOOL)!({})).toEqual(ok('bills'));
  });
});
