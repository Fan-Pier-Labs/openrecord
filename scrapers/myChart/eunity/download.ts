/**
 * Direct HTTP image downloader for eUnity DICOM viewer.
 *
 * Pulls pixel data out of CustomImageServlet WITHOUT Playwright, once
 * `session.ts` has an initialized eUnity session. Two entry points:
 * - `downloadSingleImage` — one instance from a session you already hold
 * - `downloadImagingStudyDirect` — the whole pipeline end to end, from the
 *   SAML chain to a directory of CLO files
 */
import type * as tough from 'tough-cookie';
import * as fs from 'fs';
import * as path from 'path';
import type { MyChartRequest } from '../core/myChartRequest';
import { type FdiContext, followSamlChain, getImageViewerSamlUrl } from './imagingViewer';
import { abortAfter, scraperFetch } from '../../http';
import { sortImagesByPatientPosition } from '../clo-image-parser/sortByPatientPosition';
import { logger } from '../../../shared/logger';
import { parseStudySeries } from './amf';
import { type EunitySession, initializeAmfSession, parseEunityStudyParams } from './session';

// ─── Image Download ───

export interface SeriesInfo {
  seriesUID: string;
  description: string;
  instanceCount: number;
}

export interface DirectDownloadResult {
  studyName: string;
  images: DirectDownloadedImage[];
  errors: string[];
  /** Parsed series info from the AMF response */
  seriesList?: SeriesInfo[];
}

export interface DirectDownloadedImage {
  filePath: string;
  sizeBytes: number;
  seriesUID: string;
  instanceUID: string;
  seriesDescription: string;
  accessionNumber: string;
  format: string;
  pixelData?: Buffer;
  wrapperData?: Buffer;
}

export interface DirectDownloadOptions {
  skipFileWrite?: boolean;
  /** Number of parallel downloads (default: 5). */
  concurrency?: number;
}

/**
 * Progressive refinement levels for CLOPIXEL requests.
 *
 * The eUnity viewer uses Haar wavelet progressive loading:
 * - Level 1 (0,3,1): Approximation coefficients — lowest resolution base layer
 * - Level 2 (2,3,2): Additional wavelet detail — medium resolution
 * - Level 3 (2,4,3): Final wavelet detail — full resolution
 *
 * Each level response adds detail that's composited on the client side.
 * All three levels together represent the full image quality.
 * Observed from browser WASM viewer network traffic.
 */
const PROGRESSIVE_LEVELS = ['0,3,1', '2,3,2', '2,4,3'];

/**
 * Download an image from CustomImageServlet.
 * NOTE: image/CLJPEG format is NOT supported by the Example Health System eUnity server (returns CLOERROR).
 * Use CLOWRAPPER format to get metadata + low-res preview.
 */
