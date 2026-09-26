/**
 * What the `insurance` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export type CoverageBucket =
  | 'ActiveCoverages'
  | 'CoveragesPendingSubmission'
  | 'CoveragesPendingDeletion'
  | 'CoveragesInReview'
  | 'CoveragesInVerification';

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
