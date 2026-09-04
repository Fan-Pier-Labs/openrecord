/**
 * eUnity session bootstrap: everything that has to happen before a single
 * pixel can be fetched.
 *
 * 1. Follow the SAML chain (`imagingViewer.ts`) to get a JSESSIONID on the
 *    eUnity host
 * 2. Extract the study params (accession, serviceInstance, patientId) from the
 *    viewer URL or the viewer HTML
 * 3. Call AmfServicesServlet's getStudyListMeta to initialize the server-side
 *    session for that study — without it CustomImageServlet answers 403
 *
 * The AMF3 frames themselves are built and parsed in `amf.ts`; the images are
 * pulled in `download.ts`.
 */
import type * as tough from 'tough-cookie';
import type { MyChartRequest } from '../core/myChartRequest';
import { type FdiContext, followSamlChain, getImageViewerSamlUrl } from './imagingViewer';
import { scraperFetch } from '../../http';
import { logger } from '../../../shared/logger';
import {
  buildGetStudyListMetaRequest,
  extractServiceInstanceFromAmf,
  parseAmfResponse,
  parseStudySeries,
} from './amf';

// ─── Study Params Extraction ───

export interface EunityStudyParams {
  accession: string;
  serviceInstance: string;
  patientId: string;
}

/**
 * Extract study parameters from the eUnity viewer URL and/or page HTML body.
 *
 * The viewer URL may contain study params as query parameters, or the `arg`
 * parameter may be an encrypted blob (Example Health System). In the encrypted case, the
 * params are embedded in the viewer HTML as a JSON config object:
 *   "accessionNumber":"E48330984"
 *   "serviceInstance":"EXAMPLEstudystrategy"
 *   "patientId":"<MRN>$$$<site>"
 *
 * Known URL formats:
 * - Encrypted arg: <eunity-host>/e/viewer?CLOAccessKeyID=...&arg=<encrypted>
 * - Plain arg: <eunity-host>/e/viewer?CLOAccessKeyID=...&arg=accession%3D...
 * - Direct params: <eunity-host>/eUnity/viewer/?accession=...
 */
export function parseEunityStudyParams(viewerUrl: string, viewerBody?: string): EunityStudyParams | null {
  let accession = '';
  let serviceInstance = '';
  let patientId = '';

  // Strategy 1: Try URL query parameters
  try {
    const url = new URL(viewerUrl);
    const p = url.searchParams;

    accession = p.get('accession') || p.get('accessionNumber') || '';
    serviceInstance = p.get('serviceInstance') || '';
    patientId = p.get('patientId') || p.get('PatID') || '';

    // Try parsing the 'arg' parameter as a query string
    const arg = p.get('arg');
    if (arg && !accession) {
      try {
        const argParams = new URLSearchParams(arg);
        if (!accession) accession = argParams.get('accession') || argParams.get('accessionNumber') || '';
        if (!serviceInstance) serviceInstance = argParams.get('serviceInstance') || '';
        if (!patientId) patientId = argParams.get('patientId') || argParams.get('PatID') || '';
      } catch { /* encrypted arg, not a query string */ }

      // Try pipe-delimited
      if (!accession && arg.includes('|')) {
        const parts = arg.split('|');
        if (parts.length >= 3) {
          // Length checked above; `!` for noUncheckedIndexedAccess.
          accession = parts[0]!;
          serviceInstance = parts[1]!;
          patientId = parts[2]!;
        }
      }
    }
  } catch { /* invalid URL */ }

  // Strategy 2: Parse the viewer HTML body for the JSON config
  // The eUnity viewer embeds study params in a large JS config object
  if ((!accession || !serviceInstance || !patientId) && viewerBody) {
    // Extract accessionNumber from JSON: "accessionNumber":"E48330984"
    if (!accession) {
      const accMatch = /"accessionNumber"\s*:\s*"([^"]+)"/.exec(viewerBody);
      if (accMatch) accession = accMatch[1]!;
    }

    // Extract serviceInstance from JSON: "serviceInstance":"EXAMPLEstudystrategy"
    if (!serviceInstance) {
      const siMatch = /"serviceInstance"\s*:\s*"([^"]+)"/.exec(viewerBody);
      if (siMatch) serviceInstance = siMatch[1]!;
    }

    // Extract patientId from JSON: "patientId":"<MRN>$$$<site>"
    if (!patientId) {
      const pidMatch = /"patientId"\s*:\s*"([^"]+)"/.exec(viewerBody);
      if (pidMatch) patientId = pidMatch[1]!;
    }
  }

  if (accession && serviceInstance && patientId) {
    return { accession, serviceInstance, patientId };
  }

  logger.debug(`      [PARAMS] Could not extract study params`);
  logger.debug(`      [PARAMS] accession=${accession}, serviceInstance=${serviceInstance}, patientId=${patientId}`);
  return null;
}

// ─── AMF Session Initialization ───

