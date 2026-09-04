/**
 * Insurance processor. Field decisions: docs/processor-layer-proposal.md, `get_insurance`.
 *
 * `GET /Insurance` carries no coverage at all. The page is a shell — its whole
 * body is `<div id="coverages-list"></div>` — and `$$WP.Insurance.CoveragesController`
 * in `bundles/insurance-controllers` fills it from:
 *
 *   POST /Insurance/Coverages/GetCoverages   → { ActiveCoverages: [...], … }
 *
 * form-encoded, with the antiforgery token off the `/Insurance` page. The
 * scraper that read the page's markup could therefore only ever return an
 * empty list from a real instance, whatever the patient's coverage was; the
 * selectors it used (`.coverage-card`, `.plan-name`, `.member-id`) exist
 * nowhere in Epic's markup and were written against the fake.
 *
 * Captured on four live instances (three November 2025, one August 2025). The
 * coverage element's field set was identical on all four, and one of the four
 * genuinely has no coverage on file — which is how the difference between "no
 * coverage" and "we could not read the page" is now an observed distinction
 * rather than a guess about a sentence in some HTML.
 *
 * MyChart returns coverages in five buckets by where they are in the
 * submission workflow. They are kept apart rather than concatenated: a
 * coverage waiting to be verified by the organization is not one a clinic can
 * bill today, and flattening them is how a pending card reads as active.
 *
 * Each coverage passes through whole with `bucket` added. The interface names
 * the keys the captures showed, but nothing is dropped for being empty on
 * them: four accounts that never uploaded an insurance card say nothing about
 * whether `FrontDocument` is ever populated, and `standard` is not the place to
 * decide a caller does not need the card image, the FHIR id or a date of birth.
 */

