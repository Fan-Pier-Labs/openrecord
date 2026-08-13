/**
 * Encode a downloaded imaging study as JPEGs.
 *
 * The download itself is the shared `download_imaging_study` capability
 * (`shared/capabilities.ts`), which returns raw CLO bytes — every client has to
 * encode those itself, because the MCPB ships no native image dependency and
 * uses the pure-JS CLO→JPEG path (convertCloToBitmap16 + jpeg-js) where the
 * CLI uses sharp and the mobile app uses its own decoder. This module is that
 * MCPB-specific encoding step, kept out of tool registration so it can be
 * unit-tested against fake-mychart without standing up an MCP server.
 */
import type { MyChartRequest } from '../../../scrapers/myChart/myChartRequest';
import type { FdiContext } from '../../../scrapers/myChart/eunity/imagingViewer';
import { convertCloToBitmap16 } from '../../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { encodeCloAsJpeg } from './jpeg-encoder';
import {
  encodeImageId,
  getCapability,
  type StudyImagePayload,
} from '../../../shared/capabilities';

export interface StudyJpeg {
  index: number;
  seriesDescription: string;
  width: number;
  height: number;
  bytes: number;
  /** Base64-encoded JPEG bytes, ready to drop into an MCP image content block. */
  jpegBase64: string;
}

export interface DownloadStudyJpegsResult {
  studyName: string;
  /** Total image instances the study contains. */
  totalImages: number;
  /** How many images were encoded and returned. */
  returned: number;
  images: StudyJpeg[];
  /** Non-fatal errors from the download/encode pipeline. */
  errors: string[];
}

export interface DownloadStudyJpegsOptions {
  studyName?: string;
}

/**
 * Encode the raw CLO images the `download_imaging_study` capability returned
 * as JPEGs. Pure — no network — so the tool handler can call the capability
 * once and hand its payload straight here.
 */
export function encodeStudyJpegs(payload: StudyImagePayload): DownloadStudyJpegsResult {
  const errors = [...payload.errors];
  const withPixels = payload.images.filter((img) => img.pixelData && img.pixelData.length > 0);
  const images: StudyJpeg[] = [];

  for (let i = 0; i < withPixels.length; i++) {
    const img = withPixels[i]!; // i bounded by loop over withPixels.length; noUncheckedIndexedAccess
    try {
      const bitmap = convertCloToBitmap16(Buffer.from(img.pixelData!), img.wrapperData ? Buffer.from(img.wrapperData) : undefined);
      const encoded = encodeCloAsJpeg(bitmap);
      images.push({
        index: i,
        seriesDescription: img.seriesDescription,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.bytes,
        jpegBase64: Buffer.from(encoded.buffer).toString('base64'),
      });
    } catch (err) {
      errors.push(`Failed to encode image ${i} (${img.seriesDescription}): ${(err as Error).message}`);
    }
  }

  return {
    studyName: payload.studyName || 'imaging study',
    totalImages: payload.totalImages,
    returned: images.length,
    errors,
    images,
  };
}

/**
 * Resolve a fresh image-viewer session from `fdiContext`, download the study's
 * CLO image data over HTTP, and encode every image as a JPEG.
 *
 * `fdiContext` ({ fdi, ord }) comes from an entry returned by
 * `getImagingResults` — it is durable report-identifier data, so a fresh
 * single-use SAML viewer URL is fetched internally on every call.
 */
export async function downloadStudyJpegs(
  req: MyChartRequest,
  fdiContext: FdiContext,
  opts: DownloadStudyJpegsOptions = {},
): Promise<DownloadStudyJpegsResult> {
  const capability = getCapability('download_imaging_study');
  if (!capability?.rendersMedia) {
    throw new Error('The imaging-download capability is missing from the registry.');
  }
  const payload = (await capability.run(req, {
    image_id: encodeImageId(fdiContext),
    study_name: opts.studyName ?? 'imaging study',
  })) as StudyImagePayload;

  return encodeStudyJpegs(payload);
}
