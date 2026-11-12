// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import type { Payload } from '../payloads';
import { forEachLine, relay } from '../relay';
import { tempDir } from './fixtures';

/** A stand-in server.cjs: answers initialize, tools/list and tools/call; `crash` exits 7. */
function fakeServer(name: string): Payload {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'server.cjs'), `
    const out = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\\n')) !== -1) {
        const m = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (m.method === 'initialize') out({ id: m.id, result: { serverInfo: { name: ${JSON.stringify(name)} } } });
        if (m.method === 'tools/list') out({ id: m.id, result: { tools: [] } });
        if (m.method === 'tools/call') out({ id: m.id, result: { content: [{ type: 'text', text: 'ok' }] } });
        if (m.method === 'crash') process.exit(7);
      }
    });
    process.stdin.on('end', () => process.exit(0));
  `);
  return { version: name, dir, bundled: false };
}

function brokenServer(): Payload {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'server.cjs'), 'process.exit(3)');
  return { version: 'broken', dir, bundled: false };
}

interface Response {
  id: number;
  result: { serverInfo?: { name: string }; content?: { text: string }[]; tools?: unknown[] };
}

function start(payloads: Payload[], notice: string | null = null) {
  const input = new PassThrough();
  const output = new PassThrough();
  const failed: string[] = [];
  const lines: Response[] = [];
  const waiters: ((r: Response) => void)[] = [];
  forEachLine(output, (line) => {
    const message = JSON.parse(line) as Response;
    const waiter = waiters.shift();
    if (waiter) waiter(message);
    else lines.push(message);
  });
  const exited = new Promise<number>((resolve) => {
    relay({
      payloads,
      input,
      output,
      nodeModules: '/nowhere',
      notice: () => notice,
      onStart: () => {},
      onStartupFailure: (p) => failed.push(p.version),
      onExit: resolve,
    });
  });
  const send = (id: number, method: string): Promise<Response> => {
    input.write(JSON.stringify({ jsonrpc: '2.0', id, method, params: {} }) + '\n');
    return new Promise((resolve) => {
      const ready = lines.shift();
      if (ready) resolve(ready);
      else waiters.push(resolve);
    });
  };
  return { input, send, failed, exited };
}

describe('relay', () => {
  it('replays the handshake to the next payload when one dies before answering it', async () => {
    const relayed = start([brokenServer(), fakeServer('good')]);
    const init = await relayed.send(1, 'initialize');
    expect(init.result.serverInfo?.name).toBe('good');
    expect(relayed.failed).toEqual(['broken']);
    relayed.input.end();
    expect(await relayed.exited).toBe(0);
  });

  it('appends the notice to tool results and nothing else', async () => {
    const relayed = start([fakeServer('good')], 'Reinstall OpenRecord.');
    await relayed.send(1, 'initialize');
    expect((await relayed.send(2, 'tools/list')).result).toEqual({ tools: [] });
    const call = await relayed.send(3, 'tools/call');
    expect(call.result.content?.map((c) => c.text)).toEqual(['ok', 'Reinstall OpenRecord.']);
    relayed.input.end();
    await relayed.exited;
  });

  it('exits with the server once the handshake is done, rather than switching servers mid-session', async () => {
    const relayed = start([fakeServer('first'), fakeServer('second')]);
    await relayed.send(1, 'initialize');
    relayed.input.write(JSON.stringify({ jsonrpc: '2.0', method: 'crash' }) + '\n');
    expect(await relayed.exited).toBe(7);
    expect(relayed.failed).toEqual([]);
  });
});
