/**
 * What the `notes` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface VisitNoteStandard {
  hnoID: string | null;
  hnoDAT: string | null;
  displayName: string | null;
  iso: string | null;
  provider: { name: string | null; magicID: string | null };
  isAddendum: boolean | null;
  isNoteSensitive: boolean | null;
  /** Uncaptured element shape; passed through whole. */
  attachments: unknown[];
}

export interface VisitNotesStandard {
  /** Derived: the CSN the request asked about. */
  csn: string;
  lrpID: string | null;
  depPhoneNumber: string | null;
  isAtLeastOneNoteSensitive: boolean | null;
  noteList: VisitNoteStandard[];
}

export interface NoteContentStandard {
  /** Derived: `reportContent` as plain text. */
  reportContentText: string;
}
