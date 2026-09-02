/**
 * Helper for driving fake-mychart's `/mode` test-control endpoint.
 *
 * One fake server stands in for both real MyChart deployment shapes; flipping
 * the mode is how a suite chooses which one it's testing against. The mode is
 * global to the server process, so every suite that cares must set it in its
 * own `beforeAll` rather than inheriting whatever ran last.
 *
 * Always re-login after switching: a session discovers its path prefix during
 * login, and that prefix is exactly what the switch changes.
 */
export type MountMode = 'prefixed' | 'root';

/**
 * Wipe the fake back to its seed state.
 *
 * **Every suite in this directory must call this in its own `beforeAll`.** All
 * of the fake's state — TOTP opt-in, registered passkeys, sent messages, the
 * mount/discovery/terms knobs — is global to the server process and shared by
 * every suite pointed at it, and bun runs test files in directory-entry order,
 * not alphabetically. A suite that inherits whatever ran last therefore passes
 * or fails based on the order the filesystem happens to hand its neighbours
 * back, which changes when a file is added or renamed. Resetting on the way in
 * is what makes that order irrelevant; resetting only on the way out is not
 * enough, because it leaves the first suite to run trusting the previous
 * `bun test` invocation.
 */
export async function resetFakeMyChart(host: string): Promise<void> {
  const res = await fetch(`http://${host}/reset`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Failed to reset fake-mychart on ${host}: ${res.status} ${await res.text()}`);
  }
}

/**
 * How `/` announces the mount. Every value is a shape observed on a real
 * instance; see `fake-mychart/src/lib/mount.ts` for which instance each one
 * came from.
 */
export type DiscoveryMode = 'redirect' | 'meta-refresh' | 'default-asp' | 'script' | 'landing-page' | 'moved-host';

export async function setMountMode(host: string, mode: MountMode): Promise<void> {
  const res = await fetch(`http://${host}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    throw new Error(`Failed to set mount mode to ${mode} on ${host}: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.mode !== mode) {
    throw new Error(`Server reported mode ${body.mode} after asking for ${mode}`);
  }
}

/**
 * Set how `/` announces the mount, and optionally where a `moved-host` instance
 * sends the client. Leaves the mount mode alone — the two are independent, and
 * a suite that wants a specific pair sets both.
 */
export async function setDiscoveryMode(
  host: string,
  discovery: DiscoveryMode,
  opts?: { movedHost?: string | null },
): Promise<void> {
  const payload: Record<string, unknown> = { discovery };
  if (opts && 'movedHost' in opts) payload.movedHost = opts.movedHost;

  const res = await fetch(`http://${host}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to set discovery mode to ${discovery} on ${host}: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.discovery !== discovery) {
    throw new Error(`Server reported discovery ${body.discovery} after asking for ${discovery}`);
  }
}

export async function getMountMode(host: string): Promise<MountMode> {
  const res = await fetch(`http://${host}/mode`);
  if (!res.ok) {
    throw new Error(`Failed to read mount mode from ${host}: ${res.status}`);
  }
  return (await res.json()).mode;
}

/**
 * Whether the instance makes patients accept Terms & Conditions before it lets
 * them into the chart.
 *
 * Global to the server process, like the mount mode above, so a suite that
 * turns it on must turn it back off in an `afterAll` — otherwise every suite
 * that runs afterwards logs in to a T&C page it wasn't written for.
 */
export async function setRequireTerms(host: string, requireTerms: boolean): Promise<void> {
  const res = await fetch(`http://${host}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requireTerms }),
  });
  if (!res.ok) {
    throw new Error(`Failed to set requireTerms to ${requireTerms} on ${host}: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.requireTerms !== requireTerms) {
    throw new Error(`Server reported requireTerms ${body.requireTerms} after asking for ${requireTerms}`);
  }
}

/**
 * Whether the instance serves `/api/conversations/GetConversationMessages` or
 * answers every call to it with a 500. Both are real behaviors — see
 * `fake-mychart/src/lib/threadEndpoint.ts`.
 */
export type ThreadEndpointMode = 'serves' | 'errors';

export async function setThreadEndpointMode(host: string, mode: ThreadEndpointMode): Promise<void> {
  const res = await fetch(`http://${host}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationMessages: mode }),
  });
  if (!res.ok) {
    throw new Error(`Failed to set conversationMessages to ${mode} on ${host}: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  if (body.conversationMessages !== mode) {
    throw new Error(`Server reported conversationMessages ${body.conversationMessages} after asking for ${mode}`);
  }
}
