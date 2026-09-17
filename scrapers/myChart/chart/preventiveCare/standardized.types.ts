/**
 * What the `preventiveCare` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

/**
 * `StatusCode` normalized. The nine codes are the client's own switch; the
 * four marked below are the ones seen on the wire, and an unrecognized or
 * custom code (Epic's `<code>^<display text>` form) comes out `unknown` rather
 * than being guessed at.
 */
export type PreventiveCareStatus =
  | 'overdue' // 100_OVERDUE — observed
  | 'due'
  | 'due_soon'
  | 'postponed'
  | 'not_due' // 500_NOTDUE — observed
  | 'addressed'
  | 'satisfied' // 700_SATISFIED — observed
  | 'aged_out' // 800_AGED_OUT — observed
  | 'excluded'
  | 'unknown';

/** A topic as MyChart sent it, plus the one field this processor computes. */
export type PreventiveCareItemStandard = Record<string, unknown> & { dueStatus: PreventiveCareStatus };

export interface PreventiveCareStandard {
  /** `HealthAdvisoryViewModelList`, pass-through, each with a derived `dueStatus`. */
  items: PreventiveCareItemStandard[];
  /** `HealthAdvisorySettings`, pass-through. */
  settings: Record<string, unknown>;
  /**
   * Derived: what did not answer, by path. Non-empty means the item list is
   * "not known", not "empty" — see the note above.
   */
  unavailable: string[];
}
