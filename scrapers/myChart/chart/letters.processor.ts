/**
 * Letters processors. Field decisions: docs/processor-layer-proposal.md,
 * `get_letters` and `get_letter_details`.
 *
 * `GetLettersList` carries an author directory (`users`, keyed by `empId`)
 * beside the letters; the name is resolved onto each letter as the derived
 * `providerName` and `empId` is kept so the resolution is checkable. `users`
 * itself is not in standard (its other field, `photoUrl`, is an asset).
 * `departments` was `{}` on capture and passes through whole (rule 10).
 *
 * The list is sorted newest first with unparseable dates last — what the
 * scraper did before, now processor work.
 */

import { bodyOf, type RawResponse } from '../core/rawResponse';
import { parseMyChartDate, sortNewestFirstByDate } from '../core/util';
import { htmlToText } from '../processors/htmlText';
import type { Processor } from '../processors/processor';
import { boolOrNull, list, rec, text, textOrNull } from '../processors/read';

export interface LetterStandard {
  hnoId: string | null;
  csn: string | null;
  dateISO: string | null;
  reason: string | null;
  viewed: boolean | null;
  empId: string | null;
  /** Derived: `users[empId].name`. */
  providerName: string | null;
}

export interface LettersStandard {
  letters: LetterStandard[];
  /** Uncaptured (empty on every capture); passed through whole. */
  departments: Record<string, unknown>;
}

export interface LetterDetailsStandard {
  /** Derived: `bodyHTML` as plain text. */
  bodyHTMLText: string;
}

export const lettersProcessor: Processor<LettersStandard> = {
  standard(raw: RawResponse): LettersStandard {
    const body = rec(bodyOf(raw, 'GetLettersList'));
    const users = rec(body.users);
    const letters: LetterStandard[] = list(body.letters).map((entry) => {
      const l = rec(entry);
      const empId = textOrNull(l.empId);
      const user = rec(empId === null ? undefined : users[empId]);
      return {
        hnoId: textOrNull(l.hnoId),
        csn: textOrNull(l.csn),
        dateISO: textOrNull(l.dateISO),
        reason: textOrNull(l.reason),
        viewed: boolOrNull(l.viewed),
        empId,
        providerName: textOrNull(user.name),
      };
    });
    return {
      letters: sortNewestFirstByDate(letters, (l) => parseMyChartDate(l.dateISO)),
      departments: rec(body.departments),
    };
  },
  concise(standard) {
    return {
      letters: standard.letters.map((l) => ({
        hnoId: l.hnoId,
        csn: l.csn,
        dateISO: l.dateISO,
        reason: l.reason,
        viewed: l.viewed,
        providerName: l.providerName,
      })),
    };
  },
};

/** A literal `null` (unknown hnoId) passes through as `null` (rule 7). */
export const letterDetailsProcessor: Processor<LetterDetailsStandard | null> = {
  standard(raw: RawResponse): LetterDetailsStandard | null {
    const body = bodyOf(raw, 'GetLetterDetails');
    if (body === null || body === undefined) return null;
    return { bodyHTMLText: htmlToText(text(rec(body).bodyHTML)) };
  },
  concise(standard) {
    return standard;
  },
};
