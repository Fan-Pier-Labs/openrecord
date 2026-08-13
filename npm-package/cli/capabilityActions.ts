/**
 * `--action <capability-id>` — the CLI's generic capability dispatch.
 *
 * `cli.ts` runs `main()` the moment it is imported, so this lives in its own
 * module: the parity test drives these functions directly, and a test that had
 * to import a file which immediately tries to log into MyChart would not be
 * much of a test.
 *
 * The pretty-printed `scrapeAll` output in `cli.ts` stays the default because
 * it is what a human reading a terminal wants. This is the surface that
 * guarantees the CLI can do everything the Claude Desktop extension and the
 * mobile app can: every entry in `shared/capabilities.ts` is a command here,
 * with no per-flag plumbing to remember.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MyChartRequest } from '../../scrapers/myChart/myChartRequest';
import {
  capabilitiesByGroup,
  type Capability,
  type CapabilityContext,
  type StudyImagePayload,
} from '../../shared/capabilities';
import { convertCloToBitmap } from '../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { convertBitmapToJpg } from '../../scrapers/myChart/clo-image-parser/exporters/to_jpg';
import { loadTotpSecret, saveTotpSecret } from './totpStore';
import { savePasskeyCredential } from './passkeyStore';
import type { PasskeyCredential } from '../../scrapers/myChart/softwareAuthenticator';

/** Every capability, grouped, with its parameters — `--list-capabilities`. */
export function renderCapabilityList(): string {
  const lines: string[] = [
    '',
    '='.repeat(60),
    '  Capabilities',
    '='.repeat(60),
    '',
    '  Run one with:  mychart-cli --host <hostname> --action <id> [--arg name=value ...]',
  ];
  for (const { group, capabilities } of capabilitiesByGroup()) {
    lines.push('', `  -- ${group} --`);
    for (const capability of capabilities) {
      // Anything that isn't a plain read gets a marker, so a glance down the
      // list separates "shows me something" from "changes something".
      const marker = capability.kind === 'read' ? ' ' : '!';
      lines.push(`   ${marker} ${capability.id}`);
      lines.push(`       ${capability.description}`);
      for (const param of capability.params) {
        lines.push(
          `       --arg ${param.name}=<${param.type}>${param.required ? ' (required)' : ''}  ${param.description}`,
        );
      }
    }
  }
  lines.push(
    '',
    "  ! marks a command that changes something — a write to the chart, or the account's own sign-in settings.",
    '  Commands that produce images write JPEGs to ./imaging-output (override with --output <dir>).',
    '',
  );
  return lines.join('\n');
}

/**
 * Per-account context for the capabilities that touch credentials. The
 * password comes from whatever resolved this session; the TOTP secret and the
 * passkey come from the CLI's own on-disk stores.
 */
export async function capabilityContext(
  hostname: string,
  password: string | undefined,
): Promise<CapabilityContext> {
  return {
    password,
    totpSecret: (await loadTotpSecret(hostname)) ?? undefined,
    saveTotpSecret: (secret: string) => saveTotpSecret(hostname, secret),
    savePasskey: async (serialized: string) => {
      await savePasskeyCredential(hostname, JSON.parse(serialized) as PasskeyCredential);
    },
  };
}

/**
 * `--arg` values arrive as strings; numeric and boolean parameters are coerced
 * so a capability sees the type it declared.
 *
 * An unknown `--arg` is an error rather than a silent no-op — a typo'd
 * parameter name would otherwise look like the capability ignoring the
 * request, which is the worst way to find out you fetched the wrong note.
 */
export function coerceCapabilityArgs(
  capability: Capability,
  args: Record<string, string>,
): Record<string, unknown> {
  const known = new Map(capability.params.map((p) => [p.name, p]));
  const out: Record<string, unknown> = {};

  for (const [name, raw] of Object.entries(args)) {
    const param = known.get(name);
    if (!param) {
      const accepted = capability.params.map((p) => p.name).join(', ') || '(none)';
      throw new Error(`${capability.id} has no argument "${name}". It accepts: ${accepted}`);
    }
    if (param.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`--arg ${name} expects a number, got "${raw}".`);
      if (param.min !== undefined && n < param.min) throw new Error(`--arg ${name} must be at least ${param.min}.`);
      if (param.max !== undefined && n > param.max) throw new Error(`--arg ${name} must be at most ${param.max}.`);
      out[name] = n;
    } else if (param.type === 'boolean') {
      out[name] = raw !== 'false' && raw !== '0';
    } else {
      out[name] = raw;
    }
  }

  for (const param of capability.params) {
    if (param.required && out[param.name] === undefined) {
      throw new Error(`${capability.id} requires --arg ${param.name}=<${param.type}> (${param.description})`);
    }
  }
  return out;
}

