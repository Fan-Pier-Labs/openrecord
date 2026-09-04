/**
 * Runs a command against a fake-mychart started just for it.
 *
 *     bun tests/with-fake-mychart.ts bun test --isolate .integration.test.ts
 *
 * `FAKE_MYCHART_HOST` already being set means "a server is running, use that",
 * and nothing is started. That is the path CI takes: it publishes the
 * `docker-compose.ci.yaml` container on the fixed port 4000 and sets the
 * variable job-wide.
 *
 * Locally there is no fixed port to fight over. Worktrees running at the same
 * time used to race for 4000, and the loser either failed to bind it or — worse
 * — ran its suites against the winner's server and whatever state that one had
 * been left in.
 *
 * Built and started rather than run with `next dev`, for two reasons: it matches the
 * container CI uses, so a suite sees the same server either way, and
 * `next dev` rewrites the tracked `next-env.d.ts` to point at `.next/dev/`,
 * which would leave a dirty tree after every test run.
 */
const command = process.argv.slice(2);
// Same range `fake-mychart`'s own dev script defaults to. PORT pins it there.
const port = 4000 + Math.floor(Math.random() * 1001);
const host = process.env.FAKE_MYCHART_HOST ?? `localhost:${port}`;

const dir = new URL('../fake-mychart', import.meta.url).pathname;
let server: Bun.Subprocess | undefined;

if (!process.env.FAKE_MYCHART_HOST) {
  const build = Bun.spawn(['bun', 'run', 'build'], { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
  if ((await build.exited) !== 0) process.exit(1);
  // The `next` binary directly, so there is one process to signal and no `bun
  // run` in between to leave a listener orphaned on the port.
  server = Bun.spawn([`${dir}/node_modules/.bin/next`, 'start', '-p', String(port)], {
    cwd: dir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

if (server) {
  const deadline = Date.now() + 60_000;
  while (!(await fetch(`http://${host}/api/health`).then((r) => r.ok).catch(() => false))) {
    if (Date.now() > deadline) {
      server.kill();
      throw new Error(`fake-mychart never came up on ${host}`);
    }
    await Bun.sleep(200);
  }
}

const proc = Bun.spawn(command, {
  env: { ...process.env, FAKE_MYCHART_HOST: host },
  stdout: 'inherit',
  stderr: 'inherit',
  stdin: 'inherit',
});
const status = await proc.exited;
server?.kill();
process.exit(status);
