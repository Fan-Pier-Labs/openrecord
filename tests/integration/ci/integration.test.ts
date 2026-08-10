/**
 * CI Integration Test Suite
 *
 * End-to-end tests that run against Docker Compose services:
 * - PostgreSQL 18
 * - fake-mychart server
 * - Next.js web app
 *
 * All tests run sequentially in a single file to maintain shared state
 * (session cookies, instance IDs, etc.) across the full user journey.
 */

import { describe, it, expect } from 'bun:test';
import { parseTotpUri } from '../../../scrapers/myChart/totp';
import { myChartUserPassLogin, complete2faFlow } from '../../../scrapers/myChart/login';
import { getMyChartProfile } from '../../../scrapers/myChart/profile';
import { discoverProxyTargets, switchProxyTarget } from '../../../scrapers/myChart/proxyContext';
import { getMedications } from '../../../scrapers/myChart/medications';
import { getAllergies } from '../../../scrapers/myChart/allergies';
import { getHealthIssues } from '../../../scrapers/myChart/healthIssues';
import { getImagingResults } from '../../../scrapers/myChart/labs_and_procedure_results/labResults';
import { downloadImagingStudyDirect } from '../../../scrapers/myChart/eunity/imagingDirectDownload';
import { convertCloToJpg } from '../../../scrapers/myChart/clo-image-parser/clo_to_jpg';
import { Client } from 'pg';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.CI_WEB_URL || 'http://localhost:8080';
const FAKE_MYCHART_HOSTNAME = process.env.CI_FAKE_MYCHART_HOSTNAME || 'fake-mychart:3000';
// Host-side address for the scraper-level eUnity test, which talks to
// fake-mychart directly (not through the web app's Docker network).
const FAKE_MYCHART_HOST_URL = process.env.CI_FAKE_MYCHART_HOST_URL || 'localhost:4000';

