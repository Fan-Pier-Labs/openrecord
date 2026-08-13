#!/usr/bin/env bun
/**
 * Starts fake-mychart's Next dev server on a RANDOM FREE PORT in [4000, 5000].
 *
 * The port used to be hardcoded to 4000, which meant exactly one fake-mychart
 * could be running on a machine: a second agent (or a second worktree) starting
 * its own server either failed to bind or — worse, since Next silently walks to
 * the next free port — quietly took a port nobody was told about, while every
 * scraper aimed at :4000 kept talking to the *other* instance's RAM. Picking a
 * random free port per run gives each instance its own server, and the banner
 * below is where the port is announced.
 *
 * The port is picked here rather than left to Next's own fallback so the number
 * is known before the server starts, and so a busy port is skipped instead of
 * being silently incremented past.
 *
 * `PORT` (or `FAKE_MYCHART_PORT`) pins the port when something needs a fixed
 * one. CI does not use this script at all — `docker-compose.ci.yaml` runs the
 * production server and publishes it on the fixed host port 4000 — so nothing
 * that greps for `localhost:4000` in the integration suites is affected.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

/** Inclusive low end of the range a random dev port is drawn from. */
export const PORT_RANGE_START = 4000
/** Inclusive high end. */
export const PORT_RANGE_END = 5000

/** How many random draws to try before giving up on finding a free port. */
const DEFAULT_ATTEMPTS = 50

export interface PickPortOptions {
  start?: number
  end?: number
  attempts?: number
  /** Injected in tests; defaults to actually trying to bind the port. */
  isFree?: (port: number) => Promise<boolean>
  /** Injected in tests; defaults to `Math.random`. */
  random?: () => number
}

/**
 * True when nothing is listening on `port`.
 *
 * Binds 0.0.0.0 rather than 127.0.0.1: a server bound to the wildcard address
 * makes the port unusable for us even though a loopback-only probe would bind
 * fine on some platforms.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '0.0.0.0')
  })
}

/**
 * Draws random ports from the range until one is free.
 *
 * Random rather than sequential-from-4000 on purpose: two agents starting at
 * the same moment would otherwise probe the same ports in the same order and
 * race for the same one.
 */
export async function pickDevPort(options: PickPortOptions = {}): Promise<number> {
  const {
    start = PORT_RANGE_START,
    end = PORT_RANGE_END,
    attempts = DEFAULT_ATTEMPTS,
    isFree = isPortFree,
    random = Math.random,
  } = options

  const span = end - start + 1
  const tried = new Set<number>()
  for (let i = 0; i < attempts; i++) {
    const port = start + Math.floor(random() * span)
    if (tried.has(port)) continue
    tried.add(port)
    if (await isFree(port)) return port
  }
  throw new Error(
    `No free port found in ${start}-${end} after ${attempts} attempts. ` +
      `Set PORT=<port> to pin one.`,
  )
}

/**
 * The port this run should use: an explicitly pinned one if the environment
 * names it, otherwise a random free port.
 */
export async function resolveDevPort(
  env: Record<string, string | undefined> = process.env,
  options: PickPortOptions = {},
): Promise<number> {
  const pinned = env.FAKE_MYCHART_PORT ?? env.PORT
  if (pinned !== undefined && pinned !== '') {
    const port = Number(pinned)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port ${JSON.stringify(pinned)} — expected an integer 1-65535.`)
    }
    return port
  }
  return pickDevPort(options)
}

/** The banner that tells the operator (or agent) which port this run landed on. */
export function startupBanner(port: number): string {
  const url = `http://localhost:${port}`
  return [
    '',
    `  fake-mychart → ${url}`,
    `  host for scrapers/CLI: localhost:${port}  (--protocol http)`,
    `  reset state:           curl -X POST ${url}/reset`,
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const port = await resolveDevPort()
  console.log(startupBanner(port))

  // `bun x` so Next resolves from this package's node_modules/.bin — spawning
  // from a script does not inherit the PATH `bun run` sets up.
  const child = spawn('bun', ['x', 'next', 'dev', '-p', String(port)], {
    stdio: 'inherit',
    cwd: new URL('..', import.meta.url).pathname,
  })
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