/**
 * Initialize an eUnity session by calling AmfServicesServlet with getStudyListMeta.
 * This is required before CustomImageServlet will serve images (otherwise 403).
 *
 * Some studies (e.g., CT scans) use a different serviceInstance than the one in the
 * viewer URL. The browser handles this by making two AMF calls:
 * 1. First with the viewer's serviceInstance (e.g., "MyChart")
 * 2. Second with the real serviceInstance from the response (e.g., "UCSFVNAEDGEBundle")
 *
 * Returns { amfBuf, effectiveServiceInstance } on success.
 */
export async function initializeAmfSession(
  cookieJar: tough.CookieJar,
  baseUrl: string,
  accession: string,
  serviceInstance: string,
  patientId: string,
): Promise<{ amfBuf: Buffer; effectiveServiceInstance: string } | null> {
  const amfReq = buildGetStudyListMetaRequest(accession, serviceInstance, patientId);

  const res = await scraperFetch(`${baseUrl}/e/AmfServicesServlet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: amfReq as unknown as BodyInit,
  }, { cookieJar });

  if (!res.ok) {
    logger.debug(`      [AMF] Request failed: ${res.status}`);
    return null;
  }

  const amfBuf = Buffer.from(await res.arrayBuffer());
  const parsed = parseAmfResponse(amfBuf);

  // Deliberately NOT `parsed?.code !== 0`: with no parse, `undefined !== 0` is
  // true and would flip this into the error branch. "No parse" must stay
  // "no error" here; only a parsed non-zero code is an upstream error.
  if (parsed && parsed.code !== 0) {
    logger.debug(`      [AMF] Error code=${parsed.code}: ${parsed.response ?? '(null)'}`);
  }

  if (parsed?.code === 0) {
    logger.debug(`      [AMF] Session initialized successfully (${amfBuf.length} bytes)`);
  }

  // Check if the response contains a different serviceInstance
  const realSI = extractServiceInstanceFromAmf(amfBuf, serviceInstance);
  let effectiveServiceInstance = serviceInstance;

  if (realSI && realSI !== serviceInstance) {
    logger.debug(`      [AMF] Server returned different serviceInstance: ${realSI} (was ${serviceInstance})`);
    logger.debug(`      [AMF] Making second AMF call with real serviceInstance...`);

    // Make a second AMF call with the real serviceInstance (like the browser does)
    const amfReq2 = buildGetStudyListMetaRequest(accession, realSI, patientId);
    const res2 = await scraperFetch(`${baseUrl}/e/AmfServicesServlet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: amfReq2 as unknown as BodyInit,
    }, { cookieJar });

    if (res2.ok) {
      const amfBuf2 = Buffer.from(await res2.arrayBuffer());
      const parsed2 = parseAmfResponse(amfBuf2);
      if (parsed2?.code === 0) {
        logger.debug(`      [AMF] Second session initialized successfully (${amfBuf2.length} bytes)`);
        // Return the FIRST AMF response (has full study/series data) but with the real serviceInstance
        return { amfBuf, effectiveServiceInstance: realSI };
      }
    }
    // Even if second call fails, use the real serviceInstance
    effectiveServiceInstance = realSI;
  }

  return { amfBuf, effectiveServiceInstance };
}

// ─── eUnity Session ───

export interface EunitySession {
  cookieJar: tough.CookieJar;
  baseUrl: string;
  studyUID: string;
  serviceInstance: string;
  series: Array<{ seriesUID: string; instanceUID: string; seriesDescription: string }>;
}

/**
 * Initialize an eUnity session: SAML chain + AMF init + parse series.
 * Returns the authenticated session with cookies and parsed series list.
 * The cookies can be reused for individual image downloads via `download.ts`'s
 * downloadSingleImage().
 */
export async function initEunitySession(
  mychartRequest: MyChartRequest,
  fdiContext: FdiContext,
): Promise<EunitySession | null> {
  const viewerSession = await getImageViewerSamlUrl(mychartRequest, fdiContext);
  if (!viewerSession?.samlUrl) return null;

  const session = await followSamlChain(mychartRequest, viewerSession.samlUrl);
  if (!session) return null;

  const studyParams = parseEunityStudyParams(session.viewerUrl, session.viewerBody);
  if (!studyParams) return null;

  const baseUrl = new URL(session.viewerUrl).origin;
  const amfResult = await initializeAmfSession(
    session.cookieJar, baseUrl,
    studyParams.accession, studyParams.serviceInstance, studyParams.patientId,
  );
  if (!amfResult) return null;

  const { amfBuf, effectiveServiceInstance } = amfResult;
  const studyInfo = parseStudySeries(amfBuf, studyParams.accession);
  if (!studyInfo || studyInfo.series.length === 0) return null;

  return {
    cookieJar: session.cookieJar,
    baseUrl,
    studyUID: studyInfo.studyUID,
    serviceInstance: effectiveServiceInstance,
    series: studyInfo.series,
  };
}
