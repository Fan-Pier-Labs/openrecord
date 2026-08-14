/**
 * Fake eUnity imaging server routes.
 *
 * Handles: SAML chain (STS → ACS → viewer), AMF session init, image download.
 * All served from localhost:4000/e/* so the scraper sees a single-origin eUnity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { deflateSync } from 'zlib';
import * as homer from '@/data/homer';
import { Amf3Writer } from '@shared/amf3Writer';
import { buildCloWrapper } from '@/lib/cloWrapper';

// ─── In-memory eUnity sessions ──────────────────────────────────────
const eunitySessions = new Map<string, { initialized: boolean; ts: number; studyType: string }>();

function generateJsessionId(): string {
  return 'FAKE_JSESSIONID_' + Math.random().toString(36).substring(2, 18).toUpperCase();
}

function getJsessionFromCookie(request: NextRequest): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.match(/JSESSIONID=([^;]+)/);
  return match?.[1] ?? null;
}

/**
 * Build the externally-reachable origin from the request's Host header.
 * Next.js normalizes `request.url` to the bind address (localhost), so we
 * can't use it for URLs returned to clients on a different network (e.g.
 * `fake-mychart:3000` inside Docker, or `localhost:4000` on the host).
 */
function externalOrigin(request: NextRequest): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const hostHeader = request.headers.get('host');
  // Prefer x-forwarded-host, then the Host header, ignoring localhost/bind
  // values that sneak in when Next.js serves behind a load balancer.
  const isLocalHost = (h: string | null) =>
    !!h && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(h);
  const pickedHost =
    forwardedHost ||
    (hostHeader && !isLocalHost(hostHeader) ? hostHeader : null) ||
    url.host;
  // Force https only for real external hostnames (must contain a dot and
  // not be localhost). Docker service names like "fake-mychart:3000" have
  // no dot and only serve http, so they must stay http.
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const hostName = pickedHost.split(':')[0] ?? pickedHost;
  const isExternal = !isLocalHost(pickedHost) && hostName.includes('.');
  const proto = isExternal
    ? 'https'
    : forwardedProto ?? url.protocol.replace(':', '');
  return `${proto}://${pickedHost}`;
}

// ─── Helpers ────────────────────────────────────────────────────────
function html(body: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders },
  });
}

function binary(data: Buffer, extraHeaders: Record<string, string> = {}) {
  return new Response(data as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/octet-stream', ...extraHeaders },
  });
}

// ─── AMF3 Response Builder ──────────────────────────────────────────

interface StudyData {
  studyUID: string;
  accessionNumber?: string;
  serviceInstance?: string;
  series: Array<{
    seriesUID: string;
    seriesDescription: string;
    instanceUIDs?: string[];
    instanceUID?: string;
  }>;
}

/**
 * Build the getStudyListMeta response exactly as observed on a real eUnity
 * instance (Mass General Brigham): AmfServicesMessage{messageType, messageID,
 * body} → AmfServicesResponse{code, response} → StudyListResponse, an
 * *externalizable* whose custom body is a 4-byte big-endian format header
 * (2), a DataRequestStatus value, a version string ("1.0.0"), a second
 * big-endian word (0xEB), then an anonymous payload object whose studyList
 * ArrayCollection holds Study → series ArrayCollection → Series → images
 * ArrayCollection → Image typed objects. Each Series carries a
 * frameOfReferenceUID — real responses do, and it's exactly the UID the old
 * positional parser used to mistake for the series UID.
 */
