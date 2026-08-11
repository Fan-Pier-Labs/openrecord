/**
 * Per-host concurrency limiting for outbound scraper requests.
 *
 * A single "scrape everything" run fans out ~30 scrapers at once, each making
 * two or more requests, all aimed at one hospital's MyChart. On the hosted web
 * app every user shares one egress IP, so those bursts stack across users and
 * look exactly like an attack to whatever sits in front of the portal. Gating
 * requests per hostname keeps a burst to a steady trickle without any caller
 * having to know it is being throttled.
 *
 * The limit is per *host*, not per session or per user: the thing being
 * protected is the far end, and it counts connections, not accounts.
 *
 * Permits are handed out first-come-first-served. A waiter is resolved by the
 * releasing request handing its permit straight over rather than releasing it
 * and letting the queue race for it, so a saturated host can't starve an early
 * arrival.
 */

import { logger } from './logger';
import { MAX_CONCURRENT_REQUESTS_PER_HOST } from './env';

/** Counting semaphore with a FIFO wait queue. */
class HostSemaphore {
  /** Permits currently held by in-flight requests. */
  private active = 0;

  /** Resolvers for callers waiting on a permit, oldest first. */
  private waiters: Array<() => void> = [];

  constructor(readonly limit: number) {}

  get inFlight(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiters.length;
  }

  /** Resolves once a permit is held. Every acquire must be paired with a release. */
  acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      // Hand the permit directly to the next waiter. `active` deliberately
      // stays where it is — the permit moved, it wasn't given back.
      next();
    } else {
      this.active -= 1;
    }
  }
}

/**
 * Next.js bundles each API route separately, so a plain module-level Map would
 * give every route its own set of limiters and the cap would mean nothing in
 * the one place it matters most. Same reasoning as the session store.
 */
const globalKey = '__mychart_host_limiters__' as const;

function registry(): Map<string, HostSemaphore> {
  const g = globalThis as unknown as Record<string, Map<string, HostSemaphore> | undefined>;
  const existing = g[globalKey];
  if (existing) return existing;
  const created = new Map<string, HostSemaphore>();
  g[globalKey] = created;
  return created;
}

/**
 * Normalize a URL to the key its limiter is stored under.
 *
 * Keys on the host actually being contacted rather than the session's nominal
 * hostname, so a redirect onto a different deployment gets its own budget
 * instead of spending the original host's.
 *
 * Port is part of the key: two fake-mychart instances on one machine are two
 * different servers. Anything unparseable falls back to the raw string, which
 * still groups consistently.
 */
export function hostKeyForUrl(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function limiterFor(hostKey: string): HostSemaphore {
  const limiters = registry();
  const existing = limiters.get(hostKey);
  if (existing) return existing;
  const created = new HostSemaphore(MAX_CONCURRENT_REQUESTS_PER_HOST);
  limiters.set(hostKey, created);
  return created;
}

/**
 * Run `fn` while holding one of the host's permits.
 *
 * Wrap only the individual network call. `makeRequest` recurses to follow
 * redirects, and holding a permit across that recursion would let one chain
 * hold several at once — enough concurrent redirect-following requests would
 * then deadlock waiting on permits their own callers are holding.
 */
export async function withHostLimit<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const hostKey = hostKeyForUrl(url);
  const limiter = limiterFor(hostKey);

  if (limiter.inFlight >= limiter.limit) {
    // Host only, never the path — request URLs carry record and patient ids.
    logger.debug(
      `[ratelimit] ${hostKey} at ${limiter.limit} in flight, queueing (${limiter.queued + 1} waiting)`,
    );
  }

  await limiter.acquire();
  try {
    return await fn();
  } finally {
    limiter.release();
  }
}

/** In-flight and queued counts per host. Test and diagnostic use only. */
export function hostLimiterStats(): Record<string, { inFlight: number; queued: number; limit: number }> {
  const stats: Record<string, { inFlight: number; queued: number; limit: number }> = {};
  for (const [host, limiter] of registry()) {
    stats[host] = { inFlight: limiter.inFlight, queued: limiter.queued, limit: limiter.limit };
  }
  return stats;
}

/**
 * Drop every limiter. Tests only — discarding a limiter with waiters would
 * strand them, so this is not safe to call while requests are in flight.
 */
export function resetHostLimiters(): void {
  registry().clear();
}