const TEST_EMAIL = `ci-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';
const TEST_NAME = 'CI Test User';

// ---------------------------------------------------------------------------
// Shared mutable state
// ---------------------------------------------------------------------------

let cookies = '';
let instanceId = '';
let sessionKey = '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCookies(res: Response): string {
  const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
  const existing = parseCookieString(cookies);

  for (const header of setCookieHeaders) {
    const nameValue = header.split(';')[0];
    const eqIdx = nameValue.indexOf('=');
    if (eqIdx > 0) {
      const name = nameValue.slice(0, eqIdx).trim();
      const value = nameValue.slice(eqIdx + 1).trim();
      existing[name] = value;
    }
  }

  return Object.entries(existing)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function parseCookieString(c: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!c) return map;
  for (const part of c.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      map[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
  return map;
}

async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (cookies) headers.set('Cookie', cookies);
  headers.set('Origin', BASE_URL);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: 'manual' });
}

async function signUp(email: string, password: string, name: string) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email, password, name }),
    redirect: 'manual',
  });
  cookies = extractCookies(res);
  return res;
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  cookies = extractCookies(res);
  return res;
}

async function signOut() {
  const res = await authedFetch('/api/auth/sign-out', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  cookies = extractCookies(res);
  return res;
}

// ===================================================================
// 1. Health Check
// ===================================================================

describe('Health check', () => {
  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

// ===================================================================
// 1b. Landing / login page
// ===================================================================

describe('Login page', () => {
  it('renders the newsletter signup as the hero CTA with a work-in-progress notice', async () => {
    const res = await fetch(`${BASE_URL}/login`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // Newsletter form is the primary call to action.
    expect(html).toContain('Notify me');
    expect(html).toContain('Email Address');
    // Work-in-progress messaging is surfaced.
    expect(html).toContain('Work in progress');
    expect(html).toContain('OpenRecord is still a work in progress');
    // The old "Get started" hero button and bottom newsletter section are gone;
    // the newsletter form ("Subscribe to Newsletter") no longer lives at the bottom.
    expect(html).not.toContain('Subscribe to Newsletter');
  });
});

// ===================================================================
// 2. Authentication
// ===================================================================

describe('Authentication', () => {
  it('signs up a new account', async () => {
    const res = await signUp(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.user.name).toBe(TEST_NAME);
    expect(body.user.id).toBeDefined();

    expect(body.user.id).toBeDefined();
    expect(cookies).toContain('better-auth.session_token');
  });

  it('can access authenticated endpoints after sign-up', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('signs out successfully', async () => {
    const res = await signOut();
    // Sign-out should return 200
    expect(res.status).toBe(200);

    // Clear cookies locally and verify unauthenticated access fails
    const savedCookies = cookies;
    cookies = '';
    const unauthedRes = await authedFetch('/api/mychart-instances');
    expect(unauthedRes.status).toBe(401);
    // Restore cookies for subsequent tests (sign-in will overwrite)
    cookies = savedCookies;
  });

  it('signs in with existing credentials', async () => {
    const res = await signIn(TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(cookies).toContain('better-auth.session_token');
  });

  it('can access authenticated endpoints after sign-in', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
  });

  it('social sign-in endpoint does not return 403 (origin trust check)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ provider: 'google', callbackURL: '/home' }),
      redirect: 'manual',
    });
    // Should not be 403 (origin rejected). May be 302 (redirect to Google) or
    // another status if Google OAuth isn't configured, but never 403.
    expect(res.status).not.toBe(403);
  });
});

// ===================================================================
// 3. MyChart Instance Management
// ===================================================================

describe('MyChart instance management', () => {
  it('creates a new MyChart instance', async () => {
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: FAKE_MYCHART_HOSTNAME,
        username: 'homer',
        password: 'donuts123',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.hostname).toBe(FAKE_MYCHART_HOSTNAME);
    expect(body.username).toBe('homer');
    expect(body.connected).toBe(false);

    instanceId = body.id;
  });

  it('lists the instance', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].id).toBe(instanceId);
    expect(body[0].hostname).toBe(FAKE_MYCHART_HOSTNAME);
  });

  it('gets instance by ID', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(instanceId);
  });

  it('connects to fake-mychart (login)', async () => {
    const res = await authedFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ myChartInstanceId: instanceId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    if (body.state === 'need_2fa') {
      const twofaRes = await authedFetch('/api/twofa', {
        method: 'POST',
        body: JSON.stringify({ sessionKey: body.sessionKey, code: '123456' }),
      });
      expect(twofaRes.status).toBe(200);
      const twofaBody = await twofaRes.json();
      expect(twofaBody.state).toBe('logged_in');
      sessionKey = twofaBody.sessionKey;
    } else {
      expect(body.state).toBe('logged_in');
      sessionKey = body.sessionKey;
    }

    expect(sessionKey).toBeTruthy();
  }, 30_000);

  it('instance shows as connected', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(true);
  });

  it('rejects duplicate instance', async () => {
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: FAKE_MYCHART_HOSTNAME,
        username: 'homer',
        password: 'donuts123',
      }),
    });
    expect(res.status).toBe(409);
  });

  it('rejects blocked instance (central.mychart.org)', async () => {
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: 'central.mychart.org',
        username: 'test',
        password: 'test',
      }),
    });
    expect(res.status).toBe(400);
  });
});

// ===================================================================
// 4. Full Data Scrape
// ===================================================================

describe('Full data scrape', () => {
  it('scrapes all categories from fake-mychart', async () => {
    const res = await authedFetch('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    const expectedCategories = [
      'profile', 'email', 'billing', 'upcomingVisits', 'pastVisits',
      'labResults', 'messages', 'medications', 'allergies', 'immunizations',
      'insurance', 'careTeam', 'referrals', 'healthSummary', 'letters',
      'healthIssues', 'preventiveCare', 'medicalHistory', 'vitals',
      'emergencyContacts', 'documents', 'goals', 'upcomingOrders',
      'questionnaires', 'careJourneys', 'activityFeed', 'educationMaterials',
      'ehiExport', 'imagingResults', 'linkedMyChartAccounts',
    ];

    for (const category of expectedCategories) {
      expect(data).toHaveProperty(category);
    }

    // Spot-check profile (Homer Simpson)
    if (data.profile && !data.profile.error) {
      expect(JSON.stringify(data.profile)).toContain('Homer');
    }

    // Spot-check medications exist
    if (data.medications && !data.medications.error) {
      expect(JSON.stringify(data.medications).length).toBeGreaterThan(10);
    }

    // Spot-check allergies exist
    if (data.allergies && !data.allergies.error) {
      expect(JSON.stringify(data.allergies).length).toBeGreaterThan(10);
    }

    // Spot-check health summary exists
    if (data.healthSummary && !data.healthSummary.error) {
      expect(JSON.stringify(data.healthSummary).length).toBeGreaterThan(10);
    }
  }, 120_000);
});

// ===================================================================
// 4b. eUnity Imaging Pipeline (CLO download → JPEG)
// ===================================================================

describe('eUnity imaging pipeline', () => {
  // Shared state across sub-tests so we only walk the SAML+AMF chain once.
  let fdiParam = '';
  let firstSeriesUID = '';
  let firstObjectUID = '';
  let allImages: Array<{ seriesUID: string; objectUID: string }> = [];
  let studyDescription = '';

  it('exposes fdiContext on scraped imaging results', async () => {
    const res = await authedFetch('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();

    const imagingResults = data.imagingResults;
    expect(Array.isArray(imagingResults)).toBe(true);
    expect(imagingResults.length).toBeGreaterThan(0);

    const withFdi = imagingResults.find(
      (r: { fdiContext?: { fdi: string; ord: string } }) => r.fdiContext?.fdi && r.fdiContext?.ord,
    );
    expect(withFdi).toBeDefined();
    expect(withFdi.fdiContext.fdi).toBeTruthy();
    expect(withFdi.fdiContext.ord).toBeTruthy();

    fdiParam = Buffer.from(JSON.stringify(withFdi.fdiContext)).toString('base64');
    studyDescription = withFdi.orderName ?? 'xray';
  }, 120_000);

  it('initializes the eUnity session and returns series metadata', async () => {
    expect(fdiParam).toBeTruthy();
    const res = await authedFetch(
      `/api/mychart-series?token=${encodeURIComponent(sessionKey)}&fdi=${encodeURIComponent(fdiParam)}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.series)).toBe(true);
    expect(body.series.length).toBeGreaterThan(0);

    const firstSeries = body.series[0];
    expect(firstSeries.seriesUID).toBeTruthy();
    expect(firstSeries.description).toBeTruthy();
    expect(Array.isArray(firstSeries.images)).toBe(true);
    expect(firstSeries.images.length).toBeGreaterThan(0);

    firstSeriesUID = firstSeries.images[0].seriesUID;
    firstObjectUID = firstSeries.images[0].objectUID;

    // Flatten all images across all series for the ZIP test below.
    allImages = body.series.flatMap(
      (s: { images: Array<{ seriesUID: string; objectUID: string }> }) => s.images,
    );
  }, 60_000);

  it('downloads a single CLO image and converts it to JPEG', async () => {
    expect(firstSeriesUID).toBeTruthy();
    expect(firstObjectUID).toBeTruthy();

    const url =
      `/api/mychart-xray?token=${encodeURIComponent(sessionKey)}` +
      `&fdi=${encodeURIComponent(fdiParam)}` +
      `&seriesUID=${encodeURIComponent(firstSeriesUID)}` +
      `&objectUID=${encodeURIComponent(firstObjectUID)}`;
    const res = await authedFetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/jpeg');

    const jpeg = Buffer.from(await res.arrayBuffer());
    // JPEG magic bytes (SOI: FF D8, end: FF D9)
    expect(jpeg.byteLength).toBeGreaterThan(1000);
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    expect(jpeg[jpeg.byteLength - 2]).toBe(0xff);
    expect(jpeg[jpeg.byteLength - 1]).toBe(0xd9);
  }, 60_000);

  it('bundles all images from the study into a ZIP', async () => {
    expect(allImages.length).toBeGreaterThan(0);
    const imagesJson = encodeURIComponent(JSON.stringify(allImages));
    const desc = encodeURIComponent(studyDescription);
    const url =
      `/api/mychart-xray-zip?token=${encodeURIComponent(sessionKey)}` +
      `&fdi=${encodeURIComponent(fdiParam)}&images=${imagesJson}&description=${desc}`;
    const res = await authedFetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/zip');

    const zip = Buffer.from(await res.arrayBuffer());
    // ZIP local file header magic: 50 4B 03 04
    expect(zip.byteLength).toBeGreaterThan(100);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
  }, 120_000);

  it('rejects xray requests with an unknown session token', async () => {
    // Use placeholder UIDs so the auth check fires before the param check.
    const url =
      '/api/mychart-xray?token=bogus-token&fdi=eyJmZGkiOiJ4In0=' +
      '&seriesUID=placeholder&objectUID=placeholder';
    const res = await authedFetch(url);
    expect(res.status).toBe(401);
  });
});

// ===================================================================
// 4c. eUnity scraper end-to-end (login → SAML → AMF → CLO → JPEG)
// ===================================================================
//
// Exercises the actual scraper code (not the web app routes) against
// fake-mychart, then runs the downloaded CLO bytes through the
// CLO-to-JPEG converter to validate the entire imaging pipeline.

