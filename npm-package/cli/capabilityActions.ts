/**
 * `--action <capability-id>` — the CLI's generic capability dispatch.
 *
 * `cli.ts` runs `main()` the moment it is imported, so this lives in its own
 * module: the parity test drives these functions directly, and a test that had
 * to import a file which immediately tries to log into MyChart would not be
 * much of a test.
 *
 * This is the CLI's only dispatch surface: the default no-`--action` run walks
 * {@link FULL_SCRAPE_CAPABILITIES}, and every named action resolves to a
 * registry id (directly, or through {@link CLI_ACTION_ALIASES}). That is what
 * guarantees the CLI can do everything the Claude Desktop extension and the
 * mobile app can — every entry in `shared/capabilities.ts` is a command here,
 * with no per-flag plumbing to remember — and that every read passes through
 * `executeCapability`'s active-patient guard.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MyChartRequest } from '../../scrapers/myChart/myChartRequest';
import {
  CAPABILITIES,
  acceptsPatientParam,
  capabilitiesByGroup,
  COMMON_CAPABILITIES,
  LESS_FREQUENTLY_USED_CAPABILITIES,
  executeCapability,
  getCapability,
  type Capability,
  type CapabilityContext,
  type StudyImagePayload,
} from '../../shared/capabilities';
import { convertCloToBitmap } from '../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { convertBitmapToJpg } from '../../scrapers/myChart/clo-image-parser/exporters/to_jpg';
import { loadTotpSecret, saveTotpSecret } from './totpStore';
import { savePasskeyCredential } from './passkeyStore';
import type { PasskeyCredential } from '../../scrapers/myChart/softwareAuthenticator';

/**
 * Dashed action names the CLI accepted back when each had a hand-written
 * handler. Each now resolves to the registry capability that replaced it —
 * same fetch, same active-patient guard, JSON output. (`get-imaging` is the
 * one dashed action that is not a plain alias; see
 * {@link downloadAllImagingStudies}.)
 */
export const CLI_ACTION_ALIASES: Readonly<Record<string, string>> = {
  'list-proxies': 'list_proxy_targets',
  'get-thread': 'get_message_thread',
  'delete-message': 'delete_message',
  'request-refill': 'request_refill',
};

/** Resolve an `--action` value to a registry capability, dashed spellings included. */
export function resolveCliAction(action: string): Capability | undefined {
  return getCapability(CLI_ACTION_ALIASES[action] ?? action);
}

/**
 * What a bare `mychart-cli --host <hostname>` scrapes: every chart-reading
 * capability that can run without arguments. Derived from the registry, never
 * hand-listed — a read capability added there is scraped here the same day.
 * Excluded by the predicate itself: writes and account-security operations,
 * reads that require an argument (per-visit notes, single threads), the
 * media capability (bytes belong behind an explicit `--action`), and the
 * `Patients` group (session introspection, not chart data).
 */
export const FULL_SCRAPE_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (capability) =>
    capability.kind === 'read' &&
    !capability.rendersMedia &&
    acceptsPatientParam(capability) &&
    capability.params.every((param) => !param.required),
);

/** How much of the registry a listing prints. */
export interface CapabilityListOptions {
  /**
   * Include the {@link Capability.lessFrequentlyUsed} entries too. Off by
   * default: a full dump of the registry buries the handful of capabilities
   * that are the reason to connect an account at all.
   */
  showAll?: boolean;
}

