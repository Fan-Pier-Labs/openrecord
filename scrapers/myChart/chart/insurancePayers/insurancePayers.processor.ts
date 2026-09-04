/**
 * Insurance payer catalogue processor. Field decisions: docs/processor-layer-proposal.md,
 * `get_insurance_payers`.
 *
 * The scraper records `POST /Insurance/Coverages/GetPayors`. Payers pass
 * through under MyChart's own `Payors` name with MyChart's own field names and
 * values; `requiredFields` / `optionalFields` are derived from `Fields`.
 *
 * A response without a `Payors` array THROWS, and so does the **empty body**
 * MyChart answers an unrecognized encounter context with — a 200 with no
 * content type at all, which `JSON.parse` never sees and a status check never
 * catches. Both would otherwise render as "this organization accepts no
 * insurance", which is the same class of silent-empty failure that got the
 * first care-team scraper withdrawn (#313).
 *
 * `Fields` maps a coverage-form field name to 1 (shown, optional) or 2 (shown,
 * required): the legacy controller reads `> 0` to show a field and `> 1` to
 * require it (`_buildFieldsViewModelFromPayor`). The map passes through as
 * MyChart sent it; the two derived lists name what those numbers mean, and a
 * level of 0 appears in neither.
 *
 * `SortKey` and `NameUTF8` (null on every entry of all four captured
 * instances) and `SampleCardImages` (empty on every entry of all four) are not
 * surfaced: always empty, so their shapes are unknown.
 */

import { findRequest, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, num, rec, textOrNull } from '../../processors/read';

export const GET_PAYORS_PATH = '/Insurance/Coverages/GetPayors';

export interface InsurancePayerStandard {
  /** Opaque `WP-` catalogue id, unique to this organization. Not parseable. */
  ID: string | null;
  Name: string | null;
  /** Coverage-form field name → 1 (shown, optional) or 2 (shown, required), as MyChart sent it. */
  Fields: Record<string, number>;
  /** Derived from `Fields`: the fields MyChart requires for this payer (level 2). */
  requiredFields: string[];
  /** Derived from `Fields`: the fields MyChart shows but does not require (level 1). */
  optionalFields: string[];
  /** Whether MyChart accepts an insurance-card image for this payer. */
  CanUpload: boolean | null;
  /** A free-text payer the organization has not configured. False on every captured entry. */
  IsNonConfiguredPayer: boolean | null;
}

export interface InsurancePayersStandard {
  Payors: InsurancePayerStandard[];
}

/** `Fields` with non-numeric and level-0 entries dropped: 0 means MyChart does not show the field. */
function fieldLevels(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, level] of Object.entries(rec(value))) {
    const parsed = num(level);
    if (parsed !== null && parsed > 0) out[name] = parsed;
  }
  return out;
}

function payer(value: unknown): InsurancePayerStandard {
  const p = rec(value);
  const Fields = fieldLevels(p.Fields);
  return {
    ID: textOrNull(p.ID),
    Name: textOrNull(p.Name),
    Fields,
    requiredFields: Object.keys(Fields).filter((name) => Fields[name]! > 1),
    optionalFields: Object.keys(Fields).filter((name) => Fields[name]! === 1),
    CanUpload: boolOrNull(p.CanUpload),
    IsNonConfiguredPayer: boolOrNull(p.IsNonConfiguredPayer),
  };
}

export const insurancePayersProcessor: Processor<InsurancePayersStandard> = {
  standard(raw: RawResponse): InsurancePayersStandard {
    const record = findRequest(raw, 'Insurance/Coverages/GetPayors');
    if (!record || record.status < 200 || record.status >= 300) {
      throw new Error(`${GET_PAYORS_PATH} returned HTTP ${record?.status ?? 'nothing'}`);
    }

    // An unrecognized encounter context is answered with a 200 and an empty
    // body — no error, no content type. `send` records that as the empty
    // string, which is neither an envelope nor a failure a status check sees.
    if (record.body === '') {
      throw new Error(
        `${GET_PAYORS_PATH} returned an empty body, which is how MyChart answers an ` +
          'unrecognized encounter context. Refusing to report an empty payer catalogue from it.',
      );
    }

    const payors = rec(record.body).Payors;
    if (!Array.isArray(payors)) {
      throw new Error(
        `${GET_PAYORS_PATH} returned no Payors array. Refusing to report an empty payer ` +
          'catalogue from a response shape we don\'t recognize (the session may have expired, ' +
          'or this instance does not serve the Insurance activity).',
      );
    }

    return { Payors: payors.map(payer) };
  },

  concise(standard) {
    return {
      Payors: standard.Payors.map((p) => ({
        Name: p.Name,
        requiredFields: p.requiredFields,
        IsNonConfiguredPayer: p.IsNonConfiguredPayer,
      })),
    };
  },
};
