/**
 * Picks the port a locally-started fake-mychart listens on. **The one place
 * that choice is made.**
 *
 * Several worktrees on one machine each run their own fake-mychart — a dev
 * server, an integration run, or both — and a fixed port means the second one
 * to start either fails to bind or, worse, silently talks to the first one's
 * process and inherits whatever state that one has been left in. So a local
 * start draws its own port and tells the caller what it got.
 *
 * `PORT` wins when it is set. That is how the fixed port survives where it is
 * wanted: CI publishes the container on 4000 and points the suites at it, and
 * the Docker image and the deploy set `PORT` too.
 */
import { createServer } from 'net';

/** Inclusive low end of the range a port is drawn from. */
export const PORT_RANGE_START = 4000;
/** Inclusive high end of the range a port is drawn from. */
export const PORT_RANGE_END = 5000;

/** Resolves once the port is either bindable or known to be taken. */
function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    // Same host Next binds, so the probe answers the question actually being
    // asked: can the server that follows take this port?
    probe.listen(port, '0.0.0.0');
  });
}

/**
 * A free port in {@link PORT_RANGE_START}–{@link PORT_RANGE_END}, or whatever
 * `PORT` says.
 *
 * The bind probe is what makes this safe to call from several worktrees at
 * once: drawing at random from a 1001-wide range collides rarely, but "rarely"
 * across a repo full of worktrees is a flaky integration run every few days.
 * It is still a race — the port is released before the server claims it — just
 * a far narrower one than not looking at all.
 */
export async function pickFakeMyChartPort(): Promise<number> {
  const fromEnv = process.env.PORT;
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      throw new Error(`PORT must be an integer 0-65535, got ${JSON.stringify(fromEnv)}`);
    }
    return parsed;
  }

  const span = PORT_RANGE_END - PORT_RANGE_START + 1;
  for (let attempt = 0; attempt < 50; attempt++) {
    const port = PORT_RANGE_START + Math.floor(Math.random() * span);
    if (await isFree(port)) return port;
  }
  throw new Error(
    `No free port in ${PORT_RANGE_START}-${PORT_RANGE_END} after 50 tries. ` +
      'Something is holding the range open — set PORT to pick one by hand.',
  );
}

// `bun run dev` reads the port off stdout, so this must print the number and
// nothing else.
if (import.meta.main) {
  console.log(await pickFakeMyChartPort());
}