/**
 * Raw image bytes would swamp a terminal; summarize them instead.
 *
 * JSON.stringify calls `toJSON()` *before* the replacer sees a value, so a
 * Node `Buffer` arrives here as `{type: 'Buffer', data: [...]}`, not as a
 * `Uint8Array` — both shapes must be caught or a single downloaded image
 * prints as tens of thousands of lines of byte values.
 */
export function jsonSafeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) return `<${value.length} bytes>`;
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'Buffer' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return `<${(value as { data: unknown[] }).data.length} bytes>`;
  }
  return value;
}

/** One JPEG written to disk by {@link writeStudyImages}. */
export interface WrittenStudyImage {
  filePath: string;
  seriesUID: string;
  seriesDescription: string;
  width: number;
  height: number;
  jpegBytes: number;
}

/**
 * The CLI's rendering of a `rendersMedia` capability: decode each raw CLO
 * image in the payload and write it to `outputDir` as a JPEG the user can
 * open in Finder. The registry's contract is that `run` returns raw CLO
 * bytes and each client encodes them its own way — this is the CLI's way,
 * kept separate from `runCapabilityAction` so it can be tested without a
 * MyChart session.
 */
export async function writeStudyImages(
  payload: StudyImagePayload,
  outputDir: string,
  quality: number,
): Promise<WrittenStudyImage[]> {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const safeStudy = (payload.studyName || 'study').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  const written: WrittenStudyImage[] = [];

  for (const image of payload.images) {
    if (!image.pixelData) continue;
    const safeSeries = image.seriesDescription.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${safeStudy}_${String(image.index).padStart(3, '0')}_${safeSeries}.jpg`;
    const filePath = path.join(outputDir, fileName);
    const bitmap = convertCloToBitmap(
      Buffer.from(image.pixelData),
      image.wrapperData ? Buffer.from(image.wrapperData) : undefined,
    );
    const jpeg = await convertBitmapToJpg(bitmap, filePath, { quality });
    written.push({
      filePath,
      seriesUID: image.seriesUID,
      seriesDescription: image.seriesDescription,
      width: bitmap.width,
      height: bitmap.height,
      jpegBytes: jpeg.length,
    });
  }
  return written;
}

/** Run one capability against one session and print its JSON result. */
export async function runCapabilityAction(
  capability: Capability,
  session: { hostname: string; request: MyChartRequest },
  password: string | undefined,
  args: Record<string, string>,
  outputDir?: string,
): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}\n  ${capability.title}: ${session.hostname}\n${'='.repeat(60)}`);
  try {
    const ctx = await capabilityContext(session.hostname, password);
    const coerced = coerceCapabilityArgs(capability, args);
    const result = await capability.run(session.request, coerced, ctx);

    if (capability.rendersMedia) {
      // Media payloads become files on disk, never bytes in the terminal.
      const payload = result as StudyImagePayload;
      const dir = path.resolve(outputDir ?? path.join(process.cwd(), 'imaging-output'));
      const quality = typeof coerced.jpeg_quality === 'number' ? coerced.jpeg_quality : 85;
      const files = await writeStudyImages(payload, dir, quality);
      console.log(JSON.stringify({
        studyName: payload.studyName,
        totalImages: payload.totalImages,
        outputDir: dir,
        images: files,
        errors: payload.errors,
      }, jsonSafeReplacer, 2));
      // Partial success still wrote files worth exploring; only a run that
      // produced nothing but errors is a failure.
      return files.length > 0 || payload.errors.length === 0;
    }

    console.log(JSON.stringify(result, jsonSafeReplacer, 2));
    return true;
  } catch (err) {
    console.log(`  ${(err as Error).message}`);
    return false;
  }
}