async function downloadImage(
  cookieJar: tough.CookieJar,
  baseUrl: string,
  params: {
    studyUID: string;
    seriesUID: string;
    objectUID: string;
    frameNumber?: number;
    serviceInstance: string;
    format?: 'CLOPIXEL' | 'CLOWRAPPER';
    level?: string;
  }
): Promise<{ data: Buffer; contentType: string }> {
  const format = params.format ?? 'CLOWRAPPER';
  const level = params.level ?? '0';

  let requestType: string;
  let contentType: string;
  let haveImageData: string;

  switch (format) {
    case 'CLOPIXEL':
      requestType = 'CLOPIXEL';
      contentType = 'image/CLHAAR';
      haveImageData = 'partialps';
      break;
    case 'CLOWRAPPER':
      requestType = 'CLOWRAPPER';
      contentType = 'image/CLWAVE;image/CLHAAR;image/CLJPEG';
      haveImageData = 'partialnops';
      break;
  }

  const body = new URLSearchParams({
    requestType,
    contentType,
    studyUID: params.studyUID,
    seriesUID: params.seriesUID,
    objectUID: params.objectUID,
    frameNumber: String(params.frameNumber ?? 1),
    locale: 'en_US',
    haveImageData,
    serializeType: 'zlib',
    compressionVersion: '3',
    serviceInstance: params.serviceInstance,
    level,
  }).toString();

  const res = await scraperFetch(`${baseUrl}/e/CustomImageServlet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
    signal: abortAfter(30_000),
  }, { cookieJar });

  if (!res.ok) {
    throw new Error(`CustomImageServlet failed: ${res.status} ${res.statusText}`);
  }

  const responseType = res.headers.get('content-type') || '';
  const data = Buffer.from(await res.arrayBuffer());
  return { data, contentType: responseType };
}

/**
 * Download all progressive CLOPIXEL levels for maximum quality.
 *
 * The eUnity viewer uses Haar wavelet progressive refinement — each level
 * adds more detail to the image. All 3 levels are needed for full quality.
 * Returns an array of {level, data} for each successfully downloaded level.
 */
async function downloadProgressiveClopixel(
  cookieJar: tough.CookieJar,
  baseUrl: string,
  params: {
    studyUID: string;
    seriesUID: string;
    objectUID: string;
    serviceInstance: string;
    frameNumber?: number;
  },
): Promise<Array<{ level: string; data: Buffer }>> {
  const results: Array<{ level: string; data: Buffer }> = [];

  for (const level of PROGRESSIVE_LEVELS) {
    try {
      const { data } = await downloadImage(cookieJar, baseUrl, {
        ...params,
        format: 'CLOPIXEL',
        level,
      });

      // Check for CLOERROR in response
      if (data.length > 8 && data.toString('ascii', 0, 8) === 'CLOERROR') {
        logger.debug(`        [PIXEL] Level ${level}: server returned CLOERROR, stopping`);
        break;
      }

      results.push({ level, data });
      logger.debug(`        [PIXEL] Level ${level}: ${(data.length / 1024).toFixed(0)} KB`);
    } catch (err) {
      logger.debug(`        [PIXEL] Level ${level} failed: ${(err as Error).message}`);
      break;
    }
  }

  return results;
}

function isCloFormat(buf: Buffer): boolean {
  return buf.length > 3 && buf.toString('ascii', 0, 3) === 'CLO';
}

// ─── Single-Image Download ───

/**
 * Download a single image from an initialized eUnity session.
 * Returns the raw CLO pixel + wrapper data for conversion.
 */
export async function downloadSingleImage(
  eunitySession: EunitySession,
  seriesUID: string,
  objectUID: string,
): Promise<{ pixelData: Buffer; wrapperData?: Buffer } | null> {
  const { data } = await downloadImage(eunitySession.cookieJar, eunitySession.baseUrl, {
    studyUID: eunitySession.studyUID,
    seriesUID,
    objectUID,
    serviceInstance: eunitySession.serviceInstance,
    format: 'CLOWRAPPER',
  });

  if (data.length < 256 || (data.length > 8 && data.toString('ascii', 0, 8) === 'CLOERROR')) {
    return null;
  }

  const CLOCLHAAR_MAGIC = Buffer.from('CLOCLHAAR');
  const haarIdx = data.indexOf(CLOCLHAAR_MAGIC);
  if (haarIdx < 0) return null;

  // No leading wrapper means the key is absent, not present-and-undefined.
  return {
    pixelData: Buffer.from(data.subarray(haarIdx)),
    ...(haarIdx > 0 ? { wrapperData: Buffer.from(data.subarray(0, haarIdx)) } : {}),
  };
}

// ─── Self-Contained Download Entry Point ───

/**
 * Download all images from an imaging study using direct HTTP requests.
 *
 * This is the main entry point for the CLI `--action get-imaging` flow.
 * It handles the entire pipeline automatically:
 * 1. Gets a fresh SAML URL from FdiData
 * 2. Follows the SAML chain to get an authenticated eUnity session
 * 3. Extracts study parameters (accession, serviceInstance, patientId) from the viewer URL
 * 4. Calls AmfServicesServlet getStudyListMeta to initialize the session and get series info
 * 5. Downloads CLO image data for each series via CustomImageServlet
 *
 * Returns the download results including file paths, sizes, and any errors.
 */
export async function downloadImagingStudyDirect(
  mychartRequest: MyChartRequest,
  fdiContext: FdiContext,
  studyName: string,
  outputDir: string,
  options?: DirectDownloadOptions,
): Promise<DirectDownloadResult> {
  const result: DirectDownloadResult = {
    studyName,
    images: [],
    errors: [],
  };

  try {
    // Step 1: Get SAML URL from FdiData
    logger.debug('      Getting SAML URL for direct download...');
    const viewerSession = await getImageViewerSamlUrl(mychartRequest, fdiContext);
    if (!viewerSession?.samlUrl) {
      result.errors.push('Could not get SAML URL from FdiData');
      return result;
    }

    // Step 2: Follow SAML chain to eUnity
    logger.debug('      Following SAML chain...');
    const session = await followSamlChain(mychartRequest, viewerSession.samlUrl);
    if (!session) {
      result.errors.push('Failed to follow SAML chain to eUnity');
      return result;
    }
    logger.debug(`      Got eUnity session (JSESSIONID: ${session.jsessionId?.substring(0, 12)}...)`);

    // Step 3: Extract study params from viewer URL
    const studyParams = parseEunityStudyParams(session.viewerUrl, session.viewerBody);
    if (!studyParams) {
      result.errors.push(`Could not extract study params from viewer URL: ${session.viewerUrl}`);
      return result;
    }
    logger.debug(`      Study params: accession=${studyParams.accession}, serviceInstance=${studyParams.serviceInstance}`);

    const baseUrl = new URL(session.viewerUrl).origin;
    const skipFileWrite = options?.skipFileWrite ?? false;
    if (!skipFileWrite) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    // Step 4: Initialize AMF session (required before CustomImageServlet will serve images)
    logger.debug('      Initializing AMF session...');
    const amfResult = await initializeAmfSession(
      session.cookieJar,
      baseUrl,
      studyParams.accession,
      studyParams.serviceInstance,
      studyParams.patientId,
    );

    if (!amfResult) {
      result.errors.push('AMF session initialization failed');
      return result;
    }

    const { amfBuf: amfResponse, effectiveServiceInstance } = amfResult;
    if (effectiveServiceInstance !== studyParams.serviceInstance) {
      logger.debug(`      Using effective serviceInstance: ${effectiveServiceInstance}`);
      studyParams.serviceInstance = effectiveServiceInstance;
    }

    // Step 5: Parse series info from AMF response — structured AMF3 decode
    // first, positional heuristic as loud fallback
    const studyInfo = parseStudySeries(amfResponse, studyParams.accession);
    if (!studyInfo || studyInfo.series.length === 0) {
      result.errors.push('Could not parse series info from AMF response');
      return result;
    }
    logger.debug(`      Found ${studyInfo.series.length} series, studyUID: ${studyInfo.studyUID.substring(0, 30)}...`);

    // Build series list summary
    const seriesMap = new Map<string, { description: string; count: number }>();
    for (const s of studyInfo.series) {
      const existing = seriesMap.get(s.seriesUID);
      if (existing) {
        existing.count++;
      } else {
        seriesMap.set(s.seriesUID, { description: s.seriesDescription, count: 1 });
      }
    }
    result.seriesList = [...seriesMap.entries()].map(([seriesUID, { description, count }]) => ({
      seriesUID,
      description,
      instanceCount: count,
    }));

    // Step 6: Download every image — each (seriesUID, instanceUID) pair is a
    // separate image. Downloaded in parallel batches for speed (CT scans can
    // have 700+ slices). Instances that answer CLOERROR are skipped, never
    // returned as images: eUnity's instance list can carry pseudo-instances
    // (the viewer's "SeriesSelector" entries) that hold no pixel data.
    const concurrency = options?.concurrency ?? 5;
    const safeName = studyName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
    const CLOCLHAAR_MAGIC = Buffer.from('CLOCLHAAR');
    let completed = 0;

    async function downloadOne(series: NonNullable<typeof studyInfo>['series'][0]): Promise<void> {
      try {
        const { data } = await downloadImage(session!.cookieJar, baseUrl, {
          studyUID: studyInfo!.studyUID,
          seriesUID: series.seriesUID,
          objectUID: series.instanceUID,
          serviceInstance: studyParams!.serviceInstance,
          format: 'CLOWRAPPER',
        });

        completed++;
        if (data.length < 256 || (data.length > 8 && data.toString('ascii', 0, 8) === 'CLOERROR')) {
          if (completed % 50 === 0) {
            logger.debug(`      [${completed} tried] Progress...`);
          }
          return;
        }

        const safeDesc = series.seriesDescription.replace(/[^a-zA-Z0-9_-]/g, '_');

        if (skipFileWrite) {
          const haarIdx = data.indexOf(CLOCLHAAR_MAGIC);
          if (haarIdx < 0) return;
          const wrapperMetadata = haarIdx > 0 ? data.subarray(0, haarIdx) : undefined;
          const embeddedPixelData = data.subarray(haarIdx);
          result.images.push({
            filePath: '',
            sizeBytes: embeddedPixelData.length,
            seriesUID: series.seriesUID,
            instanceUID: series.instanceUID,
            seriesDescription: series.seriesDescription,
            accessionNumber: studyParams!.accession,
            format: 'CLHAAR',
            pixelData: Buffer.from(embeddedPixelData),
            ...(wrapperMetadata ? { wrapperData: Buffer.from(wrapperMetadata) } : {}),
          });
        } else {
          const ext = isCloFormat(data) ? '.clo' : '.bin';
          const fileName = `${safeName}_${safeDesc}_wrapper${ext}`;
          const filePath = path.join(outputDir, fileName);
          await fs.promises.writeFile(filePath, data);

          const pixelLevels = await downloadProgressiveClopixel(session!.cookieJar, baseUrl, {
            studyUID: studyInfo!.studyUID,
            seriesUID: series.seriesUID,
            objectUID: series.instanceUID,
            serviceInstance: studyParams!.serviceInstance,
          });

          result.images.push({
            filePath,
            sizeBytes: data.length,
            seriesUID: series.seriesUID,
            instanceUID: series.instanceUID,
            seriesDescription: series.seriesDescription,
            accessionNumber: studyParams!.accession,
            format: isCloFormat(data) ? 'CLHAAR' : 'UNKNOWN',
          });

          for (const pl of pixelLevels) {
            const levelTag = pl.level.replace(/,/g, '-');
            const pixelFileName = `${safeName}_${safeDesc}_pixel_L${levelTag}${isCloFormat(pl.data) ? '.clo' : '.bin'}`;
            const pixelFilePath = path.join(outputDir, pixelFileName);
            await fs.promises.writeFile(pixelFilePath, pl.data);

            result.images.push({
              filePath: pixelFilePath,
              sizeBytes: pl.data.length,
              seriesUID: series.seriesUID,
              instanceUID: series.instanceUID,
              seriesDescription: `${series.seriesDescription} (pixel L${levelTag})`,
              accessionNumber: studyParams!.accession,
              format: isCloFormat(pl.data) ? `CLHAAR_PIXEL_L${levelTag}` : 'UNKNOWN',
            });
          }
        }

        if (completed % 50 === 0) {
          logger.debug(`      [${completed} tried] Downloaded ${(data.length / 1024).toFixed(0)} KB - ${series.seriesDescription}`);
        }
      } catch (err) {
        completed++;
        result.errors.push(`${series.seriesDescription}: ${(err as Error).message}`);
      }
    }

    logger.debug(`      Downloading ${studyInfo.series.length} instances (concurrency: ${concurrency})...`);
    for (let i = 0; i < studyInfo.series.length; i += concurrency) {
      const batch = studyInfo.series.slice(i, i + concurrency);
      await Promise.all(batch.map((s) => downloadOne(s)));
    }
    logger.debug(`      Downloaded ${result.images.length} images (${studyInfo.series.length} instances tried)`);
    if (result.images.length === 0 && result.errors.length === 0) {
      result.errors.push(
        `No downloadable images: all ${studyInfo.series.length} instances returned empty or error responses from the image server.`,
      );
    }
  } catch (err) {
    result.errors.push(`Fatal: ${(err as Error).message}`);
  }

  // The parallel batches above complete in whatever order the image server
  // answers, so this list is not even download order. Re-order each
  // multi-slice series anatomically so every client hands back a stack that
  // reads the way the scanner swept it.
  result.images = sortImagesByPatientPosition(result.images);

  return result;
}
