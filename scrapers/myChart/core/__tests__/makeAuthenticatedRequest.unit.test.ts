import { describe, it, expect, afterEach } from 'bun:test';
import { MyChartRequest } from '../myChartRequest';
import { makeAuthenticatedRequest, SessionExpiredError } from '../makeAuthenticatedRequest';
import { looksLikeSignedOutPage } from '../../auth/login';
import { sessionStore } from '../sessionStore';

const LOGIN_PAGE_HTML = `<!DOCTYPE html><html><head><title>MyChart - Login Page</title></head>
<body class="loginPage isPrelogin">
  <input name="__RequestVerificationToken" type="hidden" value="fake-csrf" />
  <form action="/MyChart/Authentication/Login/DoLogin" method="post"></form>
</body></html>`;

// Post-login pages carry a verification token and the Epic footer too — the
// exact markers the loose looksLikeLoginPage matches on. The wrapper must not
// mistake this for a bounce.
const AUTHENTICATED_PAGE_HTML = `<!DOCTYPE html><html><body>
  <input name="__RequestVerificationToken" type="hidden" value="fake-csrf" />
  <div class="printheader">Name: Homer Simpson | DOB: 5/12/1956 | MRN: 123 | PCP: Dr. Hibbert</div>
  <footer>MyChart® licensed from Epic Systems Corporation</footer>
</body></html>`;

type Route = (url: string, init: RequestInit) => Response | null;

/**
 * A request whose fetch is a scripted router. `loggedIn` flips how protected
 * paths answer: real content when true, a 302 to the login page when false —
 * the same shape fake-mychart and real MyChart produce.
 */
