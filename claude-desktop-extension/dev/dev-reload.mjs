#!/usr/bin/env node
// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

// Launches the hot-reload dev loop with auto-assigned ports so multiple
// worktrees / Claude sessions can run their own instance without collisions.
//
// Only the MCP Inspector binds TCP ports — two of them:
//   CLIENT_PORT  → the browser UI        (default 6274)
//   SERVER_PORT  → the inspector proxy   (default 6277)
// tsup (the bundler) and mcpmon (a stdio proxy) don't bind ports at all, so
// there's nothing to randomize for them; each worktree's `node dist/server.cjs`
// is an independent stdio child.
//
// We grab two free ephemeral ports from the OS (guaranteed open right now),
// then hand them to the Inspector via env vars. Pin either one by exporting
// CLIENT_PORT / SERVER_PORT before running — those are honored as-is.
import net from 'node:net';
import { spawn } from 'node:child_process';

function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      // Keep the listener open until we've reserved *both* ports, so the OS
      // won't hand us the same number twice; caller closes it before launch.
      resolve({ port, release: () => new Promise((r) => srv.close(r)) });
    });
  });
}

const held = [];
let clientPort = process.env.CLIENT_PORT ? Number(process.env.CLIENT_PORT) : null;
let serverPort = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : null;

if (clientPort == null) {
  const h = await reserveFreePort();
  clientPort = h.port;
  held.push(h);
}
if (serverPort == null) {
  const h = await reserveFreePort();
  serverPort = h.port;
  held.push(h);
}
// Release the reservations right before the Inspector binds them.
await Promise.all(held.map((h) => h.release()));

console.log(
  `\n  MCP Inspector → UI http://localhost:${clientPort}  (proxy :${serverPort})\n`,
);

const inner =
  './node_modules/.bin/mcp-inspector ./node_modules/.bin/mcpmon ' +
  '--watch dist --ext cjs -- node dist/server.cjs';

const child = spawn(
  './node_modules/.bin/concurrently',
  ['-k', '-n', 'tsup,mcp', '-c', 'blue,green', './node_modules/.bin/tsup --watch', inner],
  {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      CLIENT_PORT: String(clientPort),
      SERVER_PORT: String(serverPort),
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
