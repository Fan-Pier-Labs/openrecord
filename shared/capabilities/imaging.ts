/**
 * The `image_id` token and the payload shape a downloaded study comes back as.
 *
 * Both are part of the public surface — clients round-trip the token and do
 * their own CLO→image encoding on the payload — so they live beside the
 * registry rather than inside the imaging scraper.
 */

import { Base64 } from 'js-base64';

import type { FdiContext } from '../../scrapers/myChart/eunity/imagingViewer';

/**
 * Pack an {@link FdiContext} into one opaque `image_id` token.
 *
 * A single copy-paste value is easier for a model to round-trip from
 * get_imaging_results into download_imaging_study than two separate fields,
 * and base64url avoids delimiter collisions — `fdi`/`ord` are arbitrary
 * URL-encoded tokens that can contain a colon or comma.
 *
 * `js-base64` rather than `Buffer` or `btoa`: a token minted by any client has
 * to decode in every other one, and neither global is reliably present in
 * React Native's Hermes runtime. `encodeURI` is its unpadded base64url
 * variant — byte-for-byte what `Buffer.toString('base64url')` produces.
 */
export function encodeImageId(fdiContext: FdiContext): string {
  return Base64.encodeURI(JSON.stringify({ fdi: fdiContext.fdi, ord: fdiContext.ord }));
}

/**
 * Inverse of {@link encodeImageId}. Throws if the token is malformed.
 *
 * `Base64.decode` does no alphabet validation of its own, which is the right
 * division of labour: corruption that stays inside the alphabet decodes to
 * garbage regardless, so what actually catches a bad token is validating the
 * decoded payload — the shape check below.
 */
export function decodeImageId(imageId: string): FdiContext {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Base64.decode(imageId));
  } catch {
    throw new Error('Invalid image_id — expected the image_id value from a get_imaging_results entry.');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as FdiContext).fdi !== 'string' ||
    typeof (parsed as FdiContext).ord !== 'string'
  ) {
    throw new Error('Invalid image_id — expected the image_id value from a get_imaging_results entry.');
  }
  return { fdi: (parsed as FdiContext).fdi, ord: (parsed as FdiContext).ord };
}

/** The raw, still-encoded images of one study. Clients encode them themselves. */
export interface StudyImagePayload {
  studyName: string;
  /** How many image instances the study contains in total. */
  totalImages: number;
  images: Array<{
    index: number;
    seriesUID: string;
    seriesDescription: string;
    /** Raw CLO pixel data. Convert with the client's own CLO→image path. */
    pixelData?: Uint8Array;
    /** Raw CLO wrapper (calibration/window metadata) for the same image. */
    wrapperData?: Uint8Array;
  }>;
  errors: string[];
}
