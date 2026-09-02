import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { getRequestVerificationTokenFromBody } from '../../core/util';

/**
 * Fetch the request verification token that every `/api/conversations/*` and
 * `/api/medicaladvicerequests/*` POST has to carry, by loading the communication
 * center page it is embedded in.
 *
 * Leaf module on purpose: every messaging module needs this, and several of them
 * import each other, so it lives apart from any of them to keep the graph acyclic.
 *
 * Returns undefined when the page has no token — callers decide what that means.
 */
export async function getVerificationToken(mychartRequest: MyChartRequest): Promise<string | undefined> {
  const res = await makeAuthenticatedRequest(mychartRequest, { path: '/app/communication-center' });
  const html = await res.text();
  return getRequestVerificationTokenFromBody(html);
}
