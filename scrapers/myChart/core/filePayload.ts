/**
 * What a `returnsFile` capability's `run` returns. A capability extends it
 * with what it knows about the file (a message attachment carries its
 * conversation and `dcsId`); clients pass those extra fields through in the
 * summary they show beside the saved path.
 *
 * Defined here rather than beside the capability registry because the
 * scrapers that produce one must not import the registry that lists them.
 */
export interface FilePayload {
  /**
   * A basename safe to create under any directory, with its extension —
   * `safeFileName` in `./safeFileName.ts` makes one.
   */
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}
