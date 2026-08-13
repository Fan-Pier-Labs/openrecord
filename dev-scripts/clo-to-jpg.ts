#!/usr/bin/env bun
/**
 * Convert eUnity CLO (ClientOutlook) image files to JPEG on disk.
 *
 * This is the two steps the library exposes, wired together for a terminal:
 * decode the CLO to a bitmap, then hand that bitmap to an exporter. There is
 * deliberately no `convertCloToJpg` in the library doing both at once — see
 * `scrapers/myChart/clo-image-parser/` — so if you want PNG or TIFF instead,
 * swap the exporter on the last line rather than looking for a flag here.
 *
 * Usage:
 *   bun dev-scripts/clo-to-jpg.ts <input.clo> [output.jpg]
 *   bun dev-scripts/clo-to-jpg.ts <directory_with_clo_files> [output_directory]
 */

import { readFileSync, existsSync, mkdirSync, statSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";

import { convertCloToBitmap } from "../scrapers/myChart/clo-image-parser/clo_to_bitmap";
import { convertBitmapToJpg } from "../scrapers/myChart/clo-image-parser/exporters/to_jpg";
import { logger } from "../shared/logger";

const CLOCLHAAR_MAGIC = Buffer.from("CLOCLHAAR###");

/** Decode one CLO pixel/wrapper pair and write it out as a JPEG. */
async function cloToJpgFile(
  pixelPath: string,
  outputPath: string,
  wrapperPath?: string,
): Promise<void> {
  const bitmap = convertCloToBitmap(pixelPath, wrapperPath);
  await convertBitmapToJpg(bitmap, outputPath);
}

function findCloPairs(directory: string): [string, string | undefined][] {
  const pairs: [string, string | undefined][] = [];
  const files = readdirSync(directory, { recursive: true }) as string[];

  const pixelFiles = files
    .filter((f) => f.endsWith("_pixel.clo"))
    .map((f) => join(directory, f))
    .sort();

  for (const pixelPath of pixelFiles) {
    const wrapperPath = pixelPath.replace("_pixel.clo", "_wrapper.clo");
    pairs.push([pixelPath, existsSync(wrapperPath) ? wrapperPath : undefined]);
  }

  const standalone = files
    .filter((f) => f.endsWith(".clo") && !f.endsWith("_pixel.clo") && !f.endsWith("_wrapper.clo"))
    .map((f) => join(directory, f))
    .sort();

  for (const path of standalone) {
    try {
      const magic = readFileSync(path, { encoding: null }).subarray(0, 12);
      if (magic.compare(CLOCLHAAR_MAGIC) === 0) {
        pairs.push([path, undefined]);
      }
    } catch (err) {
      logger.warn(`[clo-to-jpg] Failed to read ${path}:`, (err as Error).message);
    }
  }

  return pairs;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    logger.error("Usage: bun dev-scripts/clo-to-jpg.ts <input.clo|directory> [output.jpg|directory]");
    process.exit(1);
  }

  const input = args[0]!; // args.length === 0 was rejected above
  const output = args[1] && !args[1].startsWith("--") ? args[1] : undefined;

  if (statSync(input).isDirectory()) {
    const pairs = findCloPairs(input);
    if (pairs.length === 0) {
      logger.error(`No CLO pixel files found in ${input}`);
      process.exit(1);
    }

    const outputDir = output || input;
    mkdirSync(outputDir, { recursive: true });

    for (const [pixelPath, wrapperPath] of pairs) {
      const stem = basename(pixelPath).replace("_pixel.clo", "").replace(".clo", "");
      const outputPath = join(outputDir, `${stem}.jpg`);
      try {
        await cloToJpgFile(pixelPath, outputPath, wrapperPath);
        logger.debug(`Converted: ${pixelPath} -> ${outputPath}`);
      } catch (e) {
        logger.error(`Failed: ${pixelPath}: ${e}`);
      }
    }
  } else {
    if (!existsSync(input)) {
      logger.error(`File not found: ${input}`);
      process.exit(1);
    }

    let wrapperPath: string | undefined;
    if (input.endsWith("_pixel.clo")) {
      const wp = input.replace("_pixel.clo", "_wrapper.clo");
      if (existsSync(wp)) wrapperPath = wp;
    }

    const outputPath =
      output ||
      join(
        dirname(input),
        basename(input).replace("_pixel.clo", "").replace(".clo", "") + ".jpg",
      );

    try {
      await cloToJpgFile(input, outputPath, wrapperPath);
      logger.debug(`Saved: ${outputPath}`);
    } catch (e) {
      logger.error(`Error: ${e}`);
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  void main();
}
