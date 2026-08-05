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

export async function getMountMode(host: string): Promise<MountMode> {
  const res = await fetch(`http://${host}/mode`);
  if (!res.ok) {
    throw new Error(`Failed to read mount mode from ${host}: ${res.status}`);
  }
  return (await res.json()).mode;
}
