import { NextRequest, NextResponse } from 'next/server';
import { createSession, validateSession, sessionCookieHeader, hasAcceptedTerms, acceptTerms, getSessionUsername, getActiveProxyId, setActiveProxyId } from '@/lib/session';
import {
  loginPage, loginPageControllerJs, doLoginSuccess, doLoginNeed2FA, doLoginFailed,
  secondaryValidationPage, homePage, csrfTokenPage, genericTokenPage, get2faMethods,
  termsConditionsPage,
  careTeamPage, insurancePage, preventiveCarePage, billingSummaryPage, billingDetailsPage,
  medicationsPage, allergiesPage, healthIssuesPage, immunizationsPage,
  vitalsPage, medicalHistoryPage, testResultsPage, messagesPage, visitsPage,
  lettersPage, goalsPage, referralsPage, careJourneysPage, documentsPage,
  educationPage, emergencyContactsPage, profilePage, settingsPage,
  renderProxySelector, PROXY_SELECTOR_PLACEHOLDER,
  type ProxySelectorModel,
} from '@/lib/html';
import * as homer from '@/data/homer';
import { state, findUser, findUserByPasskey, resolveActiveRecord, type FakeUser, type ConversationStore } from '@/lib/state';
import { selfDataset, type PatientDataset } from '@/lib/dataset';
import { isDefaultAspDiscovery, isRootMount, mountPrefix } from '@/lib/mount';
import { servesProxySwitchJson } from '@/lib/proxy';
import { getRequireTerms } from '@/lib/terms';
import { isLegacyEpicVersion } from '@/lib/epicVersion';
import { generateTotpSecret, verifyTotpCode } from '@/lib/totp';
import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';

import crypto from 'crypto';

// Track which username is mid-2FA. Real MyChart uses a server-side flow state;
// here we just remember the user attached to the temporary session created
// during the password step so we know whose TOTP profile to mutate after they
// verify.
function currentUser(request: NextRequest): FakeUser | null {
  const cookie = request.headers.get('cookie');
  return findUser(getSessionUsername(cookie));
}

/**
 * The proxy-record dropdown model for this session, or null when the account
 * has no proxy access at all. Real MyChart renders no selector for a
 * single-record account, and the scraper must cope with that.
 */
function proxySelectorFor(request: NextRequest, user: FakeUser): ProxySelectorModel | null {
  if (user.proxySubjects.length === 0) return null;
  const active = resolveActiveRecord(user, getActiveProxyId(request.headers.get('cookie')));
  return {
    self: { id: user.selfProxyId, displayName: user.displayName },
    subjects: user.proxySubjects.map(s => ({ id: s.id, displayName: s.displayName })),
    activeId: active?.id ?? user.selfProxyId,
  };
}

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
 * Chart data scoped to the record this session is currently in.
 *
 * This is what makes proxy switching mean something: after switching into a
 * child's record, every data endpoint reads that child's dataset. A record with
 * nothing in a given category returns an empty envelope — never the account
 * holder's data. Before login (no session, no user) it falls back to the
 * account holder's seed so unauthenticated paths behave as they always did.
 */
function activeDataset(request: NextRequest): PatientDataset {
  const user = currentUser(request);
  if (!user) return selfDataset();
  const active = resolveActiveRecord(user, getActiveProxyId(request.headers.get('cookie')));
  return active?.dataset ?? selfDataset();
}

/**
 * Emergency contacts for the record this session is in.
 *
 * These can't ride in the per-record dataset because they're mutable — the
 * add/update/remove endpoints write to them — so they live in `state`, keyed by
 * record id. A record with no entry yet gets a fresh empty list rather than
 * inheriting anyone else's.
 */
function activeEmergencyContacts(request: NextRequest): typeof homer.emergencyContacts {
  const user = currentUser(request);
  const active = user
    ? resolveActiveRecord(user, getActiveProxyId(request.headers.get('cookie')))
    : null;
  const recordId = active?.id ?? user?.selfProxyId ?? '';
  const existing = state.emergencyContactsByRecord[recordId];
  if (existing) return existing;
  const created: typeof homer.emergencyContacts = {
    ...JSON.parse(JSON.stringify(homer.emergencyContacts)),
    contacts: [],
  };
  state.emergencyContactsByRecord[recordId] = created;
  return created;
}

/**
 * Message threads for the record this session is in. Mutable like emergency
 * contacts, so keyed by record id for the same reason — a child's chart must
 * not list the account holder's messages.
 */
function activeConversations(request: NextRequest): ConversationStore {
  const user = currentUser(request);
  const active = user
    ? resolveActiveRecord(user, getActiveProxyId(request.headers.get('cookie')))
    : null;
  const recordId = active?.id ?? user?.selfProxyId ?? '';
  if (!state.conversationsByRecord[recordId]) {
    state.conversationsByRecord[recordId] = { conversations: [], users: {}, hasMoreMessages: false };
  }
  return state.conversationsByRecord[recordId];
}

// ─── Helpers ────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function html(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function joinPath(path: string[]): string {
  return path.join('/');
}

// How many past visits MyChart's LoadPast endpoint returns per page. This MUST
// match real MyChart exactly (10 per org per page) — the fake is a faithful
// stand-in, not a convenience mock. The fixture carries more than one page of
// visits so the scraper's pagination loop is still exercised.
const PAST_VISITS_PAGE_SIZE = 10;

/**
 * Mimic MyChart's paginated `Visits/VisitsList/LoadPast` response.
 *
 * Real MyChart returns past visits 10-at-a-time per organization, newest
 * first, with a `HasMoreData` flag and an opaque top-level `SerializedIndex`
 * continuation token that the client echoes back to fetch the next page. We
 * model the token as a simple numeric offset into the full visit list. See
 * issue #189 — the scraper previously only ever read the first page.
 */
function buildPastVisitsPage(ds: PatientDataset, serializedIndex: string | null) {
  const all = ds.pastVisits.PastVisitsList;
  const offset = serializedIndex ? (Number(serializedIndex) || 0) : 0;
  const slice = all.slice(offset, offset + PAST_VISITS_PAGE_SIZE);
  const nextOffset = offset + slice.length;
  const hasMore = nextOffset < all.length;
  const nextToken = hasMore ? String(nextOffset) : '';

  const orgId = 'ORG-SPRINGFIELD';
  const org = { OrganizationId: orgId, OrganizationName: 'Springfield General Hospital', IsLocal: true };

  return {
    ViewBagProperties: { LoadingOrgNames: '', ErrorOrgNames: '', ManualOrgNames: '' },
    SerializedIndex: nextToken,
    List: {
      [orgId]: {
        ViewbagProperties: {},
        Organization: org,
        List: slice,
        ListSize: slice.length,
        HasMoreData: hasMore,
        CanSearch: false,
        SkippedSomeResults: false,
        SerializedIndex: nextToken,
      },
    },
    CanSearch: false,
    CanAllSearch: false,
    CanSort: false,
    AutoRenderThisSet: offset === 0,
    SkippedSomeResults: false,
    Organizations: { [orgId]: org },
  };
}

