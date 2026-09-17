/**
 * What the `insurancePayers` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

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
