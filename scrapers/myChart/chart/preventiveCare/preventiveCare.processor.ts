/**
 * Preventive care processor. Field decisions: docs/processor-layer-proposal.md, `get_preventive_care`.
 *
 * The payload is `POST /HealthAdvisories/GetTopics`, whose envelope is
 * `{ HealthAdvisoryViewModelList, HealthAdvisorySettings }` — captured live on
 * one instance (`/MyChart-PRD`, 13 topics). Topics pass through whole under a
 * derived `dueStatus`, rather than through a fixed field list: one instance is
 * not enough evidence to fix that list, and a list built from one capture
 * silently drops whatever a second Epic release adds.
 *
 * **`HealthAdvisoryViewModelList` absent is not "no screenings due".** The
 * controller reads a non-empty `Text` as the error surface and a null list as
 * "none" (`healthadvisoriescontroller.min.js`), so a null or empty list is a
 * real answer and anything else — a failed request, an error `Text`, an
 * envelope without the key — is named in `unavailable` instead. That
 * distinction is the whole bug this file was rewritten for: `/HealthAdvisories`
 * is a client-rendered shell (zero `<table>` elements in 111KB of page), and
 * parsing it for a table returned `items: []` for a chart that has 13
 * advisories.
 *
 * There is deliberately no HTML parser here any more. One existed, for "an
 * instance that still renders the table server-side" — but no such instance has
 * ever been seen, so it could only ever produce items from a page shape nobody
 * has captured, which is the same class of answer this file exists to stop
 * making. `unavailable` is the honest answer when the endpoint does not answer.
 * The day a server-rendered instance turns up, its capture says what to write.
 */

import { answered, findRequest, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { list, rec, text } from '../../processors/read';

export const ADVISORIES_PAGE_PATH = '/HealthAdvisories';
export const GET_TOPICS_PATH = '/HealthAdvisories/GetTopics';

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

const STATUS_BY_CODE: Record<string, PreventiveCareStatus> = {
  '100_OVERDUE': 'overdue',
  '200_DUE': 'due',
  '300_DUESOON': 'due_soon',
  '400_POSTPONED': 'postponed',
  '500_NOTDUE': 'not_due',
  '600_ADDRESSED': 'addressed',
  '700_SATISFIED': 'satisfied',
  '800_AGED_OUT': 'aged_out',
  '900_EXCLUDED': 'excluded',
};

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

/** `StatusCode` → {@link PreventiveCareStatus}. Epic's custom `<code>^<text>` form has no known meaning. */
export function statusFromCode(code: unknown): PreventiveCareStatus {
  return STATUS_BY_CODE[text(code).trim().toUpperCase()] ?? 'unknown';
}

/** Concise keeps the screening, where it stands and the two dates that say why. */
const CONCISE_FIELDS = ['Name', 'dueStatus', 'Status', 'FormattedDueDate', 'FormattedLastDoneDate'] as const;

export const preventiveCareProcessor: Processor<PreventiveCareStandard> = {
  standard(raw: RawResponse): PreventiveCareStandard {
    const topics = findRequest(raw, GET_TOPICS_PATH);
    const envelope = answered(topics) ? rec(topics.body) : {};

    // The controller's own test for the error surface: a non-empty `Text`.
    // A successful response carries no `Text` key at all.
    const known =
      answered(topics) && text(envelope.Text).length === 0 && 'HealthAdvisoryViewModelList' in envelope;

    if (!known) return { items: [], settings: {}, unavailable: [GET_TOPICS_PATH] };

    return {
      items: list(envelope.HealthAdvisoryViewModelList).map((topic) => {
        const t = rec(topic);
        return { ...t, dueStatus: statusFromCode(t.StatusCode) };
      }),
      settings: rec(envelope.HealthAdvisorySettings),
      unavailable: [],
    };
  },

  concise(standard) {
    return {
      items: standard.items.map((item) =>
        Object.fromEntries(CONCISE_FIELDS.map((field) => [field, item[field] ?? ''])),
      ),
      unavailable: standard.unavailable,
    };
  },
};
