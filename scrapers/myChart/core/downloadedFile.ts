/**
 * One file a capability downloaded whole — a message attachment today. The
 * capability that returns one is flagged `returnsFile` in the registry, and
 * each client decides what to do with the bytes: the extension saves them to
 * a temp file and shows an image inline, the CLI writes them to its output
 * directory, the mobile app keeps an image for the chat.
 */
export interface DownloadedFile {
  /** A safe file name with the right extension — never a path. */
  fileName: string;
  /** The `Content-Type` MyChart sent. */
  mimeType: string;
  /** Byte length of `bytes`. */
  size: number;
  bytes: Uint8Array;
}

/** The extension a file of this type conventionally gets, for a name that has none. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/tiff': 'tif',
  'image/bmp': 'bmp',
  'text/plain': 'txt',
  'text/html': 'html',
  'text/csv': 'csv',
  'application/rtf': 'rtf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function extensionForMime(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType.split(';')[0]!.trim().toLowerCase()] ?? null;
}

/**
 * A name safe to create under any directory: no separators, no control
 * characters, no leading dots, at most 120 characters, and ending in
 * `.<extension>` whatever the caller asked for. `fallback` names the file
 * when the caller gave nothing usable.
 */
export function safeFileName(requested: string | undefined, extension: string, fallback: string): string {
  const cleaned = (requested ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  const base = cleaned || fallback;
  const suffix = `.${extension}`;
  return base.toLowerCase().endsWith(suffix.toLowerCase()) ? base : `${base}${suffix}`;
}