/**
 * Extract the WebAuthn signature counter from a base64 `authenticatorData`.
 * Layout: rpIdHash (32 bytes) || flags (1 byte) || signCount (4 bytes, BE).
 * Returns null if the data is missing or too short to contain a counter.
 */
function parseSignCount(authenticatorDataB64: string | undefined): number | null {
  if (!authenticatorDataB64) return null;
  try {
    const buf = Buffer.from(authenticatorDataB64, 'base64');
    if (buf.length < 37) return null;
    return buf.readUInt32BE(33);
  } catch {
    return null;
  }
}

/**
 * Build the public base URL from forwarded headers, so redirects
 * use the external domain rather than the container's localhost.
 */
function publicBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || new URL(request.url).host;
  const proto = request.headers.get('cloudfront-forwarded-proto')
    || request.headers.get('x-forwarded-proto')
    || (host.includes('localhost') || !host.includes('.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function requireSession(request: NextRequest): NextResponse | null {
  const cookie = request.headers.get('cookie');
  if (!validateSession(cookie)) {
    return NextResponse.redirect(new URL(`${mountPrefix()}/Authentication/Login`, publicBaseUrl(request)), 302);
  }
  return null;
}

/**
 * ASP.NET's error surface, as observed live on three instances.
 *
 * A request the server can't route or refuses (unknown `/api/*` path, an API
 * POST missing its `__RequestVerificationToken`) does NOT get a tidy JSON
 * error. On November 2025 instances (two of three) it gets ASP.NET's classic redirect
 * dance: 302 to `/Home/FourOhFour?aspxerrorpath=<path>` (unknown path) or
 * `/Home/FiveHundred?aspxerrorpath=<path>` (server error), each of which 302s
 * on to `/Home/Error?code=14`, which renders a 200 HTML error page. On the
 * August 2025 instance the same failures answer a bare 500 HTML error page with no
 * redirect. `POST /mode {"epicVersion":"August 2025"}` selects the second shape.
 */
const ERROR_PAGE_HTML = `<!DOCTYPE html><html><head><title>Error</title></head><body>
<h1>An error has occurred.</h1>
<p>We're sorry, but something went wrong. Please try again later.</p>
</body></html>`;

function aspNetFailure(request: NextRequest, kind: 'fourohfour' | 'fivehundred', failedPath: string): NextResponse {
  if (isLegacyEpicVersion()) {
    return html(ERROR_PAGE_HTML, 500);
  }
  const page = kind === 'fourohfour' ? 'FourOhFour' : 'FiveHundred';
  const target = `${mountPrefix()}/Home/${page}?aspxerrorpath=${encodeURIComponent(`${mountPrefix()}/${failedPath}`)}`;
  return NextResponse.redirect(new URL(target, publicBaseUrl(request)), 302);
}

/**
 * The November 2025 release (two of the three captured instances) attaches
 * three extra fields to every test result: `canGenerateLLMSummary`,
 * `feedbackSubmitted` and `isBedsideTablet`. August 2025 omits them entirely,
 * so they ride on the epicVersion knob rather than living in the shape
 * templates.
 */
function withModernResultFields(payload: unknown): unknown {
  if (isLegacyEpicVersion()) return payload;
  const trio = { canGenerateLLMSummary: false, feedbackSubmitted: false, isBedsideTablet: false };
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p?.results)) {
    p.results = p.results.map((r: Record<string, unknown>) => ({ ...trio, ...r }));
  }
  if (p?.newResults && typeof p.newResults === 'object') {
    for (const [k, v] of Object.entries(p.newResults as Record<string, unknown>)) {
      (p.newResults as Record<string, unknown>)[k] = { ...trio, ...(v as Record<string, unknown>) };
    }
  }
  return p;
}

function acceptAny(): boolean {
  return process.env.FAKE_MYCHART_ACCEPT_ANY === 'true';
}


function requireTermsRedirect(request: NextRequest): NextResponse | null {
  if (!getRequireTerms()) return null;
  const cookie = request.headers.get('cookie');
  if (hasAcceptedTerms(cookie)) return null;
  return NextResponse.redirect(new URL(`${mountPrefix()}/Authentication/TermsConditions`, publicBaseUrl(request)), 302);
}