function buildAmfResponse(study: StudyData): Buffer {
  const w = new Amf3Writer();

  const writeImage = (uid: string, instanceNumber: number, frameOfReferenceUID: string) => (w: Amf3Writer) =>
    w.writeTypedObject(
      'com.clientoutlook.data.Image',
      ['uid', 'instanceNumber', 'rows', 'columns', 'sopClassUID', 'frameOfReferenceUID', 'numberOfFrames'],
      [
        (w) => w.writeString(uid),
        (w) => w.writeInteger(instanceNumber),
        (w) => w.writeInteger(512),
        (w) => w.writeInteger(512),
        (w) => w.writeString('1.2.840.10008.5.1.4.1.1.4'),
        (w) => w.writeString(frameOfReferenceUID),
        (w) => w.writeInteger(1),
      ],
    );

  const writeSeries = (s: StudyData['series'][0], index: number) => (w: Amf3Writer) => {
    const instances = s.instanceUIDs ?? (s.instanceUID ? [s.instanceUID] : []);
    // Same UID root style real instances use for a frame of reference
    const frameOfReferenceUID = `${study.studyUID}.2.${index + 1}.0.0.0`;
    w.writeTypedObject(
      'com.clientoutlook.data.Series',
      ['uid', 'description', 'modality', 'sopClassUID', 'seriesNumber', 'frameOfReferenceUID', 'nonImages', 'images'],
      [
        (w) => w.writeString(s.seriesUID),
        (w) => w.writeString(s.seriesDescription),
        (w) => w.writeString('CR'),
        (w) => w.writeString('1.2.840.10008.5.1.4.1.1.4'),
        (w) => w.writeInteger(index + 1),
        (w) => w.writeString(frameOfReferenceUID),
        (w) => w.writeArrayCollection([]),
        (w) => w.writeArrayCollection(instances.map((uid, i) => writeImage(uid, i + 1, frameOfReferenceUID))),
      ],
    );
  };

  const totalInstances = study.series.reduce(
    (sum, s) => sum + (s.instanceUIDs?.length ?? (s.instanceUID ? 1 : 0)),
    0,
  );

  w.writeTypedObject(
    'com.clientoutlook.web.metaservices.AmfServicesMessage',
    ['messageType', 'messageID', 'body'],
    [
      (w) => w.writeString('response'),
      (w) => w.writeString('HTTPSimpleLoader_1'),
      (w) =>
        w.writeTypedObject('com.clientoutlook.web.metaservices.AmfServicesResponse', ['code', 'response'], [
          (w) => w.writeInteger(0),
          (w) =>
            w.writeExternalizableObject('com.clientoutlook.web.metaservices.StudyListResponse', (w) => {
              w.writeBE32(2);
              w.writeTypedObject(
                'com.clientoutlook.data.DataRequestStatus',
                ['requestDebugDetails', 'requestDetails', 'localeDetailKey', 'retryOnError', 'localeDetailParams', 'localeDebugKey', 'statusCode', 'localeDebugParams'],
                [
                  (w) => w.writeString(''),
                  (w) => w.writeString(''),
                  (w) => w.writeNull(),
                  (w) => w.writeFalse(),
                  (w) => w.writeNull(),
                  (w) => w.writeNull(),
                  (w) => w.writeInteger(0),
                  (w) => w.writeNull(),
                ],
              );
              w.writeString('1.0.0');
              w.writeBE32(0xeb);
              w.writeTypedObject(
                '',
                ['studySelectors', 'seriesSelectors', 'studyList', 'hangingProtocols', 'relevantStudyList'],
                [
                  (w) => w.writeArrayCollection([]),
                  (w) => w.writeArrayCollection([]),
                  (w) =>
                    w.writeArrayCollection([
                      (w) =>
                        w.writeTypedObject(
                          'com.clientoutlook.data.Study',
                          ['description', 'numberOfStudyRelatedSeries', 'accessionNumber', 'numberOfStudyRelatedInstances', 'uid', 'serviceInstance', 'series'],
                          [
                            (w) => w.writeString('IMAGING STUDY'),
                            (w) => w.writeInteger(study.series.length),
                            (w) => w.writeString(study.accessionNumber ?? ''),
                            (w) => w.writeInteger(totalInstances),
                            (w) => w.writeString(study.studyUID),
                            (w) => w.writeString(study.serviceInstance ?? ''),
                            (w) => w.writeArrayCollection(study.series.map(writeSeries)),
                          ],
                        ),
                    ]),
                  (w) => w.writeArrayCollection([]),
                  (w) => w.writeArrayCollection([]),
                ],
              );
            }),
        ]),
    ],
  );

  return w.toBuffer();
}


// ─── Real CLO Image Data ─────────────────────────────────────────────
// Pre-generated images for Homer's skull X-rays and CT scan.
// Each series maps to a different CLO image file.
const CLO_DATA_DIR = join(process.cwd(), 'src/data/clo-images');

// Per-series CLO data keyed by seriesUID
const seriesCloData = new Map<string, { wrapper: Buffer; pixel: Buffer }>();

// Per-instance CLOWRAPPER payloads, keyed by `${seriesUID}\n${objectUID}`.
// Real eUnity servers answer CLOWRAPPER per *instance*: for cross-sectional
// series each slice's wrapper carries its own patient position, which is the
// only way clients can put parallel-downloaded slices back in anatomical
// order. Series without slicePositions keep one shared wrapper.
const instanceCloWrappers = new Map<string, Buffer>();

