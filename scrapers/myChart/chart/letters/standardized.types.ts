/**
 * What the `letters` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

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