// ─── Route handler ──────────────────────────────────────────────────
//
// `handleGet`/`handlePost` are the MyChart surface itself, independent of where
// it's mounted; the root catch-all imports them to serve the same responses from
// the domain root. The `GET`/`POST` Next.js actually routes here are thin
// wrappers that refuse to answer under `/MyChart` when the instance is
// root-mounted — a root-mounted instance has no `/MyChart` to serve, and a fake
// that answers on both prefixes lets a broken prefix guess silently "work".
async function renderGet(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const ds = activeDataset(request);
  if (!path || path.length === 0) {
    // In `default-asp` discovery the mount doesn't name the login route either
    // — it bounces through DefaultAsp first, and only that hop names the route.
    // Real instances send a bare relative `DefaultAsp` from `/MyChart/`, which
    // resolves to `/MyChart/DefaultAsp`. Next normalizes that trailing slash
    // away (308 to `/MyChart`) before a route handler ever runs, so under a
    // prefix the same relative form would resolve to `/DefaultAsp` instead —
    // hence the absolute Location here. The root-mounted case below has no
    // trailing slash to lose and does send the bare relative form, which is
    // the shape that broke prefix parsing in the first place.
    if (isDefaultAspDiscovery()) {
      return new NextResponse(null, { status: 302, headers: { Location: `${mountPrefix()}/DefaultAsp` } });
    }
    return NextResponse.redirect(new URL(`${mountPrefix()}/Authentication/Login`, publicBaseUrl(request)), 302);
  }
  const joined = joinPath(path);
  const lower = joined.toLowerCase();

  // The last hop of the DefaultAsp bounce, and the only one that names the
  // mount. The trailing `?` on the target is what real instances send.
  if (lower === 'defaultasp') {
    return new NextResponse(null, {
      status: 302,
      headers: { Location: `${mountPrefix()}/Authentication/Login?` },
    });
  }

  // ── Authentication ──────────────────────────────────────────────
  if (lower === 'authentication/login') {
    return html(loginPage());
  }

  if (lower.includes('loginpagecontroller.min.js')) {
    return new NextResponse(loginPageControllerJs(), { headers: { 'Content-Type': 'application/javascript' } });
  }

  if (lower === 'authentication/secondaryvalidation') {
    return html(secondaryValidationPage());
  }

  if (lower.startsWith('authentication/secondaryvalidation/getsmsconsentstrings')) {
    return html('OK');
  }

  if (lower === 'authentication/termsconditions') {
    return html(termsConditionsPage());
  }

  // ── Session enforcement ─────────────────────────────────────────
  // Everything below this point is post-login surface. Real MyChart guards all
  // of it the same way: no live session → 302 to the login page (which a
  // redirect-following client turns into a 200 HTML login page — that's what an
  // expired-session API call actually looks like from the scraper's side). The
  // keepalive endpoints are the one exception: they answer "0" instead of
  // redirecting, which is the contract MyChart's own JS (and sessionStore's
  // pinger) relies on.
  // Real instances serve both keepalives as text/html (not text/plain). On
  // November 2025 instances keepalive.asp answers "0" even for a live session —
  // /Home/KeepAlive tells the truth, which sessionStore.ts already knows.
  if (lower === 'home/keepalive') {
    return new NextResponse(validateSession(request.headers.get('cookie')) ? '1' : '0', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  if (lower === 'keepalive.asp') {
    const alive = validateSession(request.headers.get('cookie'));
    const body = isLegacyEpicVersion() ? (alive ? '1' : '0') : '0';
    return new NextResponse(body, { headers: { 'Content-Type': 'text/html' } });
  }

  // ASP.NET's error surface renders without a session — a client bounced to
  // FourOhFour/FiveHundred mid-failure is often exactly one whose request was
  // rejected before authentication was consulted.
  if (lower === 'home/fourohfour' || lower === 'home/fivehundred') {
    return NextResponse.redirect(new URL(`${mountPrefix()}/Home/Error?code=14`, publicBaseUrl(request)), 302);
  }
  if (lower === 'home/error') {
    return html(ERROR_PAGE_HTML);
  }
  {
    const redirect = requireSession(request);
    if (redirect) return redirect;
  }

  if (lower === 'inside.asp') {
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
      return NextResponse.redirect(
        new URL(`${mountPrefix()}/inside.asp?mode=self`, publicBaseUrl(request)), 302);
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
      return NextResponse.redirect(new URL(`${mountPrefix()}/Home`, publicBaseUrl(request)), 302);
    }

    return html('Welcome to MyChart');
  }

  // ── Proxy record list ───────────────────────────────────────────
  // The JSON surface the scraper tries first. Instances configured for the
  // HTML/script discovery shapes do not serve it at all, so it 404s there —
  // that 404 is what pushes the scraper onto its fallbacks.
  if (lower === 'proxyswitch') {
    const cookie = request.headers.get('cookie');
    if (!servesProxySwitchJson()) {
      return new NextResponse('Not Found', { status: 404 });
    }
    const user = currentUser(request);
    if (!user) return new NextResponse('Session is missing username', { status: 500 });
    const active = resolveActiveRecord(user, getActiveProxyId(cookie));
    return json(proxySwitchEnvelope(proxySubjectList(user, active?.id ?? user.selfProxyId)));
  }

  // ── Session / Home ─────────────────────────────────────────────
  if (lower === 'home') {
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
  }

  if (lower.startsWith('home/csrftoken')) {
    const termsRedirect = requireTermsRedirect(request);
    if (termsRedirect) return termsRedirect;
    return html(csrfTokenPage());
  }

  // ── HTML pages parsed by cheerio ───────────────────────────────
  if (lower === 'clinical/careteam') {
    return html(careTeamPage(ds.careTeam));
  }

  if (lower === 'insurance') {
    return html(insurancePage(ds.insurance));
  }

  if (lower === 'healthadvisories') {
    return html(preventiveCarePage(ds.preventiveCare));
  }

  if (lower === 'billing/summary') {
    return html(billingSummaryPage(ds.billingSummary));
  }

  if (lower === 'billing/details') {
    return html(billingDetailsPage(ds.billingEncId));
  }

  if (lower.startsWith('billing/details/getvisits')) {
    return json(conformToShape(shapes.billingGetVisits, ds.billingVisits));
  }

  if (lower.startsWith('billing/details/getstatementlist')) {
    return json(conformToShape(shapes.getStatementList, ds.billingStatements));
  }

  if (lower.startsWith('billing/details/loadpaymentlist')) {
    return json(conformToShape(shapes.loadPaymentList, ds.billingPayments));
  }

  if (lower.startsWith('billing/details/downloadfromblob')) {
    // Return a minimal fake PDF
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A]); // %PDF-1.4\n
    return new NextResponse(pdfBytes, { headers: { 'Content-Type': 'application/pdf' } });
  }

  // ── Rich UI pages ────────────────────────────────────────────────
  if (lower === 'clinical/medications') {
    return html(medicationsPage());
  }

  if (lower === 'clinical/allergies') {
    return html(allergiesPage());
  }

  if (lower === 'clinical/healthissues') {
    return html(healthIssuesPage());
  }

  if (lower === 'clinical/immunizations') {
    return html(immunizationsPage());
  }

  if (lower === 'trackmyhealth') {
    return html(vitalsPage());
  }

  if (lower === 'medicalhistory') {
    return html(medicalHistoryPage());
  }

  if (lower === 'testresults') {
    return html(testResultsPage());
  }

  if (lower === 'messaging') {
    return html(messagesPage());
  }

  if (lower === 'visits') {
    return html(visitsPage());
  }

  if (lower === 'letters') {
    return html(lettersPage());
  }

  if (lower === 'goals') {
    return html(goalsPage());
  }

  if (lower === 'referrals') {
    return html(referralsPage());
  }

  if (lower === 'carejourneys') {
    return html(careJourneysPage());
  }

  if (lower === 'documents') {
    return html(documentsPage());
  }

  if (lower === 'education') {
    return html(educationPage());
  }

  if (lower === 'emergencycontacts') {
    return html(emergencyContactsPage());
  }

  if (lower === 'personalinformation') {
    return html(profilePage());
  }

  if (lower === 'settings') {
    const user = currentUser(request);
    return html(settingsPage(user?.totpEnabled ?? false, user?.passkeys ?? []));
  }

  // ── Generic token pages (for scrapers that GET a page to extract CSRF) ──
  if (lower === 'questionnaire' || lower === 'community/manage' || lower.startsWith('app/')) {
    return html(genericTokenPage('MyChart'));
  }

  // An unknown /api/* path is an error on real instances, never a page:
  // ASP.NET's FourOhFour dance on November 2025 instances, a bare 500 on August 2025.
  if (lower.startsWith('api/')) {
    return aspNetFailure(request, 'fourohfour', joined);
  }

  // Fallback: return a token page for any unknown GET
  return html(genericTokenPage('MyChart'));
}

