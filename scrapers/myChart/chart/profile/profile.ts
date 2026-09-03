import type { MyChartRequest } from '../../core/myChartRequest';
import { makeAuthenticatedRequest, SessionExpiredError, type AuthenticatedRequestOptions } from '../../core/makeAuthenticatedRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { getRequestVerificationTokenFromBody } from '../../core/util';
import { logger } from '../../../../shared/logger';
import { rec, textOrNull } from '../../processors/read';
import { parseProfileHtml, type ProfileData } from './profileHtml';
import { profileProcessor, type ProfileStandard } from './profile.processor';

export { parseProfileHtml, type ProfileData } from './profileHtml';
export type { ProfileStandard, AddressStandard, TemporaryAddressStandard } from './profile.processor';
export { profileProcessor } from './profile.processor';

/**
 * The print-header identity read on its own: name, DOB, MRN, PCP. This is the
 * lightweight primitive the proxy-context verification uses to confirm which
 * patient MyChart is on, so it keeps its historical `null` on a session that
 * could not be renewed rather than throwing mid-verification.
 */
export async function getMyChartProfile(
  mychartRequest: MyChartRequest,
  options?: AuthenticatedRequestOptions,
): Promise<ProfileData | null> {
  // followRedirects: false so a redirect to somewhere other than the login
  // page (some instances bounce /Home through a landing route) can be followed
  // and parsed explicitly. A login redirect is handled by the wrapper — renewed
  // when possible, otherwise surfaced here as the historical `null`.
  let resp: Response;
  try {
    resp = await makeAuthenticatedRequest(mychartRequest, { path: '/Home', followRedirects: false }, options);
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      logger.debug('[profile] Session expired and could not be renewed');
      return null;
    }
    throw error;
  }

  if ([301, 302].includes(resp.status)) {
    const location = resp.headers.get('Location') || '';
    logger.debug(`[profile] /Home returned ${resp.status} → ${location}`);
    // The wrapper only recognizes /Authentication/Login as a session bounce.
    // Keep the historical looser check here too: an instance sending /Home to
    // any login-ish URL means "not signed in", and following it would parse a
    // login page into a bogus profile.
    if (location.toLowerCase().includes('login')) {
      logger.debug('[profile] Session expired — redirected to login page');
      return null;
    }
    // Non-login redirect: follow it and parse
    const followResp = await makeAuthenticatedRequest(
      mychartRequest,
      { url: new URL(location, mychartRequest.protocol + '://' + mychartRequest.hostname).href },
      options,
    );
    const body = await followResp.text();
    logger.debug(`[profile] Followed redirect to ${location}, response URL: ${followResp.url}, status: ${followResp.status}`);
    return parseProfileHtml(body);
  }

  logger.debug(`[profile] /Home returned ${resp.status}, URL: ${resp.url}`);
  const body = await resp.text();
  return parseProfileHtml(body);
}

/**
 * `GET /Home` (the print header) plus `GET /PersonalInformation` for a token
 * and `POST /PersonalInformation/GetContactInformation`. The contact endpoint
 * is missing on some instances, so a failure there is recorded (when there
 * was a response) and otherwise tolerated — the header is the point.
 */
export async function fetchProfileRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  await collector.send({ path: '/Home' });
  try {
    await fetchContactInformation(collector);
  } catch (error) {
    if (error instanceof SessionExpiredError) throw error;
    logger.debug('[profile] contact information unavailable:', (error as Error).message);
  }
  return collector.toRaw();
}

async function fetchContactInformation(collector: RawCollector): Promise<unknown> {
  const page = await collector.send({ path: '/PersonalInformation' });
  const token = getRequestVerificationTokenFromBody(page.text);
  if (!token) {
    logger.debug('could not find request verification token');
    return null;
  }
  const result = await collector.send({
    path: '/PersonalInformation/GetContactInformation?noCache=' + Math.random(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      __RequestVerificationToken: token,
    },
    method: 'POST',
    body: 'useLoginUserEpt=false',
  });
  return result.body;
}

/** The standard object — what `mode: 'json'` returns. */
export async function getProfile(mychartRequest: MyChartRequest): Promise<ProfileStandard> {
  return profileProcessor.standard(await fetchProfileRaw(mychartRequest));
}

/** The account email alone, from `GetContactInformation`; `null` when the endpoint is unavailable. */
export async function getEmail(mychartRequest: MyChartRequest): Promise<string | null> {
  const collector = new RawCollector(mychartRequest);
  const body = await fetchContactInformation(collector);
  return textOrNull(rec(rec(body).SecureCommunicationInfo).EmailAddress);
}
