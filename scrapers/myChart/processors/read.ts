/**
 * @deprecated Import from `../core/read` instead. The readers moved down to
 * core so that core's own modules (`dcsDocument.ts`) can use them without
 * importing the processor layer above them; this path is a pass-through kept
 * so the existing importers did not all have to change in the same commit.
 * Repointing them and deleting this file is the follow-up — the deprecation
 * marker is here so a new importer gets flagged in the editor rather than
 * quietly making the shim permanent.
 */
export * from '../core/read';