describe('eUnity scraper end-to-end', () => {
  it('downloads the X-ray study via downloadImagingStudyDirect and converts to JPEG', async () => {
    const loginResult = await myChartUserPassLogin({
      hostname: FAKE_MYCHART_HOST_URL,
      user: 'homer',
      pass: 'donuts123',
      protocol: 'http',
    });
    expect(loginResult.state).toBe('logged_in');
    if (loginResult.state !== 'logged_in') return;

    const imagingResults = await getImagingResults(loginResult.mychartRequest);
    const xray = imagingResults.find(r => r.fdiContext && r.orderName?.includes('XR'));
    expect(xray).toBeDefined();
    expect(xray!.fdiContext!.fdi).toBe('FDI-XRAY-001');

    const downloadResult = await downloadImagingStudyDirect(
      loginResult.mychartRequest,
      xray!.fdiContext!,
      'Homer Skull XRay',
      '/tmp/ci-xray-images',
      { skipFileWrite: true },
    );

    expect(downloadResult.errors).toHaveLength(0);
    expect(downloadResult.images.length).toBeGreaterThan(0);

    const firstImage = downloadResult.images[0];
    expect(firstImage.format).toBe('CLHAAR');
    expect(firstImage.pixelData).toBeDefined();
    expect(firstImage.pixelData!.length).toBeGreaterThan(0);
    expect(firstImage.wrapperData).toBeDefined();

    // Round-trip the CLO bytes through the parser to a real JPEG.
    const jpeg = await convertCloToJpg({
      pixelData: firstImage.pixelData!,
      wrapperData: firstImage.wrapperData!,
    });
    expect(Buffer.isBuffer(jpeg)).toBe(true);
    const buf = jpeg as Buffer;
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf[0]).toBe(0xff);
    expect(buf[1]).toBe(0xd8);
    expect(buf[buf.byteLength - 2]).toBe(0xff);
    expect(buf[buf.byteLength - 1]).toBe(0xd9);
  }, 120_000);

  it('downloads the multi-slice CT study via downloadImagingStudyDirect', async () => {
    const loginResult = await myChartUserPassLogin({
      hostname: FAKE_MYCHART_HOST_URL,
      user: 'homer',
      pass: 'donuts123',
      protocol: 'http',
    });
    expect(loginResult.state).toBe('logged_in');
    if (loginResult.state !== 'logged_in') return;

    const imagingResults = await getImagingResults(loginResult.mychartRequest);
    const ct = imagingResults.find(r => r.fdiContext && r.orderName?.includes('CT'));
    expect(ct).toBeDefined();
    expect(ct!.fdiContext!.fdi).toBe('FDI-CT-001');

    const downloadResult = await downloadImagingStudyDirect(
      loginResult.mychartRequest,
      ct!.fdiContext!,
      'Homer CT Head',
      '/tmp/ci-ct-images',
      { skipFileWrite: true },
    );

    expect(downloadResult.errors).toHaveLength(0);
    expect(downloadResult.images.length).toBeGreaterThan(2);
    expect(downloadResult.seriesList).toBeDefined();
    expect(downloadResult.seriesList!.length).toBeGreaterThanOrEqual(2);
    for (const img of downloadResult.images) {
      expect(img.format).toBe('CLHAAR');
      expect(img.pixelData!.length).toBeGreaterThan(0);
    }
  }, 120_000);
});

// ===================================================================
// 4d. Messaging — list recipients + send to billing department
// ===================================================================
//
// Confirms the web app surfaces non-provider recipients (departments
// like billing, customer service) returned by GetMedicalAdviceRequestRecipients
// and that sending a message to one of them flows end-to-end and appears
// in the conversations list on the next scrape.