// Series that answer every image request with a CLOERROR payload — eUnity's
// pseudo-series (e.g. the viewer's "SeriesSelector" entries), which appear in
// the AMF study metadata like real series but carry no pixel data.
const cloErrorSeriesUIDs = new Set<string>();

interface CloSeries {
  seriesUID: string;
  instanceUID?: string;
  instanceUIDs?: string[];
  cloError?: boolean;
  cloPrefix?: string;
  slicePositions?: Array<{ x: number; y: number; z: number }>;
  /** Emit the byte-array VOI LUT, -1 ImagePhaseInfo sentinels and overlays. */
  richWrapperMetadata?: boolean;
}

const cloStudies: Array<{ studyUID: string; series: CloSeries[] }> = [homer.imaging, homer.ctImaging];
for (const study of cloStudies) {
  study.series.forEach((s, index) => {
    if (s.cloError) {
      cloErrorSeriesUIDs.add(s.seriesUID);
      return;
    }
    const prefix = s.cloPrefix ?? 'checkerboard_512x512';
    const wrapperBuf = readFileSync(join(CLO_DATA_DIR, `${prefix}_wrapper.clo`));
    const pixelBuf = readFileSync(join(CLO_DATA_DIR, `${prefix}_pixel.clo`));
    seriesCloData.set(s.seriesUID, {
      wrapper: Buffer.concat([wrapperBuf, pixelBuf]),
      pixel: pixelBuf,
    });
    if (s.slicePositions) {
      // Must match buildAmfResponse's per-series frameOfReferenceUID formula.
      const frameOfReferenceUID = `${study.studyUID}.2.${index + 1}.0.0.0`;
      (s.instanceUIDs ?? []).forEach((objectUID, i) => {
        const positionPatient = s.slicePositions![i];
        if (!positionPatient) return;
        instanceCloWrappers.set(
          `${s.seriesUID}\n${objectUID}`,
          Buffer.concat([
            buildCloWrapper({
              positionPatient,
              frameOfReferenceUID,
              includeRichMetadata: s.richWrapperMetadata,
            }),
            pixelBuf,
          ]),
        );
      });
    }
  });
}

/**
 * The payload a real eUnity server returns for a pseudo-instance: HTTP 200,
 * `Content-Type: application/cloerror`, 226 bytes — an ASCII `CLOERROR#Z##`
 * magic, a 4-byte length, a zlib-deflated error message, zero-padded.
 * Observed on a real instance; the scrapers detect it by the magic prefix
 * (and by the body being under 256 bytes), never by parsing the message.
 */
function buildCloErrorPayload(): Buffer {
  const magic = Buffer.from('CLOERROR#Z##');
  const message = deflateSync(Buffer.from('The requested object has no image data on this service instance.'));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(message.length);
  const body = Buffer.concat([magic, length, message]);
  // Real payloads are 226 bytes; pad (or in the unlikely case, trim) to match.
  if (body.length >= 226) return body.subarray(0, 226);
  return Buffer.concat([body, Buffer.alloc(226 - body.length)]);
}
const CLO_ERROR_PAYLOAD = buildCloErrorPayload();

// Fallback to first X-ray series for unmatched requests (seeded fixture data,
// always present)
const defaultSeries = homer.imaging.series[0]!;
const defaultClo = seriesCloData.get(defaultSeries.seriesUID)!;

