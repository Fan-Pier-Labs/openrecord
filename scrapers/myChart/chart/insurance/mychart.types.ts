/**
 * Raw MyChart responses for the `insurance` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** Repeated shape. Appears in: chart/insurance. */
export type ActiveCoverage = {
  CoverageId?: string;
  CoverageName?: string;
  Index?: string;
  Status?: number;
  CoverageType?: number;
  PayorId?: string;
  PayorName?: string;
  PlanName?: string;
  SubscriberId?: string;
  SubscriberName?: string;
  SubscriberFirstName?: string;
  SubscriberLastName?: string;
  SubscriberDateOfBirth?: unknown;
  SubscriberIsSelf?: boolean;
  MemberId?: string;
  MemberName?: string;
  MemberFirstName?: unknown;
  MemberLastName?: unknown;
  MemberDateOfBirth?: unknown;
  GroupNumber?: string;
  Comments?: string;
  PatientIsSubscriber?: unknown;
  FrontDocument?: unknown;
  BackDocument?: unknown;
  IsCoverageDocumentFromPayer?: unknown;
  CvgCoveredStatus?: number;
  CvgReason?: number;
  FormattedEffectiveDate?: string;
  FormattedEndDate?: string;
  Future?: boolean;
  Termed?: boolean;
  PbiId?: string;
  SuspendedText?: string;
  CoverageFHIRId?: string;
  OrganizationId?: string;
};

/** `so they are the same type by construction rather than by observation.` */
export type InsuranceGetCoverages = {
  ActiveCoverages?: ActiveCoverage[];
  CoveragesPendingSubmission?: ActiveCoverage[];
  CoveragesPendingDeletion?: ActiveCoverage[];
  CoveragesInReview?: ActiveCoverage[];
  CoveragesInVerification?: ActiveCoverage[];
  IsProxyContext?: boolean;
  Settings?: {
    IsStandAlone?: boolean;
    CanUpdate?: boolean;
    CanViewDetails?: boolean;
    CanPayPremium?: boolean;
    CanViewInsHub?: boolean;
    IsInsHubOn?: boolean;
  };
  HasExistingCoveragesInRTE?: boolean;
};