describe('Messaging recipients and send-to-billing', () => {
  let billingRecipient: { displayName: string; recipientType: number } | undefined;
  let billingTopic: { displayName: string; value: string } | undefined;

  it('includes both providers and department recipients (Billing, Customer Service)', async () => {
    const res = await authedFetch('/api/messages/recipients', {
      method: 'POST',
      body: JSON.stringify({ token: sessionKey }),
    });
    expect(res.status).toBe(200);
    const { recipients, topics } = await res.json();

    expect(Array.isArray(recipients)).toBe(true);
    expect(Array.isArray(topics)).toBe(true);

    // Should have at least one provider (recipientType 1) and at least one
    // department/pool (recipientType 6, e.g. Billing).
    const providers = recipients.filter((r: { recipientType: number }) => r.recipientType === 1);
    const departments = recipients.filter((r: { recipientType: number }) => r.recipientType === 6);
    expect(providers.length).toBeGreaterThan(0);
    expect(departments.length).toBeGreaterThan(0);

    billingRecipient = recipients.find(
      (r: { displayName: string }) => r.displayName.toLowerCase().includes('billing'),
    );
    expect(billingRecipient).toBeDefined();

    billingTopic = topics.find(
      (t: { displayName: string }) => t.displayName.toLowerCase().includes('billing'),
    );
    expect(billingTopic).toBeDefined();
  });

  it('sends a message to the billing department and gets a conversation ID back', async () => {
    expect(billingRecipient).toBeDefined();
    expect(billingTopic).toBeDefined();

    const res = await authedFetch('/api/messages/send-new', {
      method: 'POST',
      body: JSON.stringify({
        token: sessionKey,
        recipient: billingRecipient,
        topic: billingTopic,
        subject: 'Question about my statement',
        messageBody: 'Hi, I have a question about a charge on my last statement.',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.conversationId).toBe('string');
    expect(body.conversationId.length).toBeGreaterThan(0);
  });

  it('shows the new billing conversation in the next messages scrape', async () => {
    const res = await authedFetch('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const blob = JSON.stringify(data.messages ?? []);
    expect(blob).toContain('Question about my statement');
    expect(blob).toContain('Billing Department');
  }, 60_000);
});

// ===================================================================
// 5. MCP API Key Lifecycle
// ===================================================================

describe('MCP API key lifecycle', () => {
  it('has no API key initially', async () => {
    const res = await authedFetch('/api/mcp-key');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasKey).toBe(false);
  });

  it('generates an API key', async () => {
    const res = await authedFetch('/api/mcp-key', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBeDefined();
    expect(body.key.length).toBeGreaterThan(10);
  });

  it('reports hasKey after generation', async () => {
    const res = await authedFetch('/api/mcp-key');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasKey).toBe(true);
  });

  it('authenticates MCP via Authorization: Bearer header', async () => {
    const keyRes = await authedFetch('/api/mcp-key', { method: 'POST' });
    expect(keyRes.status).toBe(200);
    const { key } = await keyRes.json();

    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).not.toBe(401);
    const body = await res.text();
    expect(body).not.toContain('Missing or invalid API key');
  });

  it('rejects MCP request with no key in query or header', async () => {
    const res = await fetch(`${BASE_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authorization: Bearer');
  });

  it('revokes the API key', async () => {
    const res = await authedFetch('/api/mcp-key', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('reports no key after revocation', async () => {
    const res = await authedFetch('/api/mcp-key');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasKey).toBe(false);
  });
});

// ===================================================================
// 6. Notification Preferences
// ===================================================================

describe('Notification preferences', () => {
  it('gets default preferences', async () => {
    const res = await authedFetch('/api/notifications/preferences');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
    expect(typeof body.includeContent).toBe('boolean');
  });

  it('enables notifications with content', async () => {
    const res = await authedFetch('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ enabled: true, includeContent: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.includeContent).toBe(true);
  });

  it('verifies updated preferences', async () => {
    const res = await authedFetch('/api/notifications/preferences');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.includeContent).toBe(true);
  });

  it('disables notifications', async () => {
    const res = await authedFetch('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ enabled: false, includeContent: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.includeContent).toBe(false);
  });
});

// ===================================================================
// 7. App-Level TOTP 2FA
// ===================================================================

describe('App-level TOTP 2FA', () => {
  const TFA_EMAIL = `ci-2fa-${Date.now()}@example.com`;
  const TFA_PASSWORD = 'TwoFactor123!';
  let tfaCookies = '';

  /** Merge Set-Cookie headers into tfaCookies (don't replace, merge). */
  function mergeTfaCookies(res: Response) {
    const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
    const existing = parseCookieString(tfaCookies);
    for (const header of setCookieHeaders) {
      const nameValue = header.split(';')[0];
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx > 0) {
        existing[nameValue.slice(0, eqIdx).trim()] = nameValue.slice(eqIdx + 1).trim();
      }
    }
    tfaCookies = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  it('creates a dedicated user for 2FA testing', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: TFA_EMAIL, password: TFA_PASSWORD, name: '2FA Test' }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    mergeTfaCookies(res);
    expect(tfaCookies).toContain('better-auth.session_token');
  });

  it('enables TOTP 2FA and returns URI + backup codes', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/two-factor/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: tfaCookies, Origin: BASE_URL },
      body: JSON.stringify({ password: TFA_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    mergeTfaCookies(res);

    const body = await res.json();
    expect(body.totpURI).toBeDefined();
    expect(body.totpURI).toContain('otpauth://totp/');
    expect(body.backupCodes).toBeDefined();
    expect(Array.isArray(body.backupCodes)).toBe(true);
    expect(body.backupCodes.length).toBeGreaterThan(0);

    // Verify the TOTP URI has the expected structure
    const parsed = parseTotpUri(body.totpURI);
    expect(parsed.secret).toBeTruthy();
    expect(parsed.issuer).toBeTruthy();
  });

  it('disables TOTP 2FA', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/two-factor/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: tfaCookies, Origin: BASE_URL },
      body: JSON.stringify({ password: TFA_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
  });

  it('sign-in works normally after disabling 2FA', async () => {
    // Sign out
    await fetch(`${BASE_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: tfaCookies, Origin: BASE_URL },
      body: JSON.stringify({}),
      redirect: 'manual',
    });

    // Sign in — should NOT require 2FA
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: TFA_EMAIL, password: TFA_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.twoFactorRedirect).toBeFalsy();
    expect(body.user).toBeDefined();
  });
});

// ===================================================================
// 8. Password Reset
// ===================================================================

describe('Password reset', () => {
  const RESET_EMAIL = `ci-reset-${Date.now()}@example.com`;
  const RESET_PASSWORD = 'ResetMe123!';
  const NEW_PASSWORD = 'NewPassword456!';

  const CI_DB_URL = process.env.CI_DATABASE_URL || 'postgresql://testuser:testpass@localhost:5433/mychart_test';

  /** Query the verification table to extract the reset token (bypasses email). */
  async function getResetToken(email: string): Promise<string> {
    const client = new Client({ connectionString: CI_DB_URL });
    await client.connect();
    try {
      // BetterAuth stores verification tokens with identifier "reset-password:<token>"
      // and value = userId. We need to find the user first, then look up their token.
      const userResult = await client.query(
        'SELECT id FROM "user" WHERE email = $1',
        [email],
      );
      const userId = userResult.rows[0]?.id;
      if (!userId) throw new Error(`No user found with email ${email}`);

      const tokenResult = await client.query(
        `SELECT identifier FROM verification WHERE value = $1 AND identifier LIKE 'reset-password:%' ORDER BY "expiresAt" DESC LIMIT 1`,
        [userId],
      );
      const identifier = tokenResult.rows[0]?.identifier;
      if (!identifier) throw new Error('No reset token found in verification table');

      // identifier is "reset-password:<token>", extract the token
      return identifier.replace('reset-password:', '');
    } finally {
      await client.end();
    }
  }

  it('creates a dedicated user for password reset testing', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: RESET_EMAIL, password: RESET_PASSWORD, name: 'Reset Test' }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(RESET_EMAIL);
  });

  it('requests a password reset', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: RESET_EMAIL, redirectTo: '/reset-password' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(true);
  });

  it('returns success even for non-existent email (no user enumeration)', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: 'nonexistent@example.com', redirectTo: '/reset-password' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(true);
  });

  it('resets the password with a valid token', async () => {
    const token = await getResetToken(RESET_EMAIL);
    expect(token).toBeTruthy();

    const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ newPassword: NEW_PASSWORD, token }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(true);
  });

  it('can sign in with the new password', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: RESET_EMAIL, password: NEW_PASSWORD }),
      redirect: 'manual',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(RESET_EMAIL);
  });

  it('cannot sign in with the old password', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: RESET_EMAIL, password: RESET_PASSWORD }),
      redirect: 'manual',
    });
    // BetterAuth returns 401 or error for invalid credentials
    const body = await res.json();
    expect(body.user).toBeUndefined();
  });

  it('rejects an already-used token', async () => {
    // The token was consumed in the reset step above
    const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ newPassword: 'AnotherPassword789!', token: 'already-consumed-token' }),
    });
    // Should fail with 400 (invalid token)
    expect(res.status).toBe(400);
  });

  it('rejects reset without a token', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ newPassword: 'SomePassword123!' }),
    });
    expect(res.status).toBe(400);
  });
});

// ===================================================================
// 9. Instance Enabled/Disabled Toggle
// ===================================================================

