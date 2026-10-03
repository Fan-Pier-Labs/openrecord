import { afterEach, describe, expect, test } from 'bun:test';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { checkPendingCall, resetPendingCalls, runGuarded } from '../../pending-call';
import { createHost, decodeToolResult, type RpcMessage } from '../host';

const json = (value: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

/**
 * Plays Claude Desktop: answers the handshake, then hands each tools/call to
 * `onTool`. Answers arrive on a later tick, the way postMessage delivers them.
 */
function fakeHost(onTool: (name: string, args: Record<string, unknown>) => unknown) {
  const sent: RpcMessage[] = [];
  const { host, receive } = createHost((msg) => {
    sent.push(msg);
    if (msg.id === undefined) return;
    const answer = async () => {
      const p = msg.params as { name: string; arguments: Record<string, unknown> };
      if (msg.method === 'tools/call') return onTool(p.name, p.arguments);
      return {};
    };
    void answer().then(
      (result) => setTimeout(() => receive({ jsonrpc: '2.0', id: msg.id, result })),
      (err: unknown) => setTimeout(() => receive({ jsonrpc: '2.0', id: msg.id, error: { message: (err as Error).message } })),
    );
  });
  return { host, sent, receive };
}

afterEach(resetPendingCalls);

describe('createHost', () => {
  test('completes the MCP Apps handshake before the first tool call', async () => {
    const { host, sent } = fakeHost(() => json({ ok: true }));
    expect(await host.callTool('list_accounts', {})).toEqual({ ok: true });
    expect(sent.map((m) => m.method)).toEqual(['ui/initialize', 'ui/notifications/initialized', 'tools/call']);
    expect(sent[2]?.params).toEqual({ name: 'list_accounts', arguments: {} });
  });

  test('returns a tool error as its text, and a host failure as an "Error: …" string', async () => {
    const { host } = fakeHost((name) => {
      if (name === 'boom') throw new Error('host went away');
      return { content: [{ type: 'text', text: 'Error: no such account' }], isError: true };
    });
    expect(await host.callTool('register_passkey', {})).toBe('Error: no such account');
    expect(await host.callTool('boom', {})).toBe('Error: host went away');
  });

  test('waits out a parked call until its result arrives', async () => {
    // The real parking path: a scan sitting on the keychain prompt outruns the deadline.
    let finish!: (r: CallToolResult) => void;
    const scan = new Promise<CallToolResult>((resolve) => { finish = resolve; });
    const calls: string[] = [];
    const { host } = fakeHost(async (name, args) => {
      calls.push(name);
      if (name === 'import_browser_passwords') return runGuarded(name, args, () => scan, 1);
      // First check: still running. Then the scan finishes.
      if (calls.length === 2) return checkPendingCall({ id: args.id as string, wait: false });
      finish(json({ supported: true, accounts: [] }));
      return checkPendingCall({ id: args.id as string });
    });
    expect(await host.callTool('import_browser_passwords', {})).toEqual({ supported: true, accounts: [] });
    expect(calls).toEqual(['import_browser_passwords', 'check_pending_call', 'check_pending_call']);
  });

  test('ignores messages that are not answers to its own requests', async () => {
    const { host, receive } = fakeHost(() => json(1));
    receive(null);
    receive({ jsonrpc: '2.0', id: 999, result: 'stray' });
    receive({ jsonrpc: '1.0', id: 0 });
    expect(await host.callTool('x', {})).toBe(1);
  });

  test('sends the done message as a user-role ui/message', async () => {
    const { host, sent } = fakeHost(() => null);
    await host.sendMessage('All set.');
    expect(sent.at(-1)).toMatchObject({ method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'All set.' }] } });
  });
});

describe('decodeToolResult', () => {
  test('reads the id of a parked call from the note as data', async () => {
    const parked = await runGuarded('import_browser_passwords', {}, () => new Promise<CallToolResult>(() => {}), 1);
    const { parkedId } = decodeToolResult(parked);
    expect(parkedId).toMatch(/^[0-9a-f-]{36}$/);
    expect(decodeToolResult(await checkPendingCall({ id: parkedId!, wait: false })).parkedId).toBe(parkedId);
  });

  test('a finished result has no parked id', () => {
    expect(decodeToolResult(json({ supported: true }))).toEqual({ value: { supported: true }, parkedId: null });
    expect(decodeToolResult({ content: [{ type: 'text', text: 'plain' }] })).toEqual({ value: 'plain', parkedId: null });
    expect(decodeToolResult(undefined)).toEqual({ value: undefined, parkedId: null });
  });
});
