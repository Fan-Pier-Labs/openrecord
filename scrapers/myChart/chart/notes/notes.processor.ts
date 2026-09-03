/**
 * Visit notes and report content processors. Field decisions:
 * docs/processor-layer-proposal.md, `get_visit_notes` and
 * `get_note_content` / `get_visit_avs`.
 *
 * `GetVisitNotes` answers a literal JSON `null` for an unknown CSN, and
 * `LoadReportContent` does the same for an unknown note; both pass through as
 * `null` (rule 7). MyChart's spelling (`lrpID`, `hnoID`, `hnoDAT`, `magicID`)
 * is kept on every pass-through field (rule 2); the only derived fields are
 * `csn` (the request body's CSN, so the result names its visit) and
 * `reportContentText` (the HTML stripped to text, rule 9).
 */

import { findRequest, type RawResponse } from '../../core/rawResponse';
import { htmlToText } from '../../processors/htmlText';
import type { Processor } from '../../processors/processor';
import { boolOrNull, list, rec, text, textOrNull } from '../../processors/read';

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

export const visitNotesProcessor: Processor<VisitNotesStandard | null> = {
  standard(raw: RawResponse): VisitNotesStandard | null {
    const request = findRequest(raw, 'GetVisitNotes');
    const body = request?.body;
    if (body === null || body === undefined) return null;
    const b = rec(body);
    return {
      csn: text(rec(request?.requestBody).CSN),
      lrpID: textOrNull(b.lrpID),
      depPhoneNumber: textOrNull(b.depPhoneNumber),
      isAtLeastOneNoteSensitive: boolOrNull(b.isAtLeastOneNoteSensitive),
      noteList: list(b.noteList).map((entry) => {
        const n = rec(entry);
        const provider = rec(n.provider);
        return {
          hnoID: textOrNull(n.hnoID),
          hnoDAT: textOrNull(n.hnoDAT),
          displayName: textOrNull(n.displayName),
          iso: textOrNull(n.iso),
          provider: { name: textOrNull(provider.name), magicID: textOrNull(provider.magicID) },
          isAddendum: boolOrNull(n.isAddendum),
          isNoteSensitive: boolOrNull(n.isNoteSensitive),
          attachments: list(n.attachments),
        };
      }),
    };
  },
  concise(standard) {
    if (standard === null) return null;
    return {
      csn: standard.csn,
      lrpID: standard.lrpID,
      noteList: standard.noteList.map((n) => ({
        hnoID: n.hnoID,
        hnoDAT: n.hnoDAT,
        displayName: n.displayName,
        iso: n.iso,
        provider: { name: n.provider.name },
      })),
    };
  },
};

/** Shared by `get_note_content` (OPEN_NOTES) and `get_visit_avs` (AMB_AVS). */
export const noteContentProcessor: Processor<NoteContentStandard | null> = {
  standard(raw: RawResponse): NoteContentStandard | null {
    const body = findRequest(raw, 'LoadReportContent')?.body;
    if (body === null || body === undefined) return null;
    return { reportContentText: htmlToText(text(rec(body).reportContent)) };
  },
  concise(standard) {
    return standard;
  },
};
