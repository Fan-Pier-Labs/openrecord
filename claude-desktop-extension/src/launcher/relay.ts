// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Passes MCP stdio between Claude Desktop and a server child process.
 *
 * Messages go through untouched except for two things:
 *  - A payload that dies before answering `initialize` is abandoned for the
 *    next one in line, and everything the client has sent so far is replayed
 *    to it, so a broken download costs a slower start rather than a dead
 *    extension. After the handshake a crash ends the launcher too, exactly as
 *    a crashed server did before there was a launcher.
 *  - While `notice()` returns text, it is appended to every `tools/call`
 *    result. A tool result is the only place this process can reach the user.
 */

import { spawn, type ChildProcessByStdio } from 'child_process';
import * as path from 'path';
import type { Readable, Writable } from 'stream';
import type { Payload } from './payloads';

interface Message {
  id?: string | number | null;
  method?: string;
  result?: { content?: unknown };
}

function parse(line: string): Message | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Calls `onLine` for each newline-terminated line, without the newline. */
export function forEachLine(stream: Readable, onLine: (line: string) => void): void {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) onLine(line);
    }
  });
}

export interface RelayOptions {
  /** Best first. The last is the bundled payload, which is never abandoned. */
  payloads: Payload[];
  input: Readable;
  output: Writable;
  /** Prepended to the child's NODE_PATH: where the installed native modules are. */
  nodeModules: string;
  notice: () => string | null;
  onStart: (payload: Payload) => void;
  onStartupFailure: (payload: Payload) => void;
  onExit: (code: number) => void;
}

export function relay(options: RelayOptions): void {
  let index = 0;
  let child: ChildProcessByStdio<Writable, Readable, null>;
  let initId: Message['id'];
  let initialized = false;
  let inputEnded = false;
  /** Everything the client sent before the handshake finished, for a replacement child. */
  const beforeInit: string[] = [];
  const toolCalls = new Set<string | number>();

  const fromServer = (line: string): void => {
    const message = parse(line);
    // A response: has an id and no method (a request from the server has both).
    if (message && message.method === undefined && message.id != null) {
      if (!initialized && message.id === initId) {
        initialized = true;
        beforeInit.length = 0;
      }
      const notice = toolCalls.delete(message.id) ? options.notice() : null;
      if (notice && Array.isArray(message.result?.content)) {
        message.result.content.push({ type: 'text', text: notice });
        options.output.write(JSON.stringify(message) + '\n');
        return;
      }
    }
    options.output.write(line + '\n');
  };

  const start = (): void => {
    const payload = options.payloads[index]!;
    options.onStart(payload);
    const inherited = process.env.NODE_PATH;
    child = spawn(process.execPath, [path.join(payload.dir, 'server.cjs')], {
      cwd: payload.dir,
      stdio: ['pipe', 'pipe', 'inherit'],
      // ELECTRON_RUN_AS_NODE and the rest pass through: under Claude Desktop's
      // built-in runtime, execPath is the app binary and that is what makes it Node.
      env: {
        ...process.env,
        NODE_PATH: inherited ? `${options.nodeModules}${path.delimiter}${inherited}` : options.nodeModules,
      },
    });
    // Writes to a child that just died fail with EPIPE; its 'close' handles what comes next.
    child.stdin.on('error', () => {});
    forEachLine(child.stdout, fromServer);
    child.on('close', (code) => {
      const isLast = index === options.payloads.length - 1;
      if (!initialized && !inputEnded && !isLast) {
        options.onStartupFailure(payload);
        index++;
        start();
        return;
      }
      options.onExit(code ?? 1);
    });
    for (const line of beforeInit) child.stdin.write(line + '\n');
    if (inputEnded) child.stdin.end();
  };

  forEachLine(options.input, (line) => {
    const message = parse(line);
    if (message?.method === 'initialize') initId = message.id;
    if (message?.method === 'tools/call' && message.id != null) toolCalls.add(message.id);
    if (!initialized) beforeInit.push(line);
    child.stdin.write(line + '\n');
  });
  options.input.on('end', () => {
    inputEnded = true;
    child.stdin.end();
  });

  start();
}
