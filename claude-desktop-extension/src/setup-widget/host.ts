import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PendingCallNote } from '../pending-call';

/**
 * The widget's side of the MCP Apps JSON-RPC bridge to Claude Desktop. The
 * transport is injected (main.tsx posts to window.parent) so a test can play
 * the host.
 */

const PROTOCOL_VERSION = '2026-01-26';

export interface RpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

export interface Host {
  /** Settles once the handshake does; every call waits on it. */
  ready: Promise<void>;
  /** A tool's result: its JSON, else its text. Never throws — a failure is an "Error: …" string, like a tool error. */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Post a user-role message to the conversation, so Claude resumes the original task. */
  sendMessage(text: string): Promise<unknown>;
  notify(method: string, params: unknown): void;
}

/** A tool result's JSON (or text), and the id to wait on when the call was parked. */
export function decodeToolResult(raw: unknown): { value: unknown; parkedId: string | null } {
  const r = raw as Partial<CallToolResult> | null | undefined;
  const text = Array.isArray(r?.content) ? r.content.find((c) => c.type === 'text') : undefined;
  const id = (r?.structuredContent as Partial<PendingCallNote> | undefined)?.pending_call?.id;
  // Fallback until Claude Desktop is confirmed to forward structuredContent on
  // an app's tools/call; without it a slow keychain prompt reads as a failed
  // scan. Delete once confirmed.
  const fromText = text ? /\(id "([^"]+)"\) is still running/.exec(text.text)?.[1] : undefined;
  const parkedId = typeof id === 'string' ? id : fromText ?? null;
  if (!text) return { value: raw, parkedId };
  try {
    return { value: JSON.parse(text.text) as unknown, parkedId };
  } catch {
    return { value: text.text, parkedId };
  }
}

export function createHost(post: (msg: RpcMessage) => void): { host: Host; receive: (data: unknown) => void } {
  let nextId = 0;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const receive = (data: unknown) => {
    const msg = data as RpcMessage | null;
    if (msg?.jsonrpc !== '2.0' || msg.id == null) return;
    const entry = waiting.get(msg.id);
    if (!entry) return;
    waiting.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message || 'RPC error'));
    else entry.resolve(msg.result);
  };

  const rpc = (method: string, params: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      waiting.set(id, { resolve, reject });
      post({ jsonrpc: '2.0', id, method, params });
    });

  const notify = (method: string, params: unknown) => post({ jsonrpc: '2.0', method, params });

  const ready = rpc('ui/initialize', {
    appInfo: { name: 'openrecord-setup', version: '2.0.0' },
    appCapabilities: {},
    protocolVersion: PROTOCOL_VERSION,
  }).then(() => notify('ui/notifications/initialized', {}));

  const callOnce = async (name: string, args: Record<string, unknown>) => {
    await ready;
    return decodeToolResult(await rpc('tools/call', { name, arguments: args }));
  };

  const host: Host = {
    ready,
    // A call that outruns the host's timeout comes back parked rather than with
    // its result — a scan waiting on the keychain prompt, or a slow portal.
    // Wait it out, so every caller sees the result.
    async callTool(name, args) {
      try {
        let { value, parkedId } = await callOnce(name, args);
        while (parkedId) ({ value, parkedId } = await callOnce('check_pending_call', { id: parkedId }));
        return value;
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    sendMessage: (text) => ready.then(() => rpc('ui/message', { role: 'user', content: [{ type: 'text', text }] })),
    notify,
  };
  return { host, receive };
}
