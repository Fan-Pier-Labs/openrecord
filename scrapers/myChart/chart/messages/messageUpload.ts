/**
 * Attaching files to an outgoing message or reply.
 *
 * The portal's composer (`epic.px.client.message-composer` with
 * `epic.px.client.file-upload`) does it in two steps before the send: it
 * checks each file against `GetComposeSettings`' `attachmentSettings`, then
 * posts them as multipart to `DocumentUpload/UploadFile` — mount-relative, not
 * under `/api/` — and puts the `DocumentId` of each into the send body's
 * `documentIds`. The upload fields are the composer's own:
 * `{ isPending: true, addDCSToCache: true, dcsSource: "820" }`.
 */
import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import type { FilePayload } from '../../core/filePayload';

/** `GetComposeSettings`' `attachmentSettings`. File sizes are in KB. */
export interface AttachmentSettings {
  canAttach: boolean;
  maxNumberOfAttachments: number;
  docAndImageSettings: { maxFileSize: number; allowedFileExtensions: string[] };
  videoSettings: { maxFileSize: number; allowedFileExtensions: string[] };
}

export async function getAttachmentSettings(
  mychartRequest: MyChartRequest,
  token: string,
  organizationId = '',
): Promise<AttachmentSettings | undefined> {
  const res = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/conversations/GetComposeSettings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({ organizationId }),
  });
  if (!res.ok) return undefined;
  const data = await res.json().catch(() => null) as { attachmentSettings?: AttachmentSettings } | null;
  return data?.attachmentSettings ?? undefined;
}

// The composer's own filename check: an extension, and none of these.
const FORBIDDEN_NAME_CHARS = /[/\\:*?"<>|]/;

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toUpperCase();
}

/**
 * Why these files can't go on this instance, or undefined when they can.
 * Mirrors the composer's validation, so a file it would refuse is refused here
 * with its reason rather than sent to be rejected by the server.
 */
export function checkAttachments(files: readonly FilePayload[], settings: AttachmentSettings): string | undefined {
  if (!settings.canAttach) return 'This MyChart does not allow attachments on messages.';
  if (files.length > settings.maxNumberOfAttachments) {
    return `This MyChart allows at most ${settings.maxNumberOfAttachments} attachment(s) per message; got ${files.length}.`;
  }
  const docs = settings.docAndImageSettings;
  const videos = settings.videoSettings;
  const allowed = (list: string[]) => list.map((e) => e.toUpperCase());
  const docExts = allowed(docs.allowedFileExtensions);
  const videoExts = allowed(videos.allowedFileExtensions);
  for (const file of files) {
    const ext = extensionOf(file.fileName);
    if (!ext || FORBIDDEN_NAME_CHARS.test(file.fileName)) {
      return `"${file.fileName}" needs a file extension and none of / \\ : * ? " < > | in its name.`;
    }
    const sizeKb = file.bytes.length / 1024;
    const limitKb = docExts.includes(ext) ? docs.maxFileSize : videoExts.includes(ext) ? videos.maxFileSize : undefined;
    if (limitKb === undefined) {
      return `"${file.fileName}": this MyChart accepts only ${[...docExts, ...videoExts].join(', ')} files.`;
    }
    if (sizeKb > limitKb) {
      return `"${file.fileName}" is ${Math.ceil(sizeKb)} KB; this MyChart's limit for ${ext} files is ${limitKb} KB.`;
    }
  }
  return undefined;
}

const encoder = new TextEncoder();

/** A `multipart/form-data` body laid out the way a browser's FormData is. */
export function buildUploadBody(
  files: readonly FilePayload[],
  organizationId: string,
): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const boundary = `----OpenRecordFormBoundary${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const parts: Uint8Array[] = [];
  const quote = (s: string) => s.replace(/["\r\n]/g, (c) => encodeURIComponent(c));

  for (const file of files) {
    parts.push(encoder.encode(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="__file__[]"; filename="${quote(file.fileName)}"\r\n` +
      `Content-Type: ${file.mimeType || 'application/octet-stream'}\r\n\r\n`,
    ));
    parts.push(file.bytes);
    parts.push(encoder.encode('\r\n'));
  }
  const fields: Array<[string, string]> = [
    ['AddDCSToCache', 'true'],
    ['IsPending', 'true'],
    ['DCSSource', '820'],
    ['TargetPatientID', ''],
    ['OrganizationId', organizationId],
  ];
  for (const [name, value] of fields) {
    parts.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(encoder.encode(`--${boundary}--\r\n`));

  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

type UploadResponse = { Success?: boolean; Data?: Array<{ DocumentId?: string }> | null };

function parseUploadResponse(text: string): UploadResponse | null {
  try {
    return JSON.parse(text) as UploadResponse;
  } catch {
    return null;
  }
}

/** Upload files for a message, returning their `DocumentId`s in order. Throws on any failure. */
export async function uploadAttachments(
  mychartRequest: MyChartRequest,
  token: string,
  files: readonly FilePayload[],
  organizationId = '',
): Promise<string[]> {
  const { body, contentType } = buildUploadBody(files, organizationId);
  const res = await makeAuthenticatedRequest(mychartRequest, {
    path: '/DocumentUpload/UploadFile',
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Accept': 'application/json',
      '__RequestVerificationToken': token,
    },
    body,
  });
  const text = await res.text();
  const data = parseUploadResponse(text);
  const ids = (data?.Data ?? []).map((d) => d.DocumentId ?? '');
  if (!res.ok || !data?.Success || ids.length !== files.length || ids.some((id) => !id)) {
    throw new Error(`Attachment upload failed with status ${res.status}: ${JSON.stringify(text.slice(0, 500))}`);
  }
  return ids;
}

/**
 * Check then upload, the composer's order. Returns the `documentIds` for the
 * send body, or the reason nothing was uploaded.
 */
export async function prepareAttachments(
  mychartRequest: MyChartRequest,
  token: string,
  files: readonly FilePayload[],
  organizationId = '',
): Promise<{ documentIds: string[] } | { error: string }> {
  if (files.length === 0) return { documentIds: [] };
  const settings = await getAttachmentSettings(mychartRequest, token, organizationId);
  if (!settings) return { error: 'Could not load this MyChart\'s attachment settings (GetComposeSettings).' };
  const refusal = checkAttachments(files, settings);
  if (refusal) return { error: refusal };
  try {
    return { documentIds: await uploadAttachments(mychartRequest, token, files, organizationId) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
