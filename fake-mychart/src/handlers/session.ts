import { NextResponse, type NextRequest } from 'next/server';
import { validateSession, getActiveProxyId, setActiveProxyId } from '@/lib/session';
import { csrfTokenPage, homePage } from '@/lib/html';
import { resolveActiveRecord, type FakeUser } from '@/lib/state';
import { isDefaultAspDiscovery, mountPrefix } from '@/lib/mount';
import { servesProxySwitchJson } from '@/lib/proxy';
import { isLegacyEpicVersion } from '@/lib/epicVersion';
import { ERROR_PAGE_HTML, html, json, redirectTo } from './respond';
import { requireTermsRedirect } from './guards';
import { currentUser } from './records';
import { prefix, type ExactRoutes, type PatternRoute } from './types';

/**
 * One entry in the `/ProxySwitch` payload.
 *
 * Every field below is now taken from real captures rather than inference —
 * two live instances (UCSF `/ucsfmychart`, Mass General Brigham `/mychart-prd`)
 * returned byte-identical shapes, cross-checked against the UCSF / Renown /
 * Carson Tahoe captures on PR #206.
 *
 * Details that inference got wrong, kept here so they don't drift back:
 *
 *   - `Ids` is an EMPTY ARRAY, not a list containing the record's id.
 *   - `DisplayText` and `PhotoMagicId` are `null`, not strings.
 *   - `TabColor` is a NUMBER, not a string.
 *   - `ServiceAreaAbbreviationList` is a STRING, not an array.
 *   - There is no `IdEmpty` or `IdPrefix` field at all.
 *
 * Confirmed as already correct: `Id` is an opaque ~86-character string on every
 * record including the account holder's, `IsSelf` is the only thing marking
 * self, and the self entry's `LinkUrl` is a bare relative `inside.asp` with no
 * query string.
 */
function proxySubjectEntry(
  subject: { id: string; displayName: string },
  opts: { isSelf: boolean; isSelected: boolean },
) {
  const linkUrl = opts.isSelf
    ? 'inside.asp'
    : `inside.asp?mode=proxyswitch&action=switchcontext&src=0&eid=${encodeURIComponent(subject.id)}`;
  return {
    Id: subject.id,
    Ids: [],
    DisplayName: subject.displayName,
    DisplayText: null,
    PhotoUrl: '',
    PhotoMagicId: null,
    BlobToken: '',
    TabColor: 0,
    LinkUrl: linkUrl,
    IsSelected: opts.isSelected,
    IsSelf: opts.isSelf,
    Loading: false,
    Disabled: false,
    ServiceAreaAbbreviationList: '',
  };
}

/** The full `ProxySubjectList`: the account holder first, then their proxies. */
function proxySubjectList(user: FakeUser, activeId: string) {
  return [
    proxySubjectEntry(
      { id: user.selfProxyId, displayName: user.displayName },
      { isSelf: true, isSelected: activeId === user.selfProxyId },
    ),
    ...user.proxySubjects.map(subject =>
      proxySubjectEntry(subject, { isSelf: false, isSelected: activeId === subject.id })),
  ];
}

/**
 * The sibling keys `/ProxySwitch` returns alongside the subject list. Present on
 * both instances captured; no scraper reads them, but a consumer written
 * against the fake shouldn't be surprised by their absence.
 */
function proxySwitchEnvelope(list: ReturnType<typeof proxySubjectList>) {
  return {
    ProxySubjectList: list,
    ShowFriendsAndFamily: true,
    ShouldTryAgain: false,
    ShowPersonalInformation: true,
    ShowAccountSettings: true,
    // Real instances list the languages the deployment offers; every capture
    // carried at least English with IsSelected on the active one.
    AvailableLanguageList: [
      { DisplayText: 'English', IsSelected: true, Name: 'English' },
    ],
    CurrentlySelectedTabColor: 0,
  };
}

/**
 * Routes served without a session.
 *
 * The keepalive endpoints answer "0" instead of redirecting, which is the
 * contract MyChart's own JS (and sessionStore's pinger) relies on. ASP.NET's
 * error surface renders without a session too — a client bounced to
 * FourOhFour/FiveHundred mid-failure is often exactly one whose request was
 * rejected before authentication was consulted.
 */
export const sessionGetPublic: ExactRoutes = {
  // The last hop of the DefaultAsp bounce, and the only one that names the
  // mount. The trailing `?` on the target is what real instances send.
  'defaultasp': () => new NextResponse(null, {
    status: 302,
    headers: { Location: `${mountPrefix()}/Authentication/Login?` },
  }),

  // Real instances serve both keepalives as text/html (not text/plain). On
  // November 2025 instances keepalive.asp answers "0" even for a live session —
  // /Home/KeepAlive tells the truth, which sessionStore.ts already knows.
  'home/keepalive': ({ request }) =>
    new NextResponse(validateSession(request.headers.get('cookie')) ? '1' : '0', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),

  'keepalive.asp': ({ request }) => {
    const alive = validateSession(request.headers.get('cookie'));
    const body = isLegacyEpicVersion() ? (alive ? '1' : '0') : '0';
    return new NextResponse(body, { headers: { 'Content-Type': 'text/html' } });
  },

  'home/fourohfour': ({ request }) => redirectTo(request, '/Home/Error?code=14'),
  'home/fivehundred': ({ request }) => redirectTo(request, '/Home/Error?code=14'),
  'home/error': () => html(ERROR_PAGE_HTML),
};