describe('Instance enabled/disabled toggle', () => {
  it('instance is enabled by default', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
  });

  it('can disable an instance via PATCH', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });

  it('disabled instance appears in list with enabled=false', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    const inst = body.find((i: { id: string }) => i.id === instanceId);
    expect(inst).toBeDefined();
    expect(inst.enabled).toBe(false);
  });

  it('disabled instance is skipped by auto-connect on listing', async () => {
    const patchRes = await authedFetch(`/api/mychart-instances/${instanceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ totpSecret: 'JBSWY3DPEHPK3PXP' }),
    });
    expect(patchRes.status).toBe(200);

    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    const inst = body.find((i: { id: string }) => i.id === instanceId);
    expect(inst.enabled).toBe(false);
    expect(inst.hasTotpSecret).toBe(true);
  });

  it('MCP returns error when all instances are disabled', async () => {
    const keyRes = await authedFetch('/api/mcp-key', { method: 'POST' });
    expect(keyRes.status).toBe(200);
    const { key } = await keyRes.json();
    expect(key).toBeDefined();

    const mcpRes = await fetch(`${BASE_URL}/api/mcp?key=${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_profile', arguments: {} },
      }),
    });
    const mcpBody = await mcpRes.text();
    expect(mcpBody).toContain('disabled');

    await authedFetch('/api/mcp-key', { method: 'DELETE' });
  });

  it('can re-enable an instance via PATCH', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
  });

  it('re-enabled instance can connect again', async () => {
    const res = await authedFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ myChartInstanceId: instanceId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    if (body.state === 'need_2fa') {
      const twofaRes = await authedFetch('/api/twofa', {
        method: 'POST',
        body: JSON.stringify({ sessionKey: body.sessionKey, code: '123456' }),
      });
      expect(twofaRes.status).toBe(200);
      sessionKey = (await twofaRes.json()).sessionKey;
    } else {
      expect(body.state).toBe('logged_in');
      sessionKey = body.sessionKey;
    }

    const listRes = await authedFetch('/api/mychart-instances');
    const list = await listRes.json();
    const inst = list.find((i: { id: string }) => i.id === instanceId);
    expect(inst.enabled).toBe(true);
    expect(inst.connected).toBe(true);
  }, 30_000);
});

// ===================================================================
// 10. Session Expiry & Auto-Reconnect
// ===================================================================

describe('Session expiry and auto-reconnect', () => {
  const FAKE_MYCHART_TEST_URL = process.env.CI_FAKE_MYCHART_URL || 'http://localhost:4000';

  it('connects via /api/mychart-instances/:id/connect', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}/connect`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    if (body.state === 'need_2fa') {
      const twofaRes = await authedFetch('/api/twofa', {
        method: 'POST',
        body: JSON.stringify({ sessionKey: body.sessionKey, code: '123456' }),
      });
      expect(twofaRes.status).toBe(200);
      const twofaBody = await twofaRes.json();
      expect(twofaBody.state).toBe('logged_in');
      sessionKey = twofaBody.sessionKey;
    } else {
      expect(body.state).toBe('logged_in');
      sessionKey = body.sessionKey;
    }
  }, 30_000);

  it('profile fetch works with a valid session', async () => {
    const res = await authedFetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeDefined();
    expect(JSON.stringify(body)).toContain('Homer');
  });

  it('invalidates fake-mychart sessions', async () => {
    const res = await fetch(`${FAKE_MYCHART_TEST_URL}/api/invalidate-sessions`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBeGreaterThan(0);
  });

  it('profile fetch returns session_expired after invalidation', async () => {
    const res = await authedFetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });
    // Should return 401 with session_expired code
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('session_expired');
  });

  it('connect endpoint detects expired session and re-logs in', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}/connect`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    if (body.state === 'need_2fa') {
      const twofaRes = await authedFetch('/api/twofa', {
        method: 'POST',
        body: JSON.stringify({ sessionKey: body.sessionKey, code: '123456' }),
      });
      expect(twofaRes.status).toBe(200);
      const twofaBody = await twofaRes.json();
      expect(twofaBody.state).toBe('logged_in');
      sessionKey = twofaBody.sessionKey;
    } else {
      expect(body.state).toBe('logged_in');
      sessionKey = body.sessionKey;
    }
  }, 30_000);

  it('profile works again after re-connect', async () => {
    const res = await authedFetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeDefined();
    expect(JSON.stringify(body)).toContain('Homer');
  });
});

// ===================================================================
// 11. Passkey Setup & Auto-Login
// ===================================================================

describe('Passkey setup and auto-login', () => {
  const FAKE_MYCHART_TEST_URL = process.env.CI_FAKE_MYCHART_URL || 'http://localhost:4000';

  it('instance does not have passkey before setup', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPasskeyCredential).toBe(false);
  });

  it('sets up passkey on the instance', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}/setup-passkey`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  }, 30_000);

  it('instance shows hasPasskeyCredential after setup', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPasskeyCredential).toBe(true);
  });

  it('rejects duplicate passkey setup', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}/setup-passkey`, {
      method: 'POST',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already configured');
  });

  it('invalidates sessions to test passkey auto-login', async () => {
    const res = await fetch(`${FAKE_MYCHART_TEST_URL}/api/invalidate-sessions`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
  });

  it('detects expired session via profile fetch', async () => {
    // This triggers the web app to clear the stale in-memory session
    const res = await authedFetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('session_expired');
  });

  it('auto-connects via passkey after session expiry', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}/connect`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // With passkey, should be logged_in directly (no 2FA needed)
    expect(body.state).toBe('logged_in');
    sessionKey = body.sessionKey;
  }, 30_000);

  it('profile works after passkey auto-login', async () => {
    const res = await authedFetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify({ sessionKey }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeDefined();
    expect(JSON.stringify(body)).toContain('Homer');
  });

  it('removes passkey from the instance', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}/setup-passkey`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('instance shows hasPasskeyCredential false after removal', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasPasskeyCredential).toBe(false);
  });

  it('rejects removing passkey when none exists', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}/setup-passkey`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No passkey configured');
  });
});

// ===================================================================
// 12. AI Proxy
// ===================================================================

describe('AI Proxy', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await fetch(`${BASE_URL}/api/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with no messages', async () => {
    const res = await authedFetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('messages');
  });

  it('rejects messages with invalid role', async () => {
    const res = await authedFetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'system', content: 'hello' }] }),
    });
    expect(res.status).toBe(400);
  });

  it('returns current spend via GET', async () => {
    const res = await authedFetch('/api/ai');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.spentCents).toBe('number');
    expect(typeof body.limitCents).toBe('number');
    expect(typeof body.remainingCents).toBe('number');
    expect(typeof body.period).toBe('string');
    expect(body.limitCents).toBe(5000); // $50.00
  });
});

