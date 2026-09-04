/**
 * Runs a command with a fake-mychart server of its own.
 *
 *     bun fake-mychart/scripts/with-fake-mychart.ts bun test --isolate .integration.test.ts
 *
 * Installs deps if needed, builds, starts the server on a port picked by
 * {@link pickFakeMyChartPort}, exports `FAKE_MYCHART_HOST=localhost:<port>`,
 * runs the command, and tears the server down — exiting with the command's own
 * status.
 *
 * `FAKE_MYCHART_HOST` already being set means "a server is running, use that":
 * the command runs against it and nothing is started or torn down. **That is
 * the path CI takes** — it publishes the `docker-compose.ci.yaml` container on
 * 4000 and sets the variable job-wide, and this script stays out of the way.
 *
 * The random port is for everywhere else. Locally the fixed 4000 was the
 * problem: a container or dev server left up by one worktree owned the port for
 * every other worktree on the machine, so a second integration run either
 * failed to bind or quietly reused the first one's server and its
 * already-dirtied state. Starting natively is also several times faster than
 * building the image, so a local run no longer needs Docker at all.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { pickFakeMyChartPort } from './port';

const FAKE_MYCHART_DIR = join(import.meta.dirname, '..');

/** How long the server gets to answer `/api/health` before we give up. */
const STARTUP_TIMEOUT_MS = 60_000;

function log(message: string): void {
  // stderr, so a caller that pipes the command's stdout gets only the command.
  console.error(`[with-fake-mychart] ${message}`);
}

async function run(cmd: string[], label: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd: FAKE_MYCHART_DIR, stdout: 'inherit', stderr: 'inherit' });
  const status = await proc.exited;
  if (status !== 0) throw new Error(`${label} failed with exit code ${status}`);
}

/** How long to keep waiting on another process's build before giving up. */
const BUILD_LOCK_TIMEOUT_MS = 180_000;

/**
 * `next build`, waiting out a build another process in this same checkout is
 * already running.
 *
 * Next takes a lock on `.next` and refuses a second concurrent build outright.
 * Separate worktrees have separate `.next` directories and never collide, but
 * two runs started in one worktree do, and the honest answer to "someone is
 * already building the thing I need built" is to wait for it rather than to
 * fail. Any other build failure is real and raised immediately.
 */
async function build(): Promise<void> {
  const deadline = Date.now() + BUILD_LOCK_TIMEOUT_MS;
  for (;;) {
    const proc = Bun.spawn(['bun', 'run', 'build'], {
      cwd: FAKE_MYCHART_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (status === 0) return;

    const output = stdout + stderr;
    if (/Another next build process is already running/.test(output) && Date.now() < deadline) {
      log('another build holds the .next lock — waiting for it');
      await Bun.sleep(2000);
      continue;
    }
    // Held back until now so a passing build stays quiet, and a failing one
    // still prints everything `next` had to say about why.
    process.stderr.write(output);
    throw new Error(`next build failed with exit code ${status}`);
  }
}

/** Polls `/api/health` until the server answers or {@link STARTUP_TIMEOUT_MS} passes. */
async function waitForHealth(host: string, server: Bun.Subprocess): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // A server that has already exited will never become healthy, and waiting
    // out the full timeout to say so hides the reason it died.
    if (server.exitCode !== null) {
      throw new Error(`fake-mychart exited with code ${server.exitCode} before becoming healthy`);
    }
    try {
      const res = await fetch(`http://${host}/api/health`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await Bun.sleep(200);
  }
  throw new Error(`fake-mychart on ${host} was not healthy within ${STARTUP_TIMEOUT_MS}ms`);
}

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error('usage: bun fake-mychart/scripts/with-fake-mychart.ts <command> [args...]');
  process.exit(2);
}

const existingHost = process.env.FAKE_MYCHART_HOST;
let server: Bun.Subprocess | undefined;
let host: string;

if (existingHost) {
  log(`FAKE_MYCHART_HOST is already set — using the server on ${existingHost}`);
  host = existingHost;
} else {
  if (!existsSync(join(FAKE_MYCHART_DIR, 'node_modules'))) {
    log('installing fake-mychart deps');
    await run(['bun', 'install'], 'bun install');
  }

  log('building fake-mychart');
  await build();

  const port = await pickFakeMyChartPort();
  host = `localhost:${port}`;
  log(`starting fake-mychart on http://${host}`);
  // The binary directly rather than `bun run next`: one process to signal, so
  // stopping it cannot orphan a listener that goes on holding the port.
  server = Bun.spawn([join(FAKE_MYCHART_DIR, 'node_modules/.bin/next'), 'start', '-p', String(port)], {
    cwd: FAKE_MYCHART_DIR,
    stdout: 'inherit',
    stderr: 'inherit',
    env: { ...process.env, PORT: String(port) },
  });

  try {
    await waitForHealth(host, server);
  } catch (err) {
    // Otherwise a server that came up but never answered is left holding the
    // port it was picked to avoid fighting over.
    server.kill();
    throw err;
  }
  log(`fake-mychart is healthy on http://${host}`);
}

function stopServer(): void {
  if (!server || server.killed) return;
  server.kill();
}

// A killed parent must not leave the server holding a port.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    stopServer();
    process.exit(130);
  });
}

let status: number;
try {
  const proc = Bun.spawn(command, {
    // The command runs from wherever the caller invoked us, not from
    // fake-mychart/ — `bun test` selects suites relative to the repo root.
    cwd: process.cwd(),
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: { ...process.env, FAKE_MYCHART_HOST: host },
  });
  status = await proc.exited;
} finally {
  stopServer();
}

process.exit(status);