import { findRequest, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { boolOrNull, num, rec, textOrNull } from '../../processors/read';

export const GET_COVERAGES_PATH = '/Insurance/Coverages/GetCoverages';

/** The five buckets `GetCoverages` splits its coverages into, in MyChart's own order. */
export const COVERAGE_BUCKETS = [
  'ActiveCoverages',
  'CoveragesPendingSubmission',
  'CoveragesPendingDeletion',
  'CoveragesInReview',
  'CoveragesInVerification',
] as const;

export type CoverageBucket = (typeof COVERAGE_BUCKETS)[number];

/**
 * A coverage as MyChart sent it, plus `bucket`.
 *
 * The named keys are the ones the captures showed and the README documents;
 * the index signature is the rest of the element, passed through untouched.
 * Nothing is dropped for being empty on the four captured accounts — none of
 * them had uploaded a card image, which is not evidence that `FrontDocument`
 * is always null, and `CoverageFHIRId` (the join key to anything FHIR-shaped)
 * and the subscriber/member dates of birth are not the processor's to withhold.
 */
export interface InsuranceCoverageStandard extends Record<string, unknown> {
  /** Opaque `WP-` coverage id. Not parseable. */
  CoverageId: string | null;
  /** The card's display name — usually "payer (plan)". */
  CoverageName: string | null;
  /** Payer, and the plan under it. `PlanName` is empty on some instances even when a plan exists. */
  PayorId: string | null;
  PayorName: string | null;
  PlanName: string | null;
  /** Who holds the policy. `SubscriberIsSelf` says whether that is the patient. */
  SubscriberId: string | null;
  SubscriberName: string | null;
  SubscriberIsSelf: boolean | null;
  /** What a clinic asks for at the desk. */
  MemberId: string | null;
  MemberName: string | null;
  GroupNumber: string | null;
  /** MyChart's own formatted dates, as strings. Empty end date means open-ended. */
  FormattedEffectiveDate: string | null;
  FormattedEndDate: string | null;
  /** Not yet started / already ended. */
  Future: boolean | null;
  Termed: boolean | null;
  /** Free text the organization attached to the coverage. */
  Comments: string | null;
  SuspendedText: string | null;
  /** Numeric codes MyChart does not label anywhere the client can see. Passed through. */
  Status: number | null;
  CoverageType: number | null;
  CvgCoveredStatus: number | null;
  CvgReason: number | null;
  /** Derived: which of the five buckets MyChart returned this coverage in. */
  bucket: CoverageBucket;
}

export interface InsuranceStandard {
  /** Coverages a clinic can bill today. */
  ActiveCoverages: InsuranceCoverageStandard[];
  /** Added in MyChart and not yet submitted to the organization. */
  CoveragesPendingSubmission: InsuranceCoverageStandard[];
  /** Submitted for removal and not yet removed. */
  CoveragesPendingDeletion: InsuranceCoverageStandard[];
  /** Submitted and waiting on a person at the organization. */
  CoveragesInReview: InsuranceCoverageStandard[];
  /** Submitted and waiting on automated verification with the payer. */
  CoveragesInVerification: InsuranceCoverageStandard[];
  /**
   * Derived: no coverage in any of the five buckets. An observed answer, not
   * an inference from page text — MyChart returned five empty arrays.
   */
  hasNoCoverages: boolean;
  /** Whether MyChart is serving a family member's record rather than the account holder's. */
  IsProxyContext: boolean | null;
  /** What this instance lets the patient do with coverages, as MyChart sent it. */
  Settings: Record<string, unknown>;
}

/**
 * The element whole, with `bucket` added — the same pass-through the goals
 * processor uses. The named reads below only normalize the documented keys to
 * `null` when MyChart sent a non-string/number/boolean; every other key MyChart
 * sent survives verbatim, because "empty on four accounts" is not a reason to
 * drop a field (CLAUDE.md) and a card image the caller cannot reach is a field
 * dropped.
 */
function coverage(value: unknown, bucket: CoverageBucket): InsuranceCoverageStandard {
  const c = rec(value);
  return {
    ...c,
    CoverageId: textOrNull(c.CoverageId),
    CoverageName: textOrNull(c.CoverageName),
    PayorId: textOrNull(c.PayorId),
    PayorName: textOrNull(c.PayorName),
    PlanName: textOrNull(c.PlanName),
    SubscriberId: textOrNull(c.SubscriberId),
    SubscriberName: textOrNull(c.SubscriberName),
    SubscriberIsSelf: boolOrNull(c.SubscriberIsSelf),
    MemberId: textOrNull(c.MemberId),
    MemberName: textOrNull(c.MemberName),
    GroupNumber: textOrNull(c.GroupNumber),
    FormattedEffectiveDate: textOrNull(c.FormattedEffectiveDate),
    FormattedEndDate: textOrNull(c.FormattedEndDate),
    Future: boolOrNull(c.Future),
    Termed: boolOrNull(c.Termed),
    Comments: textOrNull(c.Comments),
    SuspendedText: textOrNull(c.SuspendedText),
    Status: num(c.Status),
    CoverageType: num(c.CoverageType),
    CvgCoveredStatus: num(c.CvgCoveredStatus),
    CvgReason: num(c.CvgReason),
    bucket,
  };
}

export const insuranceProcessor: Processor<InsuranceStandard> = {
  standard(raw: RawResponse): InsuranceStandard {
    const record = findRequest(raw, GET_COVERAGES_PATH);
    if (!record || record.status < 200 || record.status >= 300) {
      throw new Error(`${GET_COVERAGES_PATH} returned HTTP ${record?.status ?? 'nothing'}`);
    }

    // The same 200-with-an-empty-body an unrecognized encounter context gets
    // from the sibling GetPayors endpoint on this controller. It is not an
    // error and it is not "no coverage on file"; reporting it as the latter is
    // the whole failure this capability exists to avoid.
    if (record.body === '') {
      throw new Error(
        `${GET_COVERAGES_PATH} returned an empty body, which is how MyChart answers an ` +
          'unrecognized encounter context. Refusing to report "no insurance on file" from it.',
      );
    }

    const envelope = rec(record.body);
    // Every bucket is an array on a real response, including on the captured
    // account with no coverage at all. None of them being an array means the
    // session expired into the login page, or this instance does not serve the
    // Insurance activity — neither of which is an answer about insurance.
    if (!COVERAGE_BUCKETS.some((bucket) => Array.isArray(envelope[bucket]))) {
      throw new Error(
        `${GET_COVERAGES_PATH} returned none of the coverage lists (${COVERAGE_BUCKETS.join(', ')}). ` +
          'Refusing to report "no insurance on file" from a response shape we don\'t recognize.',
      );
    }

    const buckets = Object.fromEntries(
      COVERAGE_BUCKETS.map((bucket) => {
        const value = envelope[bucket];
        return [bucket, (Array.isArray(value) ? value : []).map((c) => coverage(c, bucket))];
      }),
    ) as Record<CoverageBucket, InsuranceCoverageStandard[]>;

    return {
      ...buckets,
      hasNoCoverages: COVERAGE_BUCKETS.every((bucket) => buckets[bucket].length === 0),
      IsProxyContext: boolOrNull(envelope.IsProxyContext),
      Settings: rec(envelope.Settings),
    };
  },

  concise(standard) {
    const brief = (c: InsuranceCoverageStandard) => ({
      CoverageName: c.CoverageName,
      PayorName: c.PayorName,
      MemberId: c.MemberId,
      GroupNumber: c.GroupNumber,
      FormattedEffectiveDate: c.FormattedEffectiveDate,
      bucket: c.bucket,
    });
    return {
      // One list in concise: which bucket a coverage came from rides on the
      // coverage, so four empty headings do not crowd out the one that matters.
      coverages: COVERAGE_BUCKETS.flatMap((bucket) => standard[bucket].map(brief)),
      hasNoCoverages: standard.hasNoCoverages,
    };
  },
};