// ─── Route handler ──────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const joined = path.join('/');
  const lower = joined.toLowerCase();

  // ── SAML STS page ─────────────────────────────────────────────
  if (lower === 'saml-sts' || lower.startsWith('saml-sts?')) {
    const url = new URL(request.url);
    const studyType = url.searchParams.get('study') ?? 'xray';
    // Return HTML with auto-submit form. Use a same-origin relative
    // action so it works no matter which hostname the client hit us on.
    return html(`<!DOCTYPE html>
<html><head><title>SAML STS</title></head><body>
<form method="POST" action="/e/saml-acs?study=${studyType}">
  <input type="hidden" name="SAMLResponse" value="fake-saml-response-token" />
  <input type="hidden" name="RelayState" value="fake-relay-state" />
  <noscript><button type="submit">Continue</button></noscript>
</form>
<script>document.forms[0].submit();</script>
</body></html>`);
  }

  // ── eUnity Viewer ─────────────────────────────────────────────
  if (lower.startsWith('viewer')) {
    const jsessionId = generateJsessionId();
    // Determine study type from the accession in the URL params
    const url = new URL(request.url);
    const accParam = url.searchParams.get('arg') ?? '';
    const studyType = accParam.includes(homer.ctImaging.accessionNumber) ? 'ct' : 'xray';
    eunitySessions.set(jsessionId, { initialized: false, ts: Date.now(), studyType });

    const img = studyType === 'ct' ? homer.ctImaging : homer.imaging;
    // The scraper extracts study params from viewer HTML body
    const viewerHtml = `<!DOCTYPE html>
<html><head><title>eUnity Viewer</title></head><body>
<div id="viewer-config" style="display:none">
{"accessionNumber":"${img.accessionNumber}","serviceInstance":"${img.serviceInstance}","patientId":"${img.patientId}","studyUID":"${img.studyUID}"}
</div>
<canvas id="mdiStage" width="1440" height="1644"></canvas>
</body></html>`;

    return html(viewerHtml, 200, {
      'Set-Cookie': `JSESSIONID=${jsessionId}; Path=/e; HttpOnly`,
    });
  }

  return new NextResponse('Not found', { status: 404 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const joined = path.join('/');
  const lower = joined.toLowerCase();

  // ── SAML ACS (Assertion Consumer Service) ─────────────────────
  if (lower === 'saml-acs' || lower.startsWith('saml-acs?')) {
    const origin = externalOrigin(request);
    const url = new URL(request.url);
    const studyType = url.searchParams.get('study') ?? 'xray';
    // Redirect to eUnity viewer with study params
    const img = studyType === 'ct' ? homer.ctImaging : homer.imaging;
    const viewerUrl = `${origin}/e/viewer?CLOAccessKeyID=fake-access-key&arg=accession%3D${img.accessionNumber}%26serviceInstance%3D${img.serviceInstance}%26patientId%3D${encodeURIComponent(img.patientId)}`;
    return NextResponse.redirect(viewerUrl, 302);
  }

  // ── AmfServicesServlet ────────────────────────────────────────
  if (lower === 'amfservicesservlet') {
    const jsessionId = getJsessionFromCookie(request);
    if (!jsessionId || !eunitySessions.has(jsessionId)) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    // Determine which study to serve based on the session
    const sessionData = eunitySessions.get(jsessionId)!;
    const studyType = sessionData.studyType ?? 'xray';
    const study = studyType === 'ct' ? homer.ctImaging : homer.imaging;

    // Mark session as initialized (required before CustomImageServlet works)
    eunitySessions.set(jsessionId, { ...sessionData, initialized: true, ts: Date.now() });

    const amfResponse = buildAmfResponse(study);
    return binary(amfResponse);
  }

  // ── CustomImageServlet ────────────────────────────────────────
  if (lower === 'customimageservlet') {
    const jsessionId = getJsessionFromCookie(request);
    if (!jsessionId || !eunitySessions.has(jsessionId)) {
      return new NextResponse('Unauthorized', { status: 403 });
    }

    const session = eunitySessions.get(jsessionId)!;
    if (!session.initialized) {
      return new NextResponse('Session not initialized', { status: 403 });
    }

    // Parse request body
    const body = await request.text();
    const formParams = new URLSearchParams(body);
    const requestType = formParams.get('requestType');
    const seriesUID = formParams.get('seriesUID') ?? '';
    const objectUID = formParams.get('objectUID') ?? '';

    // Pseudo-series (SeriesSelector) answer 200 + application/cloerror for
    // every request type, exactly like a real eUnity server.
    if (cloErrorSeriesUIDs.has(seriesUID)) {
      return binary(CLO_ERROR_PAYLOAD, { 'Content-Type': 'application/cloerror' });
    }

    // Look up per-series image data, fall back to default
    const clo = seriesCloData.get(seriesUID) ?? defaultClo;

    if (requestType === 'CLOWRAPPER') {
      // Multi-slice series serve a per-instance wrapper (per-slice patient
      // position); everything else keeps the shared per-series payload.
      const wrapper = instanceCloWrappers.get(`${seriesUID}\n${objectUID}`) ?? clo.wrapper;
      return binary(wrapper, { 'Content-Type': 'application/clowrapper' });
    } else if (requestType === 'CLOPIXEL') {
      return binary(clo.pixel, { 'Content-Type': 'application/clopixel' });
    } else {
      return new NextResponse('CLOERROR: unsupported request type', { status: 400 });
    }
  }

  return new NextResponse('Not found', { status: 404 });
}