export const sessionGet: ExactRoutes = {
  'inside.asp': ({ request }) => {
    const termsRedirect = requireTermsRedirect(request);
    if (termsRedirect) return termsRedirect;

    // Proxy context switching. MyChart drives this through inside.asp query
    // modes: `mode=self` returns to the account holder's own record, and
    // `mode=proxyswitch&action=switchcontext&src=0&eid=<id>` moves into a proxy
    // record. Both answer with a 302 back to Home rather than rendering
    // anything; the new context lives in the session from then on.
    const mode = (request.nextUrl.searchParams.get('mode') || '').toLowerCase();
    const cookie = request.headers.get('cookie');

    // A bare `inside.asp` with no query is what `/ProxySwitch` hands back as
    // the account holder's own LinkUrl on every instance we've captured. When a
    // proxy record is active, following it returns to the account holder — via
    // a `mode=self` hop, matching the redirect chain observed live. When
    // already on the account holder's record it's an ordinary page.
    //
    // The hop itself is inferred from a scrubbed report ("redirect chain
    // included mode=self / ProxySwitch/SwitchContext hops"), not a verbatim
    // capture. What IS confirmed is that following the bare self LinkUrl
    // restores the account holder.
    if (!mode && getActiveProxyId(cookie)) {
      return redirectTo(request, '/inside.asp?mode=self');
    }

    if (mode === 'self' || mode === 'proxyswitch') {
      const user = currentUser(request);
      if (!user) return new NextResponse('Session is missing username', { status: 500 });

      const targetId = mode === 'self'
        ? user.selfProxyId
        : (request.nextUrl.searchParams.get('eid') || '');
      if (resolveActiveRecord(user, targetId) === null) {
        // An eid this account has no proxy access to. Real MyChart refuses
        // rather than silently leaving you where you were.
        return new NextResponse('Forbidden', { status: 403 });
      }
      setActiveProxyId(cookie, targetId);
      return redirectTo(request, '/Home');
    }

    return html('Welcome to MyChart');
  },

  // ── Proxy record list ───────────────────────────────────────────
  // The JSON surface the scraper tries first. Instances configured for the
  // HTML/script discovery shapes do not serve it at all, so it 404s there —
  // that 404 is what pushes the scraper onto its fallbacks.
  'proxyswitch': ({ request }) => {
    const cookie = request.headers.get('cookie');
    if (!servesProxySwitchJson()) {
      return new NextResponse('Not Found', { status: 404 });
    }
    const user = currentUser(request);
    if (!user) return new NextResponse('Session is missing username', { status: 500 });
    const active = resolveActiveRecord(user, getActiveProxyId(cookie));
    return json(proxySwitchEnvelope(proxySubjectList(user, active?.id ?? user.selfProxyId)));
  },

  'home': ({ request }) => {
    const cookie = request.headers.get('cookie');
    const termsRedirect = requireTermsRedirect(request);
    if (termsRedirect) return termsRedirect;
    const user = currentUser(request);
    if (!user) {
      return new NextResponse('Session is missing username', { status: 500 });
    }
    // Home reflects whichever patient record the session is currently in, so
    // the profile scraper reads the proxy patient's details after a switch.
    const active = resolveActiveRecord(user, getActiveProxyId(cookie)) ?? {
      profile: user.profile,
    };
    const { profile } = active;
    return html(homePage(profile.name, profile.dob, profile.mrn, profile.pcp));
  },
};

export const sessionGetPatterns: readonly PatternRoute[] = [
  prefix('home/csrftoken', ({ request }) => {
    const termsRedirect = requireTermsRedirect(request);
    if (termsRedirect) return termsRedirect;
    return html(csrfTokenPage());
  }),
];

/**
 * The empty-path root of the mount, which is not a route table entry because
 * Next hands it to us as an absent `path` rather than a string to match.
 *
 * In `default-asp` discovery the mount doesn't name the login route either —
 * it bounces through DefaultAsp first, and only that hop names the route.
 * Real instances send a bare relative `DefaultAsp` from `/MyChart/`, which
 * resolves to `/MyChart/DefaultAsp`. Next normalizes that trailing slash
 * away (308 to `/MyChart`) before a route handler ever runs, so under a
 * prefix the same relative form would resolve to `/DefaultAsp` instead —
 * hence the absolute Location here. The root-mounted case has no trailing
 * slash to lose and does send the bare relative form, which is the shape that
 * broke prefix parsing in the first place.
 */
export function mountRoot(request: NextRequest): NextResponse {
  if (isDefaultAspDiscovery()) {
    return new NextResponse(null, { status: 302, headers: { Location: `${mountPrefix()}/DefaultAsp` } });
  }
  return redirectTo(request, '/Authentication/Login');
}