// ===================================================================
// 12.5 Hostname:username disambiguation (multi-account same host)
// ===================================================================
//
// Verifies that when a user has two MyChart accounts on the same hostname
// (e.g. proxy access for a family member), MCP tools can target a specific
// account via 'hostname:username'. fake-mychart's /Home page renders the
// logged-in user's profile, so the response distinguishes which session was
// actually hit.

describe('hostname:username disambiguation', () => {
  let margeInstanceId = '';
  let disambigApiKey = '';

  async function callMcpTool(toolName: string, args: Record<string, unknown>) {
    const res = await fetch(`${BASE_URL}/api/mcp?key=${disambigApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });
    const raw = await res.text();
    // Server may return either plain JSON or SSE. Pick the JSON payload either way.
    const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
    const json = JSON.parse(dataLine ? dataLine.slice(6) : raw);
    const content = json.result?.content?.[0]?.text ?? '';
    return { text: content, isError: !!json.result?.isError };
  }

  it('creates a second instance for marge on the same hostname', async () => {
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: FAKE_MYCHART_HOSTNAME,
        username: 'marge',
        password: 'donuts123',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    // Capture the id first so the Cleanup section can still delete the row
    // even if a later assertion in this describe block fails.
    margeInstanceId = body.id;
    expect(body.hostname).toBe(FAKE_MYCHART_HOSTNAME);
    expect(body.username).toBe('marge');
    expect(margeInstanceId).toBeTruthy();
  });

  it('connects marge via login + TOTP', async () => {
    const loginRes = await authedFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ myChartInstanceId: margeInstanceId }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.state).toBe('need_2fa');

    const twofaRes = await authedFetch('/api/twofa', {
      method: 'POST',
      body: JSON.stringify({ sessionKey: loginBody.sessionKey, code: '123456' }),
    });
    expect(twofaRes.status).toBe(200);
    const twofaBody = await twofaRes.json();
    expect(twofaBody.state).toBe('logged_in');
  }, 30_000);

  it('lists both connected instances', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    const homer = body.find((i: { username: string }) => i.username === 'homer');
    const marge = body.find((i: { username: string }) => i.username === 'marge');
    expect(homer).toBeDefined();
    expect(marge).toBeDefined();
    expect(homer.hostname).toBe(FAKE_MYCHART_HOSTNAME);
    expect(marge.hostname).toBe(FAKE_MYCHART_HOSTNAME);
    expect(homer.connected).toBe(true);
    expect(marge.connected).toBe(true);
  });

  it('generates an MCP API key', async () => {
    const res = await authedFetch('/api/mcp-key', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    disambigApiKey = body.key;
    expect(disambigApiKey).toBeTruthy();
  });

  it('list_accounts shows both accounts with usernames', async () => {
    const result = await callMcpTool('list_accounts', {});
    expect(result.isError).toBe(false);
    const accounts = JSON.parse(result.text);
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBe(2);
    const usernames = accounts.map((a: { username: string }) => a.username).sort();
    expect(usernames).toEqual(['homer', 'marge']);
    for (const a of accounts) {
      expect(a.hostname).toBe(FAKE_MYCHART_HOSTNAME);
    }
  });

  it('hostname only (no username) returns a disambiguation error', async () => {
    const result = await callMcpTool('get_profile', { instance: FAKE_MYCHART_HOSTNAME });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Multiple accounts');
    expect(result.text).toContain(`${FAKE_MYCHART_HOSTNAME}:homer`);
    expect(result.text).toContain(`${FAKE_MYCHART_HOSTNAME}:marge`);
  });

  it('hostname:homer returns Homer\'s profile', async () => {
    const result = await callMcpTool('get_profile', {
      instance: `${FAKE_MYCHART_HOSTNAME}:homer`,
    });
    expect(result.isError).toBe(false);
    const profile = JSON.parse(result.text);
    expect(profile.name).toContain('Homer');
    expect(profile.mrn).toBe('742');
  });

  it('hostname:marge returns Marge\'s profile', async () => {
    const result = await callMcpTool('get_profile', {
      instance: `${FAKE_MYCHART_HOSTNAME}:marge`,
    });
    expect(result.isError).toBe(false);
    const profile = JSON.parse(result.text);
    expect(profile.name).toContain('Marge');
    expect(profile.mrn).toBe('743');
  });

  it('hostname:unknown returns a not-found error listing available accounts', async () => {
    const result = await callMcpTool('get_profile', {
      instance: `${FAKE_MYCHART_HOSTNAME}:ghost`,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/not found|not connected/i);
    expect(result.text).toContain(`${FAKE_MYCHART_HOSTNAME}:homer`);
    expect(result.text).toContain(`${FAKE_MYCHART_HOSTNAME}:marge`);
  });

  it('revokes the API key and deletes the marge instance', async () => {
    const revokeRes = await authedFetch('/api/mcp-key', { method: 'DELETE' });
    expect(revokeRes.status).toBe(200);
    const delRes = await authedFetch(`/api/mychart-instances/${margeInstanceId}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
  });
});

// ===================================================================
// 13. Proxy (multi-patient) context
// ===================================================================

// Accounts that can see more than one patient's chart — Homer reading his
// kids' records. The scraper has three discovery paths because real instances
// don't all expose the same surface, so this section drives the fake through
// all three via its `/mode` endpoint, then exercises the same capability
// through MCP.
//
// Note what is NOT asserted here: nothing looks up a record by a hardcoded id.
// Proxy ids are opaque and differ per organization, so the tests discover them
// the way a caller has to, and return to the account holder via `self`.
//
// The discovery mode is global to the fake, so this section restores the
// default before handing off.

