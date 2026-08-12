import { MyChartRequest } from './myChartRequest';
import { determineFirstPathPart, parseFirstPathPartFromInput } from './login';
import { logger } from '../../shared/logger';

/**
 * Build a {@link MyChartRequest} for the *pre-authentication* flows (signup,
 * account activation, account recovery). These run before the user has a
 * session, so unlike the per-category scrapers they can't be handed an
 * already-logged-in request — they have to bootstrap their own and, crucially,
 * resolve the instance's `firstPathPart` (e.g. `MyChart` vs `MyChart-PRD`) the
 * same way {@link myChartUserPassLogin} does.
 *
 * Mirrors the protocol/firstPathPart bootstrap at the top of
 * `myChartUserPassLogin` so signup/recovery hit the exact same URLs the
 * browser does. Returns `null` if the instance's path can't be resolved.
 */
export async function createPreAuthRequest({
  hostname,
  protocol,
  fetchFn,
}: {
  hostname: string;
  protocol?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}): Promise<MyChartRequest | null> {
  if (!hostname) throw new Error('Missing hostname');

  // Use HTTP for localhost and dot-less hostnames (Docker service names like
  // "fake-mychart:3000"), matching the login bootstrap exactly.
  const hostnameWithoutPort = hostname.split(':')[0];
  const effectiveProtocol =
    protocol ??
    (hostnameWithoutPort === 'localhost' || !hostnameWithoutPort.includes('.')
      ? 'http'
      : 'https');

  const mychartRequest = new MyChartRequest(hostname, { protocol: effectiveProtocol, fetchFn });

  const firstPathPartFromInput = parseFirstPathPartFromInput(hostname);
  if (firstPathPartFromInput) {
    mychartRequest.setFirstPathPart(firstPathPartFromInput);
  }

  const resolved = await determineFirstPathPart(mychartRequest);
  if (!resolved) {
    logger.debug('createPreAuthRequest: could not determine first path part for', hostname);
    return null;
  }
  return mychartRequest;
}
