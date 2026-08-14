#!/usr/bin/env node
/**
 * Startup smoke test for the packed extension: does `dist/server.cjs` actually
 * come up as an MCP stdio server under plain `node`, and answer?
 *
 * This is the one check that runs the BUNDLE the way Claude Desktop runs it —
 * a separate `node` process, no bundler, no test runner, no Bun. Everything
 * else in this package tests the TypeScript sources in-process:
 * `capability-parity.unit.test.ts` imports `registerAllTools` directly and is
 * the authority on *which* tools exist; `meta-tools.unit.test.ts` invokes the
 * handlers. Neither would notice a bundle that cannot boot.
 *
 * It runs from a STAGED COPY of the artifact, not from dist/ in place, because
 * in place is not what ships. `.mcpbignore` keeps node_modules (and
 * package.json, and src/) out of the .mcpb: the extension is one self-contained
 * CJS file next to the manifest, and `require` of anything not bundled into it
 * has nowhere to resolve from. Run in place, the whole repo's node_modules sits
 * a couple of directories up and quietly satisfies exactly the imports that
 * would be MODULE_NOT_FOUND on a patient's machine — @napi-rs/keyring, for one,
 * already resolves in a dev checkout as a transitive dependency of the MCP
 * inspector. Staging is what makes this test able to fail.
 *
 * What only this catches:
 *   - a dependency that resolves at build time but not at runtime — anything
 *     left external to the bundle (a native module such as @napi-rs/keyring)
 *     is a MODULE_NOT_FOUND the moment Claude Desktop launches it, and the
 *     build stays green
 *   - stdout framing. Stdio MCP requires stdout carry ONLY JSON-RPC; one
 *     stray `console.log` from any bundled module and the host reports
 *     "Unexpected token ... is not valid JSON". Every stdout line is parsed
 *     here, so a stray write fails the smoke instead of shipping.
 *   - a bundle that boots but registers nothing, e.g. the capability loop
 *     tree-shaken away.
 *
 * Run: `bun run smoke` (builds first). Every check runs, so one invocation
 * reports everything that is wrong; the exit code is non-zero if any failed,
 * and the child's stderr is printed with them. A crash or a hang stops the run
 * where it happened, since nothing after it would mean anything.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = import.meta.dirname;
const SERVER = path.join(HERE, 'dist', 'server.cjs');
const MANIFEST = path.join(HERE, 'manifest.json');

/** MCP revision this server declares (see the header of src/index.ts). */
const PROTOCOL_VERSION = '2025-06-18';

/**
 * A floor, not the real count — `capability-parity.unit.test.ts` owns
 * exactness against `shared/capabilities.ts`, and duplicating the number here
 * would just be a second thing to update. This only has to be high enough to
 * catch "the per-capability registration loop never ran", which is the failure
 * a booted-but-empty bundle presents as. The registry currently carries ~50.
 */
const MIN_TOOLS = 40;

/** Nothing here should take anywhere near this; a hang is a failure. */
const REQUEST_TIMEOUT_MS = 20_000;

// ── tiny assert/report harness ─────────────────────────────────────────────

const failures = [];

/**
 * The staged directory and the server process, tracked at module scope so that
 * every exit — pass, failed check, timeout, crash — runs the same teardown.
 * A `finally` block is not enough on its own: the failure paths call
 * `process.exit`, which skips it, and the child of a *hung* server has no
 * reason to exit on its own.
 */
let stagedDir = null;
let serverProcess = null;

function cleanup() {
  if (serverProcess) {
    serverProcess.kill('SIGKILL');
    serverProcess = null;
  }
  if (stagedDir) {
    fs.rmSync(stagedDir, { recursive: true, force: true });
    stagedDir = null;
  }
}

function check(label, condition, detail) {
  if (condition) {
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    process.stdout.write(`  FAIL ${label}${detail ? ` — ${detail}` : ''}\n`);
    failures.push(label);
  }
}

function fatal(message, stderr) {
  process.stdout.write(`\n  FAIL ${message}\n`);
  if (stderr && stderr.trim()) {
    process.stdout.write('\n--- server stderr ---\n' + stderr.trimEnd() + '\n---------------------\n');
  }
  cleanup();
  process.exit(1);
}

// ── the MCP stdio client ───────────────────────────────────────────────────

/**
 * Speaks just enough of the protocol to handshake and list tools: JSON-RPC 2.0
 * over newline-delimited JSON on the child's stdin/stdout.
 */
class StdioClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    /** Non-JSON stdout lines — each one is corrupted framing. */
    this.garbage = [];
    this.stderr = '';
    this.exit = null;

    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) this.handleLine(line);
      }
    });
    child.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString('utf8');
    });
    child.on('exit', (code, signal) => {
      this.exit = { code, signal };
      for (const { reject } of this.pending.values()) {
        reject(new Error(`server exited (code ${code}, signal ${signal}) before replying`));
      }
      this.pending.clear();
    });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.garbage.push(line);
      return;
    }
    const waiter = message.id != null ? this.pending.get(message.id) : undefined;
    if (!waiter) return; // notification, or a reply to nothing — ignore
    this.pending.delete(message.id);
    if (message.error) {
      waiter.reject(new Error(`${message.error.message} (code ${message.error.code})`));
    } else {
      waiter.resolve(message.result);
    }
  }

  send(message) {
    this.child.stdin.write(JSON.stringify(message) + '\n');
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      const settle = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      this.pending.set(id, { resolve: settle(resolve), reject: settle(reject) });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method, params) {
    this.send({ jsonrpc: '2.0', method, params });
  }
}

