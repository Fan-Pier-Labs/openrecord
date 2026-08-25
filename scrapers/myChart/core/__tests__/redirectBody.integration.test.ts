/**
 * What `makeRequest`'s redirect recursion actually puts on the wire for `body`,
 * observed against a real HTTP server rather than a scripted transport.
 *
 * `myChartRequest.unit.test.ts` already pins the semantics — a 302/303 drops the
 * body, a 307/308 keeps it. This suite exists because that recursion is the one
 * place in the `exactOptionalPropertyTypes` change that is a control-flow edit
 * rather than a type widening: the non-preserving hop used to be built as
 * `{ ...config, body: undefined }`, which left the key *present* on every
 * downgraded hop, and now destructures it out so the key is genuinely absent.
 *
 * `fetch` treats present-and-undefined the same as absent, so a mocked
 * transport cannot tell the two apart and no unit test can fail on the
 * difference. The assertions below are therefore about the init object the
 * recursion hands to the transport (`'body' in init`, not `init.body`), while
 * the request still goes out to a real server so the hop is a real redirect and
 * the response is a real one.
 *
 * Requires fake-mychart running on localhost:4000 (see fake-mychart.test.ts).
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { MyChartRequest } from '../myChartRequest';
import type { Transport } from '../../../http';
import { resetFakeMyChart, setMountMode } from '../../__tests__/fake-mychart/mountMode';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

type Hop = { url: string; method: string; hasBodyKey: boolean; body: unknown };

/**
 * A transport that records the init of every hop and then performs it for real.
 *
 * It sits exactly where the production transport sits — below the headers, the
 * cookie jar and the per-host permit — so recording here changes nothing about
 * how the request is built or sent.
 */
function recordingSession(): { session: MyChartRequest; hops: Hop[] } {
  const hops: Hop[] = [];
  const session = new MyChartRequest(HOST, 'http');
  // What login's mount discovery would have found; this suite drives the
  // redirect recursion directly, so there is no login to discover it.
  session.firstPathPart = 'MyChart';
  const transport: Transport = (url, init) => {
    hops.push({
      url,
      method: init.method ?? 'GET',
      hasBodyKey: 'body' in init,
      body: init.body,
    });
    return fetch(url, init);
  };
  session.transport = transport;
  return { session, hops };
}

describe('redirect recursion: what happens to the body on the wire', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
    await setMountMode(HOST, 'prefixed');
  });

  it('omits the body key entirely on a 302 downgrade, rather than sending it as undefined', async () => {
    // An API POST with a CSRF token but no session is bounced 302 -> login page.
    // That is a real MyChart behavior (see sessionExpiry.integration.test.ts),
    // and it is the exact shape the old code got wrong: a POST carrying a body,
    // downgraded to a GET.
    const { session, hops } = recordingSession();

    const res = await session.makeRequest({
      path: '/api/allergies/LoadAllergies',
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json', '__RequestVerificationToken': 'tok-test' },
    });

    // The recursion followed the redirect and landed on the login page.
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');

    expect(hops.length).toBeGreaterThanOrEqual(2);

    // Hop 1 is the POST that carries the body.
    const post = hops[0]!;
    expect(post.method).toBe('POST');
    expect(post.hasBodyKey).toBe(true);
    expect(post.body).toBe('{}');

    // Every hop after the downgrade is a GET with NO body key at all. This is
    // the assertion the unit suite structurally cannot make: before the fix
    // `hasBodyKey` was true here, with `body` set to undefined.
    for (const hop of hops.slice(1)) {
      expect(hop.method).toBe('GET');
      expect(hop.hasBodyKey).toBe(false);
      expect(hop.body).toBeUndefined();
    }
  });

  it('keeps the body, key included, across a 308 that preserves the method', async () => {
    // `/MyChart/` answers 308 -> `/MyChart`. A 308 preserves the method, so the
    // second hop is still a POST and must still carry the body — the other half
    // of the same ternary the downgrade case above exercises. (The chain stops
    // there with a 404: `/MyChart` only has a GET route, which is fine — what
    // is under test is the init the recursion built, not the response.)
    const { session, hops } = recordingSession();

    await session.makeRequest({
      path: '/',
      method: 'POST',
      body: 'x=1',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // The original POST plus at least one preserved hop.
    expect(hops.length).toBeGreaterThanOrEqual(2);
    for (const hop of hops) {
      expect(hop.method).toBe('POST');
      expect(hop.hasBodyKey).toBe(true);
      expect(hop.body).toBe('x=1');
    }
  });

  it('never puts a body key on a plain GET', async () => {
    // The second of the three case-2 fixes: the scraperFetch init used to set
    // `body: config.body` unconditionally, so every GET went out with a body
    // key present and undefined.
    const { session, hops } = recordingSession();

    await session.makeRequest({ path: '/Authentication/Login' });

    expect(hops.length).toBeGreaterThanOrEqual(1);
    for (const hop of hops) {
      expect(hop.method).toBe('GET');
      expect(hop.hasBodyKey).toBe(false);
    }
  });
});
