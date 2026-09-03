/**
 * Referrals processor. Field decisions: docs/processor-layer-proposal.md, `get_referrals`.
 *
 * `dte` (Epic day count of `creationDate`) is internal; `canSendMessage` and
 * `shouldRedirect` are page config. Everything else on the captured element
 * is kept under MyChart's own names.
 */

import { bodyOf, type RawResponse } from '../core/rawResponse';
import type { Processor } from '../processors/processor';
import { boolOrNull, list, rec, textOrNull } from '../processors/read';

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

export const referralsProcessor: Processor<ReferralsStandard> = {
  standard(raw: RawResponse): ReferralsStandard {
    const body = rec(bodyOf(raw, 'listReferrals'));
    return {
      canSeeAuthorizations: boolOrNull(body.canSeeAuthorizations),
      referralList: list(body.referralList).map((value) => {
        const r = rec(value);
        return {
          statusString: textOrNull(r.statusString),
          status: textOrNull(r.status),
          referredToProviderName: textOrNull(r.referredToProviderName),
          referredToFacility: textOrNull(r.referredToFacility),
          referredByProviderName: textOrNull(r.referredByProviderName),
          start: textOrNull(r.start),
          end: textOrNull(r.end),
          creationDate: textOrNull(r.creationDate),
          internalId: textOrNull(r.internalId),
          externalId: textOrNull(r.externalId),
        };
      }),
    };
  },
  concise(standard) {
    return {
      referralList: standard.referralList.map((r) => ({
        statusString: r.statusString,
        referredToProviderName: r.referredToProviderName,
        referredToFacility: r.referredToFacility,
        referredByProviderName: r.referredByProviderName,
        start: r.start,
        end: r.end,
      })),
    };
  },
};
