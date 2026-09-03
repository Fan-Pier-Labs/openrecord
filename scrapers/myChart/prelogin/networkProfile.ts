/**
 * One hostname in, the health system's public profile out.
 *
 * Runs the three pre-login scrapers under one discovered mount:
 *
 *   1. {@link parseOrgProfile} on the login page — org name, portal brand,
 *      support lines, support email.
 *   2. {@link fetchProviderDirectory} — specialties, bookable providers,
 *      clinics with addresses, and the portal's feature flags.
 *   3. {@link fetchBillingEntities} — billing entities and their facilities.
 *
 * The contact profile is the one part that must work: a host that serves no
 * login page is not a MyChart instance and the call throws. The other two are
 * features an organization can switch off, so each fails on its own into
 * `warnings` and the rest of the profile still comes back.
 *
 * Nothing here sends a credential. Every request is one an anonymous browser
 * makes by opening the portal.
 */

import { determineFirstPathPart } from '../auth/login';
import { MyChartRequest } from '../core/myChartRequest';
import { logger } from '../../../shared/logger';
import { fetchBillingEntities } from './guestEstimates';
import { hasOrgProfile, parseOrgProfile } from './orgProfile';
import { openPreloginPage } from './preloginSession';
import { fetchProviderDirectory, type ProviderDirectoryOptions } from './providerDirectory';
import type { HospitalNetworkProfile } from './types';

export const LOGIN_PAGE_PATH = '/Authentication/Login';

export const INSURANCE_GATE_REASON =
  'The accepted-insurance list is the last step of the guest price-estimate flow, behind a ' +
  'price-transparency disclaimer whose accept step is protected by reCAPTCHA. It is not scraped. ' +
  "A signed-in account can read the organization's payer catalogue instead: the get_insurance_payers " +
  'capability, which is the same list the Add Coverage form offers and is identical for every ' +
  'patient on the instance.';

export type NetworkProfileOptions = ProviderDirectoryOptions & {
  /** `http` for a local fake-mychart; defaults to https. */
  protocol?: string;
  /** Skip the provider/clinic crawl (the largest part by far). Default true. */
  includeProviders?: boolean;
  /** Skip the billing entities. Default true. */
  includeBilling?: boolean;
};

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the profile for `hostname`. Accepts a bare host, a host with a mount
 * prefix, or a full login URL — whatever a user pasted.
 */
export async function fetchHospitalNetworkProfile(
  hostname: string,
  options: NetworkProfileOptions = {},
): Promise<HospitalNetworkProfile> {
  const request = new MyChartRequest(hostname, options.protocol ? { protocol: options.protocol } : undefined);
  await determineFirstPathPart(request);

  const login = await openPreloginPage(request, LOGIN_PAGE_PATH);
  if (!hasOrgProfile(login.html)) {
    throw new Error(
      `${request.hostname} did not serve a MyChart login page at ` +
        `${request.firstPathPart ? '/' + request.firstPathPart : ''}${LOGIN_PAGE_PATH} — is it a MyChart instance?`,
    );
  }
  const profile = parseOrgProfile(login.html);
  const warnings: string[] = [];

  const [directory, billingEntities] = await Promise.all([
    options.includeProviders === false
      ? Promise.resolve(null)
      : fetchProviderDirectory(request, options).catch((err: unknown) => {
          logger.debug('provider directory unavailable on', request.hostname, err);
          warnings.push(`Provider directory unavailable: ${describe(err)}`);
          return null;
        }),
    options.includeBilling === false
      ? Promise.resolve(null)
      : fetchBillingEntities(request).catch((err: unknown) => {
          logger.debug('billing entities unavailable on', request.hostname, err);
          warnings.push(`Billing entities unavailable: ${describe(err)}`);
          return null;
        }),
  ]);

  return {
    hostname: request.hostname,
    mount: request.firstPathPart,
    profile,
    directory,
    billingEntities,
    insurance: { status: 'gated', reason: INSURANCE_GATE_REASON },
    warnings,
  };
}
