/**
 * The resolver against the page shapes the live sweep turned up — UCSF's
 * information page among them — served by a stub transport.
 */
import { afterEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../http';
import { resolveLoginUrl } from '../resolveLoginUrl';

const LOGIN_PAGE = '<form><input name="__RequestVerificationToken" value="t"></form>';

type Route = Response | Error;

function serve(routes: Record<string, () => Route>): void {
  setTestTransport((url) => {
    const route = routes[url]?.();
    if (route instanceof Error) return Promise.reject(route);
    return Promise.resolve(route ?? new Response('not found', { status: 404 }));
  });
}

const redirect = (to: string) => () => new Response(null, { status: 302, headers: { Location: to } });
const html = (body: string, status = 200) => () => new Response(body, { status });

afterEach(() => setTestTransport(null));

describe('resolveLoginUrl', () => {
  it('accepts a directory URL that redirects to its own login page', async () => {
    serve({
      'https://mychart.example.org/MyChart/': redirect('/MyChart/Authentication/Login'),
      'https://mychart.example.org/MyChart/Authentication/Login': html(LOGIN_PAGE),
    });
    expect(await resolveLoginUrl('https://mychart.example.org/MyChart/')).toEqual({ kind: 'up', url: 'https://mychart.example.org/MyChart/' });
  });

  it('follows an information page to the portal it links to', async () => {
    // UCSF's shape: the directory URL redirects to the health system's own
    // MyChart page, which links to the portal on another host.
    serve({
      'https://www.example-health.org/portal/': redirect('https://www.example-health.org/mychart'),
      'https://www.example-health.org/mychart': html(
        '<a href="/find-a-doctor">Find a doctor</a>' +
          '<a href="https://portal.example-health.org/ExampleMyChart/Authentication/Login">Log in</a>',
      ),
      'https://portal.example-health.org/ExampleMyChart/Authentication/Login': html(LOGIN_PAGE),
    });
    expect(await resolveLoginUrl('https://www.example-health.org/portal/')).toEqual({
      kind: 'up',
      url: 'https://portal.example-health.org/ExampleMyChart/',
    });
  });

  it('reaches the portal link past the site navigation that outranks it', async () => {
    // UCHealth's shape: a page of the site's own one-segment links, with the
    // portal's bare mount on another host near the bottom.
    const navigation = ['locations', 'billing', 'contact-us', 'referrals', 'research', 'careers']
      .map((p) => `<a href="/${p}">${p}</a>`)
      .join('');
    serve({
      'https://www.example-health.org/access/': html(
        navigation + '<a href="https://mychart.example-health.org/MyChart/">Sign in</a>',
      ),
      'https://mychart.example-health.org/MyChart/Authentication/Login': html(LOGIN_PAGE),
    });
    expect(await resolveLoginUrl('https://www.example-health.org/access/')).toEqual({
      kind: 'up',
      url: 'https://mychart.example-health.org/MyChart/',
    });
  });

  it('does not take a MyChart-looking link that serves no login page', async () => {
    serve({
      'https://www.example-health.org/': html('<a href="https://www.example-health.org/mychart/">About MyChart</a>'),
      'https://www.example-health.org/mychart/Authentication/Login': html('<h1>About MyChart</h1>'),
    });
    expect(await resolveLoginUrl('https://www.example-health.org/')).toEqual({
      kind: 'down',
      reason: 'no MyChart login on the page or anything it links to',
    });
  });

  it('calls anything it could not confirm up down, with the reason', async () => {
    serve({
      'https://a.example.org/': () => new Error('Unable to connect'),
      'https://b.example.org/': html('unavailable', 503),
      'https://c.example.org/': html('forbidden', 403),
      'https://d.example.org/': () => new Error('The operation timed out.'),
    });
    expect(await resolveLoginUrl('https://a.example.org/')).toEqual({ kind: 'down', reason: 'Unable to connect' });
    expect(await resolveLoginUrl('https://b.example.org/')).toEqual({ kind: 'down', reason: 'HTTP 503' });
    expect(await resolveLoginUrl('https://c.example.org/')).toEqual({ kind: 'down', reason: 'HTTP 403' });
    expect(await resolveLoginUrl('https://d.example.org/')).toEqual({ kind: 'down', reason: 'The operation timed out.' });
  });

  it('gives up after five redirects', async () => {
    const loop: Record<string, () => Response> = {};
    for (let i = 0; i < 6; i++) loop[`https://loop.example.org/${i}`] = redirect(`/${i + 1}`);
    serve(loop);
    expect(await resolveLoginUrl('https://loop.example.org/0')).toEqual({ kind: 'down', reason: 'more than 5 redirects' });
  });
});