function renderCapabilityGroups(capabilities: readonly Capability[]): string[] {
  const lines: string[] = [];
  for (const { group, capabilities: inGroup } of capabilitiesByGroup(capabilities)) {
    lines.push('', `  -- ${group} --`);
    for (const capability of inGroup) {
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
  return lines;
}

/**
 * The capabilities, grouped, with the parameters each takes.
 *
 * By default this is the commonly-used set only, with a pointer to
 * `--show-all` for the rest — the hidden entries stay every bit as runnable,
 * they just don't crowd out labs and medications in a 50-entry wall of text.
 * `--show-all` appends them under their own heading rather than mixing them
 * back in, so the shape of the default listing doesn't change under the reader.
 */
export function renderCapabilityList(options: CapabilityListOptions = {}): string {
  const lines: string[] = [
    '',
    '='.repeat(60),
    '  Capabilities',
    '='.repeat(60),
    '',
    '  Run one with:  mychart-cli --host <hostname> --action <id> [--arg name=value ...]',
    ...renderCapabilityGroups(COMMON_CAPABILITIES),
  ];

  if (options.showAll) {
    lines.push(
      '',
      '='.repeat(60),
      '  Less frequently used',
      '='.repeat(60),
      '',
      '  Supported, and rarely what you want: endpoints most charts leave empty,',
      "  and settings for the account's own sign-in. Run them the same way.",
      ...renderCapabilityGroups(LESS_FREQUENTLY_USED_CAPABILITIES),
    );
  }

  lines.push(
    '',
    "  ! marks a command that changes something — a write to the chart, or the account's own sign-in settings.",
    '  Commands that produce images write JPEGs to ./imaging-output (override with --output <dir>).',
  );
  if (!options.showAll) {
    lines.push(
      `  ${LESS_FREQUENTLY_USED_CAPABILITIES.length} less-frequently-used capabilities are hidden. Show them with:`,
      '      mychart-cli --list-capabilities --show-all',
    );
  }
  lines.push('');
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
  options: { saveClo?: boolean } = {},
): Promise<WrittenStudyImage[]> {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const safeStudy = (payload.studyName || 'study').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  const written: WrittenStudyImage[] = [];

  for (const image of payload.images) {
    if (!image.pixelData) continue;
    const safeSeries = image.seriesDescription.replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseName = `${safeStudy}_${String(image.index).padStart(3, '0')}_${safeSeries}`;
    const filePath = path.join(outputDir, `${baseName}.jpg`);
    if (options.saveClo) {
      await fs.promises.writeFile(path.join(outputDir, `${baseName}_pixel.clo`), image.pixelData);
      if (image.wrapperData) {
        await fs.promises.writeFile(path.join(outputDir, `${baseName}_wrapper.clo`), image.wrapperData);
      }
    }
    const bitmap = convertCloToBitmap(
      Buffer.from(image.pixelData),
      image.wrapperData ? Buffer.from(image.wrapperData) : undefined,
    );
    const jpeg = await convertBitmapToJpg(bitmap, filePath);
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
/**
 * Run one capability against one session and print its JSON result.
 *
 * Dispatch goes through `executeCapability`, never `capability.run` — that is
 * where the active-patient assertion lives. `patient` is folded in after
 * coercion, since `coerceCapabilityArgs` rejects any name a capability didn't
 * declare and this one is declared by the registry.
 */
export async function runCapabilityAction(
  capability: Capability,
  session: { hostname: string; request: MyChartRequest },
  password: string | undefined,
  args: Record<string, string>,
  outputDir?: string,
  patient?: string,
): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}\n  ${capability.title}: ${session.hostname}\n${'='.repeat(60)}`);
  try {
    const ctx = await capabilityContext(session.hostname, password);
    const coerced = coerceCapabilityArgs(capability, args);
    // `patient` is declared by the registry, not by each capability, so it is
    // folded in AFTER coercion — coerceCapabilityArgs rejects any name the
    // capability did not declare. An explicit argument wins: on
    // switch_proxy_target, `patient` is the declared switch target, which the
    // --patient assertion flag must not clobber.
    if (patient !== undefined && coerced.patient === undefined) coerced.patient = patient;
    // executeCapability, never capability.run: the active-patient assertion
    // lives there, and it has to run for media capabilities too.
    const result = await executeCapability(session.request, capability.id, coerced, ctx);

    if (capability.rendersMedia) {
      // Media payloads become files on disk, never bytes in the terminal.
      const payload = result as StudyImagePayload;
      const dir = path.resolve(outputDir ?? path.join(process.cwd(), 'imaging-output'));
      const files = await writeStudyImages(payload, dir);
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

/**
 * `--action get-imaging` — every imaging study on the account, downloaded and
 * decoded to JPEGs under `<outputDir>/<hostname>/`, with the full result
 * metadata (reports included) saved as `all-imaging.json`.
 *
 * This is the one dashed action that is a composite rather than an alias: it
 * chains `get_imaging_results` into one `download_imaging_study` per study.
 * Both steps go through `executeCapability`, so the active-patient guard
 * applies to each — this used to be a 220-line hand-written handler that
 * fetched around the guard entirely.
 */
export async function downloadAllImagingStudies(
  session: { hostname: string; request: MyChartRequest },
  password: string | undefined,
  options: { outputDir?: string; patient?: string; saveClo?: boolean } = {},
): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}\n  Imaging: ${session.hostname}\n${'='.repeat(60)}`);
  try {
    const ctx = await capabilityContext(session.hostname, password);
    const patientArg = options.patient !== undefined ? { patient: options.patient } : {};
    const results = (await executeCapability(
      session.request,
      'get_imaging_results',
      { ...patientArg },
      ctx,
    )) as Array<{ orderName?: string; image_id?: string }>;

    const hostDir = path.resolve(
      options.outputDir ?? path.join(process.cwd(), 'imaging-output'),
      session.hostname,
    );
    await fs.promises.mkdir(hostDir, { recursive: true });
    const metadataPath = path.join(hostDir, 'all-imaging.json');
    await fs.promises.writeFile(metadataPath, JSON.stringify(results, jsonSafeReplacer, 2));
    console.log(`  ${results.length} imaging result(s); metadata and reports in ${metadataPath}`);

    let ok = true;
    for (const study of results) {
      // No image_id means no viewable pictures — the report text is already
      // in all-imaging.json, so there is nothing more to download.
      if (!study.image_id) continue;
      try {
        const payload = (await executeCapability(
          session.request,
          'download_imaging_study',
          { ...patientArg, image_id: study.image_id, study_name: study.orderName },
          ctx,
        )) as StudyImagePayload;
        const files = await writeStudyImages(payload, hostDir, { saveClo: options.saveClo });
        console.log(`  ${payload.studyName}: wrote ${files.length} of ${payload.totalImages} image(s)`);
        for (const message of payload.errors) console.log(`    warning: ${message}`);
        if (files.length === 0 && payload.errors.length > 0) ok = false;
      } catch (err) {
        console.log(`  ${study.orderName ?? 'study'}: ${(err as Error).message}`);
        ok = false;
      }
    }
    return ok;
  } catch (err) {
    console.log(`  ${(err as Error).message}`);
    return false;
  }
}