async function renderPost(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const ds = activeDataset(request);
  if (!path || path.length === 0) {
    return json({ error: 'Not found' }, 404);
  }
  const joined = joinPath(path);
  const lower = joined.toLowerCase();

  // ── Session enforcement ─────────────────────────────────────────
  // Real MyChart's entire POST surface outside the login flow requires a live
  // session, api/* JSON endpoints included: an expired session 302s to the
  // login page exactly like the HTML routes, which is why a scraper that blindly
  // calls .json() on the follow-up sees login-page HTML, not a JSON error.
  // Authentication/* stays open — DoLogin, 2FA, terms acceptance and the
  // passkey challenge ARE the login flow.
  if (!lower.startsWith('authentication/')) {
    // CSRF before authentication, exactly as observed live: an /api/* POST
    // with no __RequestVerificationToken header is rejected with the ASP.NET
    // error surface (FiveHundred redirect on November 2025
    // instances, bare 500 on August 2025) even when no session was presented at all. Only a request that
    // clears the token check falls through to the login-redirect the
    // expired-session detector in makeAuthenticatedRequest.ts relies on.
    if (lower.startsWith('api/') && !request.headers.get('__requestverificationtoken')) {
      return aspNetFailure(request, 'fivehundred', joined);
    }
    const redirect = requireSession(request);
    if (redirect) return redirect;
  }

  // ── Authentication ──────────────────────────────────────────────
  if (lower === 'authentication/login/dologin') {
    const body = await request.text();
    const searchParams = new URLSearchParams(body);
    const loginInfoRaw = searchParams.get('LoginInfo');

    if (!loginInfoRaw) {
      return html(doLoginFailed());
    }

    try {
      const loginInfo = JSON.parse(loginInfoRaw);

      // Handle passkey login (Type: "PasskeyLogin")
      if (loginInfo.Type === 'PasskeyLogin') {
        const creds = loginInfo.Credentials;
        const matchedUser = findUserByPasskey(creds.rawId);
        if (matchedUser || acceptAny()) {
          const pk = matchedUser?.passkeys.find(p => p.rawId === creds.rawId);
          if (pk) {
            // Enforce the WebAuthn signature-counter rule like real MyChart.
            // Per WebAuthn §6.1.1: when the counter is in use (presented or
            // stored value is non-zero) each assertion must present a counter
            // strictly greater than the last one accepted — otherwise the
            // credential is replayed/stale/cloned and we reject it. When both
            // are 0 the authenticator doesn't implement a counter (e.g. some
            // platform authenticators), so we accept without enforcing. The
            // counter lives at byte offset 33 (after the 32-byte rpIdHash + 1
            // flags byte) of authenticatorData, big-endian.
            const presented = parseSignCount(creds.authenticatorAssertion?.authenticatorData);
            const usesCounter = (presented ?? 0) !== 0 || pk.signCount !== 0;
            if (usesCounter && (presented === null || presented <= pk.signCount)) {
              return html(doLoginFailed());
            }
            pk.signCount = Math.max(pk.signCount, presented ?? 0);
            pk.lastUsedInstant = new Date().toISOString();
          }
          const sessionId = createSession(matchedUser?.username ?? null);
          const response = getRequireTerms()
            ? html(termsConditionsPage())
            : html(doLoginSuccess());
          response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
          return response;
        }
        return html(doLoginFailed());
      }

      const creds = loginInfo.Credentials;
      // Support both Username and LoginIdentifier
      const userB64 = creds.Username || creds.LoginIdentifier || '';
      const passB64 = creds.Password || '';

      let user: string, pass: string;
      try {
        user = atob(userB64);
        pass = atob(passB64);
      } catch {
        return html(doLoginFailed());
      }

      const matchedUser = findUser(user);
      const validCreds = acceptAny()
        ? matchedUser ?? state.users.homer
        : (matchedUser && matchedUser.password === pass ? matchedUser : null);

      if (!validCreds) {
        return html(doLoginFailed());
      }

      // 2FA is required when the user is seeded to require it (e.g. marge)
      // or when the env-var override is set. Toggling totpEnabled at runtime
      // does NOT change login behavior — the CLI's --set-up-totp /
      // --disable-totp round-trip keeps working with username+password.
      const envRequire2fa = process.env.FAKE_MYCHART_REQUIRE_2FA === 'true';
      const require2fa = validCreds.requires2faAtLogin || envRequire2fa;
      if (require2fa) {
        // Create a session bound to the user so the subsequent /Validate call
        // knows whose TOTP profile to consult, but the front-end treats it
        // as un-authenticated until 2FA succeeds.
        const sessionId = createSession(validCreds.username);
        const response = html(doLoginNeed2FA());
        response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
        return response;
      }

      // Successful login without 2FA — create session and set cookie
      const sessionId = createSession(validCreds.username);
      // If terms are required, return the T&C page instead of the home page
      const response = getRequireTerms()
        ? html(termsConditionsPage())
        : html(doLoginSuccess());
      response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
      return response;

    } catch {
      return html(doLoginFailed());
    }
  }

  // ── Terms & Conditions acceptance ──────────────────────────────
  if (lower === 'authentication/termsconditions') {
    const cookie = request.headers.get('cookie');
    acceptTerms(cookie);
    // Redirect to home after accepting
    return NextResponse.redirect(new URL(`${mountPrefix()}/Home`, publicBaseUrl(request)), 302);
  }

  // ── 2FA ────────────────────────────────────────────────────────
  if (lower.startsWith('authentication/secondaryvalidation/sendcode')) {
    const body = await request.text();
    const isEmail = body.includes('deliveryMethodEmail=true');
    const maskedEmail = 'ho***@springfield.net';
    const maskedPhone = '***-***-7890';
    const contact = isEmail ? maskedEmail : maskedPhone;
    return html(`Code sent to ${contact}`);
  }

  if (lower.startsWith('authentication/secondaryvalidation/validate')) {
    const body = await request.text();
    const submittedCode = new URLSearchParams(body).get('TwoFactorCode') ?? '';
    // Real MyChart validates a real TOTP code against the account's enrolled
    // secret, so a live code for the user's stored secret (marge seeds
    // JBSWY3DPEHPK3PXP) is accepted alongside the fixed test code — that's
    // what lets a client's silent re-login (stored TOTP secret → generated
    // code) be exercised end to end.
    const userSecret = currentUser(request)?.totpSecret ?? null;
    const totpValid = !!userSecret && verifyTotpCode(userSecret, submittedCode);
    if (submittedCode === '123456' || acceptAny() || totpValid) {
      // Preserve the username from the pending session so the post-2FA
      // session continues to know who's logged in (matters for per-user
      // TOTP/passkey state).
      const username = getSessionUsername(request.headers.get('cookie'));
      const sessionId = createSession(username);
      const response = json({ Success: true });
      response.headers.set('Set-Cookie', sessionCookieHeader(sessionId));
      return response;
    }
    return json({ Success: false, TwoFactorCodeFailReason: 'codewrong' });
  }

  // ── JSON API endpoints ────────────────────────────────────────
  // Every fixture-backed response is conformed to the field set observed on
  // real instances (realShapes.ts): fields the fixture curates win, fields it
  // omits are present with the neutral value a real instance defaults to.
  // Medications
  if (lower === 'api/medications/loadmedicationspage') {
    return json(conformToShape(shapes.loadMedicationsPage, ds.medications));
  }
  if (lower === 'api/medications/requestrefill') {
    return json({ success: true });
  }

  // Allergies
  if (lower === 'api/allergies/loadallergies') {
    return json(conformToShape(shapes.loadAllergies, ds.allergies));
  }

  // Immunizations
  if (lower === 'api/immunizations/loadimmunizations') {
    return json(conformToShape(shapes.loadImmunizations, ds.immunizations));
  }

  // Health Issues
  if (lower === 'api/healthissues/loadhealthissuesdata') {
    return json(conformToShape(shapes.loadHealthIssuesData, ds.healthIssues));
  }

  // Health Summary
  if (lower === 'api/health-summary/fetchhealthsummary') {
    return json(conformToShape(shapes.fetchHealthSummary, ds.healthSummary));
  }
  if (lower === 'api/health-summary/fetchh2gheader') {
    return json(conformToShape(shapes.fetchH2GHeader, ds.healthSummaryHeader));
  }

  // Vitals / Flowsheets — two-call contract (definitions, then readings)
  if (lower === 'api/track-my-health/getflowsheets') {
    return json(conformToShape(shapes.getFlowsheets, ds.vitals));
  }
  if (lower === 'api/track-my-health/getflowsheetreadings') {
    // Real MyChart pages backwards through history: it returns readings at or
    // before endInstantIso, and numReadings caps distinct reading INSTANTS
    // (flowsheet columns), not individual readings. Honor both so the scraper's
    // paging loop is actually exercised.
    const body = await request.json();
    const endInstantIso: string = body?.endInstantIso || '9999-12-31T23:59:59';
    const numReadings: number = Number(body?.numReadings) || 200;

    const all = ds.vitalsReadings.flowsheet.readings;
    const inRange = all.filter((r) => r.instantTakenIso <= endInstantIso);
    const instants = [...new Set(inRange.map((r) => r.instantTakenIso))].sort().reverse();
    const page = instants.slice(0, numReadings);
    const pageSet = new Set(page);

    return json(conformToShape(shapes.getFlowsheetReadings, {
      ...ds.vitalsReadings,
      flowsheet: {
        ...ds.vitalsReadings.flowsheet,
        readings: inRange.filter((r) => pageSet.has(r.instantTakenIso)),
        hasMoreData: instants.length > page.length,
      },
    }));
  }

  // Medical History
  if (lower === 'api/histories/loadhistoriesviewmodel') {
    return json(conformToShape(shapes.loadHistoriesViewModel, ds.medicalHistory));
  }

  // Care Journeys
  if (lower === 'api/care-journeys/getcarejourneys') {
    return json(ds.careJourneys);
  }

  // Goals
  if (lower === 'api/goals/loadcareteamgoals') {
    return json(conformToShape(shapes.loadCareTeamGoals, ds.careTeamGoals));
  }
  if (lower === 'api/goals/loadpatientgoals') {
    return json(conformToShape(shapes.loadPatientGoals, ds.patientGoals));
  }

  // Letters
  if (lower === 'api/letters/getletterslist') {
    return json(conformToShape(shapes.getLettersList, ds.letters));
  }
  if (lower === 'api/letters/getletterdetails') {
    // Real instances answer an unknown hnoId with a literal JSON null body,
    // not an error status and not a placeholder document.
    try {
      const body = await request.json();
      const details = ds.letterDetails[body.hnoId];
      if (details) return json(details);
      return json(null);
    } catch {
      return json(null);
    }
  }

  // Referrals
  if (lower === 'api/referrals/listreferrals') {
    return json(conformToShape(shapes.listReferrals, ds.referrals));
  }

  // Documents
  if (lower === 'api/documents/viewer/loadotherdocuments') {
    return json(ds.documents);
  }

  // Education. Real instances return a bare ARRAY of titles, not an object.
  if (lower === 'api/education/getpateducationtitles') {
    return json(conformToShape(shapes.getPatEducationTitles, ds.educationMaterials));
  }

  // Emergency Contacts. Per-patient in real MyChart, and mutable, so they're
  // keyed by record id rather than living in the immutable dataset — a child's
  // chart must not list the account holder's contacts.
  if (lower === 'api/personalinformation/getrelationships') {
    return json(conformToShape(shapes.getRelationships, activeEmergencyContacts(request)));
  }
  if (lower === 'api/personalinformation/addrelationship') {
    try {
      const body = await request.json();
      state.ecIdCounter++;
      const newContact = homer.makeEmergencyContact(
        `EC-${state.ecIdCounter}`,
        body.name || '',
        body.relationshipType || '',
        body.phoneNumber || '',
        body.isEmergencyContact ?? true,
      );
      activeEmergencyContacts(request).contacts.push(newContact);
      return json({ success: true, id: newContact.id });
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
  }
  if (lower === 'api/personalinformation/updaterelationship') {
    try {
      const body = await request.json();
      const store = activeEmergencyContacts(request);
      const idx = store.contacts.findIndex(
        (r) => r.id === body.id || r.formattedName === body.id
      );
      const existing = idx === -1 ? undefined : store.contacts[idx];
      if (!existing) return json({ error: 'Contact not found' }, 404);
      if (body.name) existing.formattedName = body.name;
      if (body.relationshipType) {
        existing.relationToPatient = { ...existing.relationToPatient, name: body.relationshipType, labelText: body.relationshipType };
      }
      if (body.phoneNumber) {
        existing.contactInformation.phoneNumbers = [{ phoneNumber: body.phoneNumber, type: 'Home' }];
      }
      if (body.isEmergencyContact !== undefined) existing.isEmergencyContact = body.isEmergencyContact;
      return json({ success: true });
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
  }
  if (lower === 'api/personalinformation/removerelationship') {
    try {
      const body = await request.json();
      const store = activeEmergencyContacts(request);
      store.contacts = store.contacts.filter(
        (r) => r.id !== body.id && r.formattedName !== body.id
      );
      return json({ success: true });
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
  }

  // Upcoming Orders. Real instances answer with keyed maps (orderList,
  // orderGroupList, providerList), never a bare array.
  if (lower === 'api/upcoming-orders/getupcomingorders') {
    return json(conformToShape(shapes.getUpcomingOrders, ds.upcomingOrders));
  }

  // EHI Export
  if (lower === 'api/release-of-information/getehietemplates') {
    return json(conformToShape(shapes.getEhiETemplates, ds.ehiExport));
  }

  // Activity Feed
  if (lower === 'api/item-feed/fetchitemfeed') {
    return json(conformToShape(shapes.fetchItemFeed, ds.activityFeed));
  }

  // Test Results / Labs.
  //
  // Real instances (all three captured) accept only groupType 0 and 1, and
  // both return ONE combined list holding every result kind — labs, imaging
  // and procedures together. Any other groupType is a 500 with the classic
  // ASP.NET Web API `{"Message": "An error has occurred."}` body. There is no
  // imaging-only groupType; the old fake invented one.
  if (lower === 'api/test-results/getlist') {
    let groupType: unknown = 0;
    try {
      groupType = (await request.json()).groupType;
    } catch { /* treat as default */ }
    if (groupType !== 0 && groupType !== 1) {
      return json({ Message: 'An error has occurred.' }, 500);
    }
    const combined = {
      ...ds.labResultsList,
      newResultGroups: [
        ...ds.labResultsList.newResultGroups,
        ...ds.imagingLabResultsList.newResultGroups,
      ],
      newResults: {
        ...ds.labResultsList.newResults,
        ...ds.imagingLabResultsList.newResults,
      },
      newProviderPhotoInfo: {
        ...ds.labResultsList.newProviderPhotoInfo,
        ...ds.imagingLabResultsList.newProviderPhotoInfo,
      },
    };
    return json(withModernResultFields(conformToShape(shapes.testResultList, combined)));
  }
  if (lower === 'api/test-results/getdetails') {
    let orderKey = '';
    try {
      orderKey = (await request.json()).orderKey ?? '';
    } catch { /* fall through to the empty shell */ }
    const byKey: Record<string, unknown> = {
      'GRP-XRAY': ds.imagingLabResultDetails,
      'GRP-CT': ds.ctLabResultDetails,
      'GRP-CMP': ds.cmpLabResultsDetails,
      'GRP-LIPID': ds.labResultsDetails,
      'GRP-CBC': ds.cbcLabResultsDetails,
    };
    // Real instances answer an unknown orderKey with a 200 whose envelope is
    // fully formed but EMPTY — blank orderName/key, one result with no name,
    // no components — never an error and never someone else's order.
    const fixture = byKey[orderKey] ?? { orderName: '', key: '', results: [{}] };
    return json(withModernResultFields(conformToShape(shapes.testResultDetails, fixture)));
  }
  if (lower === 'api/past-results/getmultiplehistoricalresultcomponents') {
    // Real shape: historicalResults is a MAP keyed by component id (plus the
    // component ordering and report id), not a list.
    let orderID = '';
    try {
      orderID = (await request.json()).orderID ?? '';
    } catch { /* fall through */ }
    const data = ds.historicalResultsByOrder[orderID]
      ?? { historicalResults: {}, orderedComponentIDs: [], reportID: '', shouldShowBedsideActiveView: false };
    return json(conformToShape(shapes.getMultipleHistoricalResultComponents, data));
  }
  if (lower === 'api/visit-notes/getvisitnotes') {
    // Real instances answer an unknown CSN with a literal JSON null body.
    try {
      const body = await request.json();
      const data = ds.visitNotesByCsn[body.CSN];
      if (data) return json(conformToShape(shapes.getVisitNotes, data));
    } catch { /* fall through */ }
    return json(null);
  }
  if (lower === 'api/report-content/loadreportcontent') {
    try {
      const body = await request.json();
      // Clinical note content (see getNoteContent in scrapers/myChart/notes/notes.ts).
      if (body.reportMnemonic === 'OPEN_NOTES') {
        const note = ds.noteContent[body.contextID];
        if (note) return json(conformToShape(shapes.loadReportContent, note));
      }
      // After Visit Summary (see getVisitAVS in scrapers/myChart/notes/notes.ts).
      else if (body.reportMnemonic === 'AMB_AVS') {
        const avs = ds.avsByCsn[body.csn];
        if (avs) return json(conformToShape(shapes.loadReportContent, avs));
      }
      // Imaging report bodies (existing).
      else if (body.reportID === 'RPT-XRAY-001') {
        return json(conformToShape(shapes.loadReportContent, ds.imagingReportContent));
      }
      else if (body.reportID === 'RPT-CT-001') {
        return json(conformToShape(shapes.loadReportContent, ds.ctReportContent));
      }
    } catch { /* fall through */ }
    return json(conformToShape(shapes.loadReportContent, { reportContent: '', reportCss: '' }));
  }

  // ── FdiData (bridge from MyChart to eUnity) ───────────────────
  if (lower.startsWith('extensibility/redirection/fdidata')) {
    const url = new URL(request.url);
    // Prefer x-forwarded-host, then Host; ignore localhost values that
    // sneak in when Next.js runs behind a load balancer. Force https only
    // for real external hostnames (dotted + non-localhost); Docker service
    // names like "fake-mychart:3000" must stay http.
    const forwardedHost = request.headers.get('x-forwarded-host');
    const hostHeader = request.headers.get('host');
    const isLocalHost = (h: string | null) =>
      !!h && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(h);
    const host =
      forwardedHost ||
      (hostHeader && !isLocalHost(hostHeader) ? hostHeader : null) ||
      url.host;
    const hostName = host.split(':')[0] ?? host;
    const isExternal = !isLocalHost(host) && hostName.includes('.');
    const proto = isExternal
      ? 'https'
      : (request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', ''));
    const origin = `${proto}://${host}`;
    // Determine which study based on the fdi parameter
    const fdi = url.searchParams.get('fdi') ?? '';
    const studyType = fdi.includes('CT') ? 'ct' : 'xray';
    return json({
      url: `${origin}/e/saml-sts?study=${studyType}`,
      launchmode: 2,
      IsFdiPost: false,
    });
  }

  // ── Visits ────────────────────────────────────────────────────
  if (lower.startsWith('visits/visitslist/loadupcoming')) {
    return json(conformToShape(shapes.visitsLoadUpcoming, ds.upcomingVisits));
  }
  if (lower.startsWith('visits/visitslist/loadpast')) {
    const serializedIndex = new URL(request.url).searchParams.get('serializedIndex');
    return json(conformToShape(shapes.visitsLoadPast, buildPastVisitsPage(ds, serializedIndex)));
  }

  // ── Messages / Conversations (mutable state) ──────────────────
  if (lower === 'api/conversations/getconversationlist') {
    return json(conformToShape(shapes.getConversationList, activeConversations(request)));
  }
  if (lower === 'api/conversations/getconversationmessages') {
    try {
      const body = await request.json();
      const conv = activeConversations(request).conversations.find(
        (c: { hthId: string }) => c.hthId === body.conversationId
      );
      if (conv) {
        return json({ messages: conv.messages });
      }
      return json({ messages: [] });
    } catch {
      return json({ messages: [] });
    }
  }
  if (lower === 'api/conversations/getcomposeid') {
    state.composeIdCounter++;
    return json(`COMPOSE-${state.composeIdCounter}`);
  }
  if (lower === 'api/conversations/removecomposeid') {
    return json({ success: true });
  }
  if (lower === 'api/conversations/savereplydraft') {
    return json({ success: true });
  }
  if (lower === 'api/conversations/deletedraft') {
    return json({ success: true });
  }
  if (lower === 'api/conversations/deleteconversation') {
    try {
      const body = await request.json();
      activeConversations(request).conversations = activeConversations(request).conversations.filter(
        (c: { hthId: string }) => c.hthId !== body.conversationId
      );
      return json({ success: true });
    } catch {
      return json({ success: true });
    }
  }
  if (lower === 'api/conversations/sendreply') {
    try {
      const body = await request.json();
      const convId = body.conversationId || '';
      const conv = activeConversations(request).conversations.find(
        (c: { hthId: string }) => c.hthId === convId
      );
      if (conv) {
        const replyBody = Array.isArray(body.messageBody) ? body.messageBody[0] : (body.messageBody || body.body || '');
        conv.messages.push({
          wmgId: `MSG-${Date.now()}`,
          author: { empKey: '', wprKey: 'WPR-HOMER', displayName: 'Homer Simpson' },
          deliveryInstantISO: new Date().toISOString(),
          body: replyBody,
        });
      }
      // Real MyChart returns the conversation ID as a plain JSON string
      return json(convId);
    } catch {
      return json('');
    }
  }

  // ── Medical Advice Requests (new message compose) ─────────────
  if (lower === 'api/medicaladvicerequests/getsubtopics') {
    return json(conformToShape(shapes.getSubTopics, ds.subtopics));
  }
  if (lower === 'api/medicaladvicerequests/getmedicaladvicerequestrecipients') {
    return json(conformToShape(shapes.getMedicalAdviceRequestRecipients, ds.messageRecipients));
  }
  if (lower === 'api/medicaladvicerequests/getviewers') {
    return json(ds.messageViewers);
  }
  if (lower === 'api/medicaladvicerequests/sendmedicaladvicerequest') {
    try {
      const body = await request.json();
      const newConvId = `CONV-${Date.now()}`;
      const msgBody = Array.isArray(body.messageBody) ? body.messageBody[0] : (body.messageBody || '');
      const msgSubject = body.messageSubject || body.subject || 'New Message';
      const recipientName = body.recipient?.displayName || body.recipientName || 'Provider';
      activeConversations(request).conversations.unshift({
        hthId: newConvId,
        subject: msgSubject,
        previewText: msgBody,
        audience: [{ name: recipientName }],
        hasMoreMessages: false,
        userOverrideNames: {},
        messages: [
          {
            wmgId: `MSG-${Date.now()}`,
            author: { empKey: '', wprKey: 'WPR-HOMER', displayName: 'Homer Simpson' },
            deliveryInstantISO: new Date().toISOString(),
            body: msgBody,
          },
        ],
      });
      return json(newConvId);
    } catch {
      return json(`CONV-${Date.now()}`);
    }
  }
  if (lower === 'api/medicaladvicerequests/savemedicaladvicerequestdraft') {
    return json({ success: true });
  }

  // ── TOTP / 2FA Setup ──────────────────────────────────────────
  if (lower === 'api/secondary-validation/gettwofactorinfo') {
    const u = currentUser(request);
    return json({ ...homer.totpInfo, IsTotpEnabled: u?.totpEnabled ?? false });
  }
  if (lower === 'api/secondary-validation/verifypasswordandupdatecontact') {
    try {
      const body = await request.json();
      const password = body.Password || body.password || '';
      const u = currentUser(request);
      const valid = acceptAny() || (u != null && password === u.password);
      return json({ IsPasswordValid: valid });
    } catch {
      return json({ IsPasswordValid: true });
    }
  }
  if (lower === 'api/secondary-validation/totpqrcode') {
    // Real MyChart mints a fresh secret per call and holds it pending until a
    // valid code proves the client stored it. Returning a constant here would
    // let a client that ignores the response still "set up" TOTP.
    const u = currentUser(request);
    const secret = generateTotpSecret();
    if (u) u.pendingTotpSecret = secret;
    return json({ ...homer.totpQrCode, encodedSecretKey: secret });
  }
  if (lower === 'api/secondary-validation/verifycode') {
    try {
      const body = await request.json();
      const code = body.Code || body.code || '';
      const u = currentUser(request);
      // Validate against the secret this account is actually setting up (or
      // already using, for the opt-out flow). Deliberately NOT bypassed by
      // FAKE_MYCHART_ACCEPT_ANY: that knob loosens credential lookup, not
      // cryptography, and bypassing it here would make the one step of the
      // setup flow that involves real computation untestable.
      const secret = u?.pendingTotpSecret ?? u?.totpSecret ?? null;
      if (secret && verifyTotpCode(secret, String(code))) {
        return json({ Success: true });
      }
      return json({ Success: false }, 400);
    } catch {
      return json({ Success: false }, 400);
    }
  }
  if (lower === 'api/secondary-validation/updatetwofactortotpoptinstatus') {
    // Toggle TOTP status for the logged-in user. The scraper sends an empty
    // body for both directions, so the endpoint infers which one is meant.
    const u = currentUser(request);
    if (u) {
      u.totpEnabled = !u.totpEnabled;
      if (u.totpEnabled) {
        // Commit the secret VerifyCode just validated.
        u.totpSecret = u.pendingTotpSecret ?? u.totpSecret;
      } else {
        u.totpSecret = null;
      }
      u.pendingTotpSecret = null;
    }
    return json({ Success: true });
  }

  // ── Contact Information ───────────────────────────────────────
  if (lower.startsWith('personalinformation/getcontactinformation')) {
    return json(conformToShape(shapes.getContactInformation, ds.contactInfo));
  }

  // ── Linked Accounts ───────────────────────────────────────────
  if (lower.startsWith('community/shared/loadcommunitylinks')) {
    return json(conformToShape(shapes.loadCommunityLinks, ds.linkedAccounts));
  }

  // ── Questionnaires ────────────────────────────────────────────
  if (lower === 'questionnaire/getquestionnairelist') {
    return json(ds.questionnaires);
  }

  // ── Passkey Login Challenge ───────────────────────────────────
  // Returns the union of all registered passkeys across users so the client
  // can present any one of them; we identify the user during DoLogin by
  // looking up the chosen credential's rawId.
  if (lower.startsWith('authentication/login/getpasskeygetparams')) {
    const challenge = crypto.randomBytes(32).toString('base64');
    const allPasskeys = Object.values(state.users).flatMap(u => u.passkeys);
    return json({
      Success: true,
      PasskeyGetParams: {
        Attestation: 'none',
        Challenge: challenge,
        RpId: '',
        Timeout: 60000,
        UserVerification: 'preferred',
        ExpirationInstantIso: `/Date(${Date.now() + 60000})/`,
        AllowCredentials: allPasskeys.map(pk => ({ id: pk.rawId, type: 'public-key' })),
      },
    });
  }

  // ── Passkey Management (per-user) ─────────────────────────────
  if (lower === 'api/passkey-management/loadpasskeyinfo') {
    const u = currentUser(request);
    return json({
      passkeys: u?.passkeys ?? [],
      lastAuthentication: undefined,
    });
  }
  if (lower === 'api/passkey-management/generatecreaterequest') {
    const challenge = crypto.randomBytes(32).toString('base64');
    const u = currentUser(request);
    return json({
      success: true,
      data: {
        ...homer.passkeyCreationOptions,
        challenge,
        // Use logged-in user's identity in the WebAuthn user handle so the
        // resulting credential is bound to them.
        user: u
          ? {
              id: Buffer.from(`${u.username}-user-id`).toString('base64'),
              name: u.username,
              displayName: u.displayName,
            }
          : homer.passkeyCreationOptions.user,
        excludeCredentials: (u?.passkeys ?? []).map(pk => ({ id: pk.rawId, type: 'public-key' })),
      },
    });
  }
  if (lower === 'api/passkey-management/createpasskey') {
    try {
      const body = await request.json();
      const u = currentUser(request);
      if (!u) return json({ success: false, errors: ['Not logged in'] }, 401);
      state.passkeyIdCounter++;
      const newPasskey = {
        rawId: body.rawId || crypto.randomBytes(32).toString('base64'),
        name: `Passkey ${state.passkeyIdCounter}`,
        createdOnDevice: 'Software Authenticator',
        creationInstant: new Date().toISOString(),
        lastUsedInstant: null,
        signCount: 0,
      };
      u.passkeys.push(newPasskey);
      return json({ success: true, data: newPasskey });
    } catch {
      return json({ success: false, errors: ['Invalid request'] }, 400);
    }
  }
  if (lower === 'api/passkey-management/deletepasskey') {
    try {
      const body = await request.json();
      const u = currentUser(request);
      if (u) u.passkeys = u.passkeys.filter(pk => pk.rawId !== body.rawId);
      return json({ success: true });
    } catch {
      return json({ success: false }, 400);
    }
  }
  if (lower === 'api/passkey-management/renamepasskey') {
    try {
      const body = await request.json();
      const u = currentUser(request);
      const pk = u?.passkeys.find(p => p.rawId === body.rawId);
      if (pk) pk.name = body.name || pk.name;
      return json({ success: true });
    } catch {
      return json({ success: false }, 400);
    }
  }

  // ── Appointment Booking ───────────────────────────────────────
  if (lower === 'api/scheduling/getavailableappointments') {
    return json({ appointments: ds.availableAppointments });
  }
  if (lower === 'api/scheduling/bookappointment') {
    try {
      const body = await request.json();
      const slotId = body.slotId;
      // Find the slot across all providers
      let foundSlot: { date: string; time: string; slotId: string } | null = null;
      let foundProvider: typeof ds.availableAppointments[0] | null = null;
      for (const appt of ds.availableAppointments) {
        const slot = appt.slots.find(s => s.slotId === slotId);
        if (slot) { foundSlot = slot; foundProvider = appt; break; }
      }
      if (!foundSlot || !foundProvider) {
        return json({ success: false, error: 'Slot not found' }, 400);
      }
      const confirmation = {
        confirmationNumber: `SPRFLD-${Date.now().toString(36).toUpperCase()}`,
        slotId,
        provider: foundProvider.provider,
        department: foundProvider.department,
        location: foundProvider.location,
        visitType: foundProvider.visitType,
        date: foundSlot.date,
        time: foundSlot.time,
        reason: body.reason || 'Not specified',
      };
      state.bookedAppointments.push(confirmation);
      return json({
        success: true,
        ...confirmation,
        message: `Your appointment with ${foundProvider.provider} on ${foundSlot.date} at ${foundSlot.time} has been confirmed.`,
      });
    } catch {
      return json({ success: false, error: 'Invalid request' }, 400);
    }
  }

  // ── Fallback ──────────────────────────────────────────────────
  console.log(`[fake-mychart] Unhandled POST: /MyChart/${joined}`);
  // An unknown /api/* path gets ASP.NET's error surface on real instances.
  if (lower.startsWith('api/')) {
    return aspNetFailure(request, 'fourohfour', joined);
  }
  return json({ error: 'Not implemented', path: joined }, 404);
}

// ─── Prefix guard ───────────────────────────────────────────────────
// Mirror of the root catch-all: each mount mode serves MyChart from exactly one
// place, never both.
function notServedHere(path: string[] | undefined) {
  return NextResponse.json(
    { error: 'Not found', path: (path ?? []).join('/') },
    { status: 404 },
  );
}



/**
 * Fill in the header's proxy selector for whichever session made this request.
 *
 * Doing it here rather than passing a model into each page function keeps every
 * page consistent — real MyChart shows the selector in the header everywhere,
 * not only on Home — without threading an argument through ~25 templates.
 * Pages for accounts with no proxy access get an empty string, matching real
 * instances, which render no selector for a single-record account.
 */
async function withProxySelector(request: NextRequest, res: NextResponse): Promise<NextResponse> {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const body = await res.text();
  if (!body.includes(PROXY_SELECTOR_PLACEHOLDER)) {
    return new NextResponse(body, { status: res.status, headers: res.headers });
  }
  const user = currentUser(request);
  const markup = user ? renderProxySelector(proxySelectorFor(request, user)) : '';
  return new NextResponse(body.replaceAll(PROXY_SELECTOR_PLACEHOLDER, markup), {
    status: res.status,
    headers: res.headers,
  });
}

/**
 * The MyChart surface itself, independent of where it's mounted. The root
 * catch-all calls these directly when the instance is root-mounted, so the
 * header selector is filled in here rather than in the prefix-gated exports
 * below — otherwise root-mounted pages would ship the raw placeholder.
 */
export async function handleGet(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return withProxySelector(request, await renderGet(request, ctx));
}

export async function handlePost(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return withProxySelector(request, await renderPost(request, ctx));
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (isRootMount()) return notServedHere((await ctx.params).path);
  return handleGet(request, ctx);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  if (isRootMount()) return notServedHere((await ctx.params).path);
  return handlePost(request, ctx);
}
