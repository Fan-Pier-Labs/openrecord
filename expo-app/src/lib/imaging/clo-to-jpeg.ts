/**
 * Decode an eUnity CLO image to a base64 JPEG, entirely on-device.
 *
 * Thin wrapper over the shared pure-JS exporter (no sharp, no native deps) —
 * the same code path the Claude Desktop extension uses, so images render
 * identically everywhere. Base64 is the shape the attachment store wants.
 */
import { convertCloToJpgPureJs } from "../../../../scrapers/myChart/clo-image-parser/exporters/to_jpg_purejs";

export type CloJpegResult = {
  base64: string;
  width: number;
  height: number;
};

export function cloToJpegBase64(
  pixelData: Buffer,
  wrapperData?: Buffer,
): CloJpegResult {
  const { buffer, width, height } = convertCloToJpgPureJs(pixelData, wrapperData);
  return { base64: Buffer.from(buffer).toString("base64"), width, height };
}