// ── the run ────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(SERVER)) {
    fatal(`no bundle at ${SERVER} — run \`bun run build\` first`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openrecord-smoke-'));
  stagedDir = tmp;

  // The .mcpb layout: the manifest, and dist/ beside it. Nothing else — see the
  // header on why running dist/ in place cannot catch an unbundled dependency.
  const staged = path.join(tmp, 'extension');
  fs.mkdirSync(path.join(staged, 'dist'), { recursive: true });
  fs.copyFileSync(SERVER, path.join(staged, 'dist', 'server.cjs'));
  fs.copyFileSync(MANIFEST, path.join(staged, 'manifest.json'));

  // A throwaway home directory: the credential store lives under
  // ~/.openrecord-mcpb, and the smoke must neither read the developer's real
  // accounts nor leave anything behind. It also makes list_accounts below
  // deterministic (always empty) on every machine.
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home);

  process.stdout.write(`\nSmoke: node dist/server.cjs, staged in ${staged}\n\n`);

  const child = spawn(process.execPath, [path.join(staged, 'dist', 'server.cjs')], {
    cwd: staged,
    stdio: ['pipe', 'pipe', 'pipe'],
    // NODE_PATH is cleared deliberately: it is a back door around the staging
    // above, and a bundle that needs it is a bundle that will not boot in
    // Claude Desktop.
    env: { ...process.env, HOME: home, USERPROFILE: home, NODE_PATH: '' },
  });
  serverProcess = child;
  const client = new StdioClient(child);

  try {
    // 1. Handshake. A bundle with an unresolvable require dies here, and the
    //    request rejects with the exit code rather than hanging.
    const init = await client.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'openrecord-smoke', version: '0.0.0' },
    });
    check('initialize answers', init != null);
    check(
      'identifies itself as openrecord',
      init?.serverInfo?.name === 'openrecord',
      `serverInfo.name = ${JSON.stringify(init?.serverInfo?.name)}`,
    );
    check(
      `negotiates a protocol version (asked for ${PROTOCOL_VERSION})`,
      typeof init?.protocolVersion === 'string' && init.protocolVersion.length > 0,
      `got ${JSON.stringify(init?.protocolVersion)}`,
    );
    check('advertises the tools capability', init?.capabilities?.tools != null);

    client.notify('notifications/initialized', {});

    // 2. The tool surface. Names, not just a count: the manifest is what
    //    Claude Desktop shows in the extension's listing, so a tool named
    //    there and missing here is a user-visible lie.
    const listed = await client.request('tools/list', {});
    const tools = listed?.tools ?? [];
    const names = tools.map((t) => t.name);

    check(
      `registers at least ${MIN_TOOLS} tools`,
      names.length >= MIN_TOOLS,
      `got ${names.length}`,
    );

    const duplicated = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    check('registers each tool exactly once', duplicated.length === 0, duplicated.join(', '));

    const manifestTools = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8')).tools ?? [];
    const missing = manifestTools.map((t) => t.name).filter((n) => !names.includes(n));
    check(
      `serves every tool manifest.json advertises (${manifestTools.length})`,
      missing.length === 0,
      `missing ${missing.join(', ')}`,
    );

    const undescribed = tools.filter((t) => !t.description || !t.inputSchema);
    check(
      'every tool carries a description and an input schema',
      undescribed.length === 0,
      undescribed.map((t) => t.name).join(', '),
    );

    // 3. Actually run one. tools/list is answered from a registry built at
    //    import time; a call reaches the code paths a lazily-required native
    //    module would blow up in. list_accounts is the only read-only tool
    //    that touches no network and no MyChart credentials — against the
    //    throwaway home above it must return an empty list.
    const called = await client.request('tools/call', { name: 'list_accounts', arguments: {} });
    check('list_accounts runs without erroring', called?.isError !== true, called?.content?.[0]?.text);
    let payload;
    try {
      payload = JSON.parse(called?.content?.[0]?.text ?? '');
    } catch {
      payload = null;
    }
    check(
      'list_accounts returns a JSON account list',
      Array.isArray(payload?.accounts),
      `payload keys: ${payload ? Object.keys(payload).join(', ') : 'unparseable'}`,
    );

    // 4. Framing. Checked last so it covers every exchange above.
    check(
      'writes nothing but JSON-RPC to stdout',
      client.garbage.length === 0,
      client.garbage.slice(0, 3).map((l) => JSON.stringify(l.slice(0, 120))).join(' | '),
    );
  } catch (err) {
    fatal(err.message, client.stderr);
  } finally {
    cleanup();
  }

  if (failures.length > 0) {
    process.stdout.write(`\n${failures.length} check(s) failed.\n`);
    if (client.stderr.trim()) {
      process.stdout.write('\n--- server stderr ---\n' + client.stderr.trimEnd() + '\n---------------------\n');
    }
    process.exit(1);
  }

  process.stdout.write('\nSmoke passed.\n');
  process.exit(0);
}

main().catch((err) => fatal(err.stack ?? String(err)));
