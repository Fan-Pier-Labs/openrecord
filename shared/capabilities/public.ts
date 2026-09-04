/**
 * Capabilities that need no MyChart account at all.
 *
 * Two questions, asked by every client before it dispatches, and by the parity
 * test that checks they all ask them. They live in their own module rather
 * than in `index.ts` so `registry/` and `params.ts` can import them without
 * importing the registry that imports `registry/`.
 */

import type { Capability } from './types';

/**
 * Whether this capability runs with no MyChart account.
 *
 * A public capability takes no `account` parameter, needs no session, and must
 * not be run once per connected account the way every other capability is.
 */
export function isPublicCapability(capability: Capability): boolean {
  return capability.kind === 'public';
}

/**
 * Whether this capability takes `ACCOUNT_PARAM`.
 *
 * Every capability that touches MyChart does; the `public` ones do not, and
 * offering it on them would be worse than noise — a model told a tool takes an
 * `account` will ask a person to connect one before it will look up an NPI.
 */
export function acceptsAccountParam(capability: Capability): boolean {
  return !isPublicCapability(capability);
}