describe('Proxy (multi-patient) context', () => {
  const HOMER_PROXY_HOST = FAKE_MYCHART_HOST_URL;
  let proxyApiKey = '';

  async function setProxyDiscovery(proxyDiscovery: 'json' | 'html' | 'script') {
    const res = await fetch(`http://${FAKE_MYCHART_HOST_URL}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxyDiscovery }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).proxyDiscovery).toBe(proxyDiscovery);
  }

  async function loginHomer() {
    const result = await myChartUserPassLogin({
      hostname: HOMER_PROXY_HOST,
      user: 'homer',
      pass: 'donuts123',
      protocol: 'http',
    });
    expect(result.state).toBe('logged_in');
    return result.mychartRequest;
  }

  /** Find a record by the name shown in the dropdown, as a caller would. */
  function byName(targets: { displayName: string }[], name: string) {
    const match = targets.find(t => t.displayName === name);
    expect(match).toBeDefined();
    return match!;
  }

  // Each discovery shape must support the whole round trip, not just listing.
  // The script fallback in particular reports no selection flag at all, so
  // confirmation there rests on the profile identity check.
  for (const mode of ['json', 'html', 'script'] as const) {
    describe(`discovery via ${mode}`, () => {
      it(`discovers all three children and the account holder`, async () => {
        await setProxyDiscovery(mode);
        const req = await loginHomer();
        const targets = await discoverProxyTargets(req);

        expect(targets.map(t => t.displayName).sort()).toEqual([
          'Bart Simpson', 'Homer Jay Simpson', 'Lisa Simpson', 'Maggie Simpson',
        ]);

        // The account holder is identified by isSelf and carries a real opaque
        // id like every other record — it is NOT the blank one.
        const selves = targets.filter(t => t.isSelf);
        expect(selves).toHaveLength(1);
        expect(selves[0].displayName).toBe('Homer Jay Simpson');
        expect(selves[0].id).toMatch(/^WP-.{40,}$/);
        expect(targets.every(t => t.id.startsWith('WP-'))).toBe(true);

        // Only the JSON and anchor shapes can say which record is active.
        expect(targets.every(t => t.selectionKnown)).toBe(mode !== 'script');
      }, 30_000);

      it(`switches to a child, then back to the account holder`, async () => {
        await setProxyDiscovery(mode);
        const req = await loginHomer();
        const bart = byName(await discoverProxyTargets(req), 'Bart Simpson');

        const switched = await switchProxyTarget(req, { id: bart.id });
        expect(switched.target.displayName).toBe('Bart Simpson');
        // The proxy list shows a short name; the profile page carries the
        // legal name. Both refer to the same patient.
        expect(switched.verifiedProfileName).toBe('Bartholomew JoJo Simpson');
        expect(switched.verifiedDob).toBe('04/01/2014');

        // Every other scraper now reads the child's chart.
        const childProfile = await getMyChartProfile(req);
        expect(childProfile?.name).toBe('Bartholomew JoJo Simpson');
        expect(childProfile?.mrn).toBe('744');

        // Returning home must not require knowing the account holder's id.
        const back = await switchProxyTarget(req, { self: true });
        expect(back.target.isSelf).toBe(true);
        expect(back.verifiedProfileName).toBe('Homer Jay Simpson');

        const ownProfile = await getMyChartProfile(req);
        expect(ownProfile?.mrn).toBe('742');
      }, 30_000);

      it(`switches by display name`, async () => {
        await setProxyDiscovery(mode);
        const req = await loginHomer();

        const switched = await switchProxyTarget(req, { displayName: 'Lisa Simpson' });
        expect(switched.verifiedProfileName).toBe('Lisa Marie Simpson');
        expect(switched.verifiedDob).toBe('05/09/2016');
      }, 30_000);
    });
  }

  // ── Data scoping: the whole point of switching ──

  it('serves the child\'s medications, not the account holder\'s', async () => {
    await setProxyDiscovery('json');
    const req = await loginHomer();

    const homerMeds = await getMedications(req);
    const homerNames = homerMeds.medications.map(m => m.name).join(' | ');
    expect(homerNames).toContain('Duff');

    const bart = byName(await discoverProxyTargets(req), 'Bart Simpson');
    await switchProxyTarget(req, { id: bart.id });

    const bartMeds = await getMedications(req);
    const bartNames = bartMeds.medications.map(m => m.name).join(' | ');
    expect(bartNames).toContain('Albuterol');
    expect(bartMeds.patientFirstName).toBe('Bart');
    // The failure that matters: a parent's prescriptions showing up inside a
    // child's chart.
    expect(bartNames).not.toContain('Duff');
    expect(bartNames).not.toContain('Donut');
  }, 60_000);

  it('returns an empty category rather than falling back to the account holder', async () => {
    await setProxyDiscovery('json');
    const req = await loginHomer();

    const homerAllergies = await getAllergies(req);
    expect(JSON.stringify(homerAllergies)).toContain('Vegetables');

    // Lisa's record has no allergies recorded. That must read as empty, not as
    // Homer's list.
    await switchProxyTarget(req, { displayName: 'Lisa Simpson' });
    const lisaAllergies = await getAllergies(req);
    expect(JSON.stringify(lisaAllergies)).not.toContain('Vegetables');
    expect(JSON.stringify(lisaAllergies)).not.toContain('Exercise');
  }, 60_000);

  it('scopes health issues per record', async () => {
    await setProxyDiscovery('json');
    const req = await loginHomer();
    const bart = byName(await discoverProxyTargets(req), 'Bart Simpson');

    await switchProxyTarget(req, { id: bart.id });
    const bartIssues = JSON.stringify(await getHealthIssues(req));
    expect(bartIssues).toContain('Asthma');
    expect(bartIssues).not.toContain('crayon');

    await switchProxyTarget(req, { self: true });
    const homerIssues = JSON.stringify(await getHealthIssues(req));
    expect(homerIssues).toContain('crayon');
    expect(homerIssues).not.toContain('Asthma');
  }, 60_000);

  it('rejects a record this account has no access to', async () => {
    await setProxyDiscovery('json');
    const req = await loginHomer();
    await expect(switchProxyTarget(req, { id: 'WP-NOT-A-RECORD-THIS-ACCOUNT-CAN-SEE' }))
      .rejects.toThrow(/Could not resolve proxy target by id/);
  }, 30_000);

  it('reports no proxy records for an account with only its own chart', async () => {
    await setProxyDiscovery('json');
    const login = await myChartUserPassLogin({
      hostname: HOMER_PROXY_HOST,
      user: 'marge',
      pass: 'donuts123',
      protocol: 'http',
    });
    expect(login.state).toBe('need_2fa');
    const verified = await complete2faFlow({ mychartRequest: login.mychartRequest, code: '123456' });
    expect(verified.state).toBe('logged_in');

    expect(await discoverProxyTargets(login.mychartRequest)).toEqual([]);
  }, 30_000);

  // ── Through MCP ──

  async function callProxyTool(toolName: string, args: Record<string, unknown>) {
    const res = await fetch(`${BASE_URL}/api/mcp?key=${proxyApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });
    const raw = await res.text();
    const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
    const json = JSON.parse(dataLine ? dataLine.slice(6) : raw);
    return { text: json.result?.content?.[0]?.text ?? '', isError: !!json.result?.isError };
  }

  it('generates an MCP API key for the proxy tools', async () => {
    await setProxyDiscovery('json');
    const res = await authedFetch('/api/mcp-key', { method: 'POST' });
    expect(res.status).toBe(200);
    proxyApiKey = (await res.json()).key;
    expect(proxyApiKey).toBeTruthy();
  });

  it('list_proxy_targets returns the account holder and all three children', async () => {
    const result = await callProxyTool('list_proxy_targets', {});
    expect(result.isError).toBe(false);
    const targets = JSON.parse(result.text) as { id: string; displayName: string; isSelf: boolean; isActive: boolean | null }[];
    expect(targets.map(t => t.displayName).sort()).toEqual([
      'Bart Simpson', 'Homer Jay Simpson', 'Lisa Simpson', 'Maggie Simpson',
    ]);
    const self = targets.find(t => t.isSelf)!;
    expect(self.isActive).toBe(true);
    expect(self.id).toMatch(/^WP-/);
  }, 60_000);

  it('switch_proxy_target moves get_profile onto the child\'s chart', async () => {
    const listed = JSON.parse((await callProxyTool('list_proxy_targets', {})).text) as { id: string; displayName: string }[];
    const bartId = listed.find(t => t.displayName === 'Bart Simpson')!.id;

    const switched = await callProxyTool('switch_proxy_target', { id: bartId });
    expect(switched.isError).toBe(false);
    const body = JSON.parse(switched.text);
    expect(body.success).toBe(true);
    expect(body.activeRecord.displayName).toBe('Bart Simpson');
    expect(body.verifiedProfileName).toBe('Bartholomew JoJo Simpson');

    const profile = await callProxyTool('get_profile', {});
    expect(profile.isError).toBe(false);
    expect(JSON.parse(profile.text).mrn).toBe('744');

    // And the child's medications, not Homer's.
    const meds = await callProxyTool('get_medications', {});
    expect(meds.text).toContain('Albuterol');
    expect(meds.text).not.toContain('Duff');
  }, 60_000);

  it('switch_proxy_target with self=true returns to the account holder', async () => {
    const back = await callProxyTool('switch_proxy_target', { self: true });
    expect(back.isError).toBe(false);
    expect(JSON.parse(back.text).activeRecord.isSelf).toBe(true);

    const profile = await callProxyTool('get_profile', {});
    expect(JSON.parse(profile.text).mrn).toBe('742');
  }, 60_000);

  it('switch_proxy_target without a selector is an error, not a silent no-op', async () => {
    const result = await callProxyTool('switch_proxy_target', {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Pass self=true, id or display_name');
  }, 60_000);

  it('revokes the API key and restores the default discovery mode', async () => {
    const res = await authedFetch('/api/mcp-key', { method: 'DELETE' });
    expect(res.status).toBe(200);

    await setProxyDiscovery('json');
    const modeRes = await fetch(`http://${FAKE_MYCHART_HOST_URL}/mode`);
    expect((await modeRes.json()).proxyDiscovery).toBe('json');
  });
});
// ===================================================================
// 14. Root-mounted MyChart instance (Cleveland Clinic shape)
// ===================================================================

// Every other scenario in this file runs against the fake in its default
// path-prefixed shape (`/` → `/MyChart/`), which is how most real instances
// are deployed. This section flips the same server to the other shape via its
// `/mode` endpoint: MyChart served straight from the domain root, where `/`
// redirects to `./Authentication/Login?` and the first path segment is a
// MyChart route rather than a deployment prefix.
//
// The mode is global to the fake, so this section restores the default before
// handing off to Cleanup.

describe('Root-mounted MyChart instance', () => {
  let rootInstanceId = '';
  let rootSessionKey = '';

  async function setFakeMode(mode: 'prefixed' | 'root') {
    const res = await fetch(`http://${FAKE_MYCHART_HOST_URL}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe(mode);
  }

  it('switches the fake to root-mounted and redirects with a relative controller path', async () => {
    await setFakeMode('root');
    const res = await fetch(`http://${FAKE_MYCHART_HOST_URL}/`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('./Authentication/Login?');
  });

  it('creates an instance against the now root-mounted host', async () => {
    // Same hostname as the main instance but a different MyChart user, so the
    // duplicate-instance guard (hostname + username) doesn't reject it.
    const res = await authedFetch('/api/mychart-instances', {
      method: 'POST',
      body: JSON.stringify({
        hostname: FAKE_MYCHART_HOSTNAME,
        username: 'marge',
        password: 'donuts123',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.hostname).toBe(FAKE_MYCHART_HOSTNAME);
    rootInstanceId = body.id;
  });

  it('connects (login) without mistaking the route for a path prefix', async () => {
    const res = await authedFetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ myChartInstanceId: rootInstanceId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    if (body.state === 'need_2fa') {
      const twofaRes = await authedFetch('/api/twofa', {
        method: 'POST',
        body: JSON.stringify({ sessionKey: body.sessionKey, code: '123456' }),
      });
      expect(twofaRes.status).toBe(200);
      const twofaBody = await twofaRes.json();
      expect(twofaBody.state).toBe('logged_in');
      rootSessionKey = twofaBody.sessionKey;
    } else {
      expect(body.state).toBe('logged_in');
      rootSessionKey = body.sessionKey;
    }

    expect(rootSessionKey).toBeTruthy();
  }, 30_000);

  it('scrapes real data through the root mount', async () => {
    const res = await authedFetch('/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ sessionKey: rootSessionKey }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    // Marge's profile, proving we reached the right session — and that the
    // mount shape makes no difference to what comes back.
    expect(data.profile?.name).toBe('Marge Bouvier Simpson');
    expect(data.medications?.medications?.length).toBeGreaterThan(0);
    expect(data.allergies).toBeDefined();
    expect(data.allergies.error).toBeUndefined();
    expect(JSON.stringify(data.allergies).length).toBeGreaterThan(10);
  }, 120_000);

  it('logs in at the scraper level with a null firstPathPart', async () => {
    const result = await myChartUserPassLogin({
      hostname: FAKE_MYCHART_HOST_URL,
      user: 'homer',
      pass: 'donuts123',
      protocol: 'http',
    });

    expect(result.state).toBe('logged_in');
    expect(result.mychartRequest.firstPathPart).toBeNull();
  }, 30_000);

  it('deletes the instance and restores the default mount mode', async () => {
    const res = await authedFetch(`/api/mychart-instances/${rootInstanceId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    await setFakeMode('prefixed');
    const rootRes = await fetch(`http://${FAKE_MYCHART_HOST_URL}/`, { redirect: 'manual' });
    expect(rootRes.headers.get('location')).toContain('/MyChart/');
  });
});

// ===================================================================
// 15. Cleanup
// ===================================================================

describe('Cleanup', () => {
  it('deletes the MyChart instance', async () => {
    expect(instanceId).toBeTruthy();
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('instance list is empty after deletion', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('deleted instance returns 404', async () => {
    const res = await authedFetch(`/api/mychart-instances/${instanceId}`);
    expect(res.status).toBe(404);
  });
});
