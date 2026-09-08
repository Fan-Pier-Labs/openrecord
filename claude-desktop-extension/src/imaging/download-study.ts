/**
 * Decode a downloaded imaging study and encode it as JPEGs.
 *
 * The download itself is the shared `download_imaging_study` capability
 * (`shared/capabilities/`), which returns raw CLO bytes. Decoding is the
 * shared pure-JS parser (`convertCloToBitmap`) and encoding is the shared
 * pure-JS exporter (`convertBitmapToJpgPureJs`) — the same code path the Expo
 * app uses, so an X-ray renders identically in every client. This module is
 * just the MCPB glue around them, kept out of tool registration so it can be
 * unit-tested against fake-mychart without standing up an MCP server.
 *
 * Decoding is split from encoding because the tool needs two encodings of
 * the same pixels: full resolution for the copy saved to disk, and a
 * size-budgeted preview for the conversation (`inline-preview.ts`). CLO
 * decoding is the expensive step, so it happens once.
 */
import type { MyChartRequest } from '../../../scrapers/myChart/core/myChartRequest';
import type { FdiContext } from '../../../scrapers/myChart/eunity/imagingViewer';
import { convertCloToBitmap, type Bitmap } from '../../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { convertBitmapToJpgPureJs } from '../../../scrapers/myChart/clo-image-parser/exporters/to_jpg_purejs';
import {
  encodeImageId,
  executeCapability,
  getCapability,
  type StudyImagePayload,
} from '../../../shared/capabilities';

export interface DecodedImage {
  index: number;
  seriesDescription: string;
  bitmap: Bitmap;
}

export interface DecodedStudy {
  studyName: string;
  /** Total image instances the study contains. */
  totalImages: number;
  images: DecodedImage[];
  /** Non-fatal errors from the download/decode pipeline. */
  errors: string[];
}

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
 * Decode the raw CLO images the `download_imaging_study` capability returned
 * into 8-bit grayscale bitmaps. Pure — no network — so the tool handler can
 * call the capability once and hand its payload straight here.
 */
export function decodeStudy(payload: StudyImagePayload): DecodedStudy {
  const errors = [...payload.errors];
  const withPixels = payload.images.filter((img) => img.pixelData && img.pixelData.length > 0);
  const images: DecodedImage[] = [];

  for (let i = 0; i < withPixels.length; i++) {
    const img = withPixels[i]!; // i bounded by loop over withPixels.length; noUncheckedIndexedAccess
    try {
      const bitmap = convertCloToBitmap(Buffer.from(img.pixelData!), img.wrapperData ? Buffer.from(img.wrapperData) : undefined);
      images.push({ index: i, seriesDescription: img.seriesDescription, bitmap });
    } catch (err) {
      errors.push(`Failed to decode image ${i} (${img.seriesDescription}): ${(err as Error).message}`);
    }
  }

  return {
    studyName: payload.studyName || 'imaging study',
    totalImages: payload.totalImages,
    errors,
    images,
  };
}

/** Encode every decoded image at full resolution and quality 100 — the copy that goes to disk. */
export function encodeFullResolutionJpegs(study: DecodedStudy): DownloadStudyJpegsResult {
  const images: StudyJpeg[] = study.images.map((img) => {
    const encoded = convertBitmapToJpgPureJs(img.bitmap);
    return {
      index: img.index,
      seriesDescription: img.seriesDescription,
      width: encoded.width,
      height: encoded.height,
      bytes: encoded.buffer.length,
      jpegBase64: Buffer.from(encoded.buffer).toString('base64'),
    };
  });
  return {
    studyName: study.studyName,
    totalImages: study.totalImages,
    returned: images.length,
    errors: [...study.errors],
    images,
  };
}

/** Decode and encode at full resolution in one step. */
export function encodeStudyJpegs(payload: StudyImagePayload): DownloadStudyJpegsResult {
  return encodeFullResolutionJpegs(decodeStudy(payload));
}

/**
 * Resolve a fresh image-viewer session from `fdiContext`, download the study's
 * CLO image data over HTTP, and encode every image as a full-resolution JPEG.
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
  // executeCapability, not the implementation: this asserts which patient's
  // chart is active before downloading anything. Reaching `run` here was a
  // live bypass — the regex that was supposed to prevent it only scanned three
  // other files, and this reached `run` via getCapability rather than by the
  // one spelling it matched.
  const payload = (await executeCapability(req, capability.id, {
    image_id: encodeImageId(fdiContext),
    study_name: opts.studyName ?? 'imaging study',
  })) as StudyImagePayload;

  return encodeStudyJpegs(payload);
}
