/**
 * What the `referrals` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

export interface ReferralStandard {
  statusString: string | null;
  status: string | null;
  referredToProviderName: string | null;
  referredToFacility: string | null;
  referredByProviderName: string | null;
  start: string | null;
  end: string | null;
  creationDate: string | null;
  internalId: string | null;
  externalId: string | null;
}

export interface ReferralsStandard {
  /** Whether this instance shows authorization detail; explains why authorization fields may be missing. */
  canSeeAuthorizations: boolean | null;
  referralList: ReferralStandard[];
}
