/**
 * Convert CLO images to JPEG without native dependencies.
 *
 * The other exporters in this directory wrap sharp, a native Node module that
 * two of our targets cannot load: the Claude Desktop extension (a portable
 * .mcpb bundle) and the Expo app (React Native). This is the JPEG path those
 * targets share — jpeg-js only, pure JS end to end — so every client windows
 * and encodes an image identically to the CLI.
 */

import jpegJs from "jpeg-js";
import { convertCloToBitmap } from "../clo_to_bitmap";
import type { Bitmap } from "../clo_to_bitmap";

export interface PureJsJpeg {
  /** Encoded JPEG bytes. */
  buffer: Uint8Array;
  width: number;
  height: number;
}

/** Grayscale → RGBA (alpha = 255). jpeg-js encodes RGBA input. */
export function grayscaleToRgba(gray: Uint8Array): Uint8Array {
  const out = new Uint8Array(gray.length * 4);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    const o = i * 4;
    out[o] = v;
    out[o + 1] = v;
    out[o + 2] = v;
    out[o + 3] = 255;
  }
  return out;
}

/**
 * Encode an 8-bit grayscale bitmap as a JPEG at quality 100 — medical images,
 * deliberately no knob to degrade them.
 */
export function convertBitmapToJpgPureJs(bitmap: Bitmap): PureJsJpeg {
  const rgba = grayscaleToRgba(bitmap.pixels);
  const encoded = jpegJs.encode(
    { data: rgba, width: bitmap.width, height: bitmap.height },
    100,
  );
  return { buffer: encoded.data, width: bitmap.width, height: bitmap.height };
}

/** Decode a CLO pixel/wrapper pair and encode the result as a JPEG. */
export function convertCloToJpgPureJs(
  pixelInput: string | Buffer,
  wrapperInput?: string | Buffer,
): PureJsJpeg {
  return convertBitmapToJpgPureJs(convertCloToBitmap(pixelInput, wrapperInput));
}