function fakeMyChart(routes?: Route) {
  const request = new MyChartRequest('mychart.example.org');
  const state = {
    loggedIn: false,
    fetchLog: [] as string[],
  };
  request.transport = async (url, init) => {
    const urlStr = String(url);
    state.fetchLog.push(urlStr);
    const custom = routes?.(urlStr, init ?? {});
    if (custom) return custom;
    if (urlStr.includes('/Authentication/Login')) {
      return new Response(LOGIN_PAGE_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (!state.loggedIn) {
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://mychart.example.org/MyChart/Authentication/Login?returnUrl=x' },
      });
    }
    if (urlStr.includes('/api/')) {
      return new Response('{"dataList":[{"name":"Vegetables"}]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(AUTHENTICATED_PAGE_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
  return { request, state };
}

afterEach(() => {
  sessionStore.stopKeepalive();
});

function cleanup(request: MyChartRequest) {
  sessionStore.unregister(request);
}

describe('looksLikeSignedOutPage', () => {
  it('matches the login page', () => {
    expect(looksLikeSignedOutPage(LOGIN_PAGE_HTML)).toBe(true);
  });

  it('does not match an authenticated page that carries a verification token and the Epic footer', () => {
    expect(looksLikeSignedOutPage(AUTHENTICATED_PAGE_HTML)).toBe(false);
  });
});

describe('makeAuthenticatedRequest', () => {
  it('passes JSON responses through untouched when the session is live', async () => {
    const { request, state } = fakeMyChart();
    state.loggedIn = true;
    const resp = await makeAuthenticatedRequest(request, { path: '/api/allergies/LoadAllergies', method: 'POST', body: '{}' });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ dataList: [{ name: 'Vegetables' }] });
    cleanup(request);
  });

  it('rebuilds HTML responses so the caller can still read the body', async () => {
    const { request, state } = fakeMyChart();
    state.loggedIn = true;
    const resp = await makeAuthenticatedRequest(request, { path: '/Clinical/Allergies' });
    expect(await resp.text()).toContain('__RequestVerificationToken');
    cleanup(request);
  });

  it('renews via the reauthenticate hook and retries once, transparently', async () => {
    const { request, state } = fakeMyChart();
    let hookCalls = 0;
    request.reauthenticate = async () => {
      hookCalls++;
      state.loggedIn = true;
      return true;
    };

    const resp = await makeAuthenticatedRequest(request, { path: '/api/allergies/LoadAllergies', method: 'POST', body: '{}' });
    expect(await resp.json()).toEqual({ dataList: [{ name: 'Vegetables' }] });
    expect(hookCalls).toBe(1);
    cleanup(request);
  });

  it('single-flights the renewal when many requests hit an expired session at once', async () => {
    const CONCURRENT = 8;

    // The renewal is held open until every caller has been bounced by the
    // expired session, so they genuinely pile up on one in-flight renewal.
    // Sleeping in the hook instead only made that *likely* — and the pile-up
    // is the whole point of the test, so a slow CI box could quietly turn this
    // green while proving nothing. Counting arrivals makes it certain, and
    // costs no wall-clock time.
    let openTheGate!: () => void;
    const gate = new Promise<void>((resolve) => { openTheGate = resolve; });
    let bounced = 0;

    const { request, state } = fakeMyChart((url) => {
      if (!state.loggedIn && url.includes('/api/') && ++bounced === CONCURRENT) openTheGate();
      return null; // fall through to the default router
    });

    let hookCalls = 0;
    request.reauthenticate = async () => {
      hookCalls++;
      await gate;
      state.loggedIn = true;
      return true;
    };

    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        makeAuthenticatedRequest(request, { path: '/api/allergies/LoadAllergies', method: 'POST', body: '{}' })
          .then((r) => r.json())),
    );
    expect(results).toHaveLength(CONCURRENT);
    expect(bounced).toBe(CONCURRENT);
    expect(hookCalls).toBe(1);
    cleanup(request);
  });

  it('throws SessionExpiredError when no reauthenticate hook is wired — never a fake-empty result', async () => {
    const { request } = fakeMyChart();
    expect(makeAuthenticatedRequest(request, { path: '/api/allergies/LoadAllergies', method: 'POST', body: '{}' }))
      .rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('throws SessionExpiredError when the hook cannot log back in', async () => {
    const { request } = fakeMyChart();
    request.reauthenticate = async () => false;
    expect(makeAuthenticatedRequest(request, { path: '/Clinical/Allergies' }))
      .rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('gives up after one retry when the renewed session is bounced again', async () => {
    const { request } = fakeMyChart();
    let hookCalls = 0;
    request.reauthenticate = async () => {
      hookCalls++;
      return true; // claims success but loggedIn stays false
    };
    await expect(makeAuthenticatedRequest(request, { path: '/Clinical/Allergies' }))
      .rejects.toBeInstanceOf(SessionExpiredError);
    expect(hookCalls).toBe(1);
  });

  it('autoRenew: false throws immediately without calling the hook', async () => {
    const { request } = fakeMyChart();
    let hookCalls = 0;
    request.reauthenticate = async () => {
      hookCalls++;
      return true;
    };
    await expect(makeAuthenticatedRequest(request, { path: '/Clinical/Allergies' }, { autoRenew: false }))
      .rejects.toBeInstanceOf(SessionExpiredError);
    expect(hookCalls).toBe(0);
  });

  it('detects the bounce on unfollowed redirects too', async () => {
    const { request, state } = fakeMyChart();
    let hookCalls = 0;
    request.reauthenticate = async () => {
      hookCalls++;
      state.loggedIn = true;
      return true;
    };
    const resp = await makeAuthenticatedRequest(request, { path: '/Clinical/Allergies', followRedirects: false });
    expect(resp.status).toBe(200);
    expect(hookCalls).toBe(1);
    cleanup(request);
  });

  it('leaves non-HTML bodies unconsumed (binary passthrough)', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const { request, state } = fakeMyChart((url) =>
      url.includes('/Billing/Details/DownloadFromBlob')
        ? new Response(pdfBytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } })
        : null);
    state.loggedIn = true;
    const resp = await makeAuthenticatedRequest(request, { path: '/Billing/Details/DownloadFromBlob' });
    expect(new Uint8Array(await resp.arrayBuffer())).toEqual(pdfBytes);
    cleanup(request);
  });

  it('registers successful sessions for keepalive, honoring disableAutoKeepalive', async () => {
    const { request, state } = fakeMyChart();
    state.loggedIn = true;
    await makeAuthenticatedRequest(request, { path: '/Clinical/Allergies' });
    const registered = [...sessionStore.all().values()].some((e) => e.request === request);
    expect(registered).toBe(true);
    cleanup(request);

    const optedOut = fakeMyChart();
    optedOut.state.loggedIn = true;
    optedOut.request.disableAutoKeepalive = true;
    await makeAuthenticatedRequest(optedOut.request, { path: '/Clinical/Allergies' });
    const optedOutRegistered = [...sessionStore.all().values()].some((e) => e.request === optedOut.request);
    expect(optedOutRegistered).toBe(false);
  });
});

describe('adoptStateFrom', () => {
  it('copies session state in place so existing references keep working', () => {
    const old = new MyChartRequest('login.wellspan.org');
    old.setFirstPathPart('MyChart');
    const fresh = new MyChartRequest('my.wellspan.org');
    fresh.setFirstPathPart('MyChart-PRD');
    fresh.protocol = 'http';

    old.adoptStateFrom(fresh);

    expect(old.hostname).toBe('my.wellspan.org');
    expect(old.firstPathPart).toBe('MyChart-PRD');
    expect(old.protocol).toBe('http');
    expect(old.cookieJar).toBe(fresh.cookieJar);
  });
});
