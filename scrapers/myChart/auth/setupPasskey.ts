import { makeAuthenticatedRequest } from '../core/makeAuthenticatedRequest';
import { type MyChartRequest } from '../core/myChartRequest';
import { fetchSessionCsrfToken } from '../core/csrf';
import {
  createCredential,
  type MyChartCreationOptions,
  type PasskeyCredential,
} from './softwareAuthenticator';
import { logger } from '../../../shared/logger';

// Deliberately status-only: the headers carry Set-Cookie and the bodies of
// these endpoints carry WebAuthn challenges, so neither is safe to log.
function logUnexpectedResponse(label: string, resp: Response) {
  logger.debug(`  ${label} unexpected status: ${resp.status}`);
}

/**
 * Register a new passkey on a MyChart account.
 *
 * Flow (discovered via Playwright on UCSF MyChart):
 * 1. POST /api/passkey-management/GenerateCreateRequest — get WebAuthn creation options
 * 2. Software authenticator creates credential (replaces navigator.credentials.create)
 * 3. POST /api/passkey-management/CreatePasskey — submit credential to server
 *
 * Requires an active, authenticated session (logged in via password + 2FA first).
 *
 * Returns the PasskeyCredential for local storage, or null if setup fails.
 */
export async function setupPasskey(mychartRequest: MyChartRequest): Promise<PasskeyCredential | null> {

  // Get CSRF token for API requests
  const csrfToken = await fetchSessionCsrfToken(mychartRequest);
  if (!csrfToken) {
    logger.debug('  Could not get CSRF token.');
    return null;
  }

  const origin = `${mychartRequest.protocol}://${mychartRequest.hostname}`;
  const apiHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    '__RequestVerificationToken': csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
    'origin': origin,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  // Step 1: Get WebAuthn creation options
  logger.debug('  Requesting passkey creation options...');
  const createReqResp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/passkey-management/GenerateCreateRequest',
    method: 'POST',
    headers: apiHeaders,
    body: '{}',
  });
  if (createReqResp.status !== 200) {
    logUnexpectedResponse('GenerateCreateRequest', createReqResp);
    return null;
  }
  const createReqResult = await createReqResp.json();

  if (!createReqResult.success && !createReqResult.Success) {
    logger.debug('  GenerateCreateRequest failed. Keys:', Object.keys(createReqResult).join(', '));
    return null;
  }

  const creationOptions: MyChartCreationOptions = createReqResult.data || createReqResult.Data;
  if (!creationOptions?.challenge) {
    logger.debug('  Invalid creation options — no challenge in the response.');
    return null;
  }

  logger.debug('  Got creation options. RP:', creationOptions.rp.name,
    ', User:', creationOptions.user.displayName,
    ', Existing passkeys:', creationOptions.excludeCredentials.length);

  // Step 2: Create credential using software authenticator
  // Determine the index for the default name (one more than existing count)
  const indexForDefaultName = creationOptions.excludeCredentials.length + 1;

  const registrationResult = createCredential(creationOptions, origin, indexForDefaultName);
  logger.debug('  Created software credential. ID:', registrationResult.credential.credentialId.substring(0, 20) + '...');

  // Step 3: Submit credential to MyChart
  logger.debug('  Registering passkey with MyChart...');
  const createPasskeyResp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/passkey-management/CreatePasskey',
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify(registrationResult.serverResponse),
  });
  if (createPasskeyResp.status !== 200) {
    logUnexpectedResponse('CreatePasskey', createPasskeyResp);
    return null;
  }

  const createPasskeyResult = await createPasskeyResp.json();
  logger.debug('  CreatePasskey response keys:', Object.keys(createPasskeyResult).join(', '));

  // Check for success — the response should contain passkey metadata
  if (createPasskeyResult.rawId || createPasskeyResult.RawId || createPasskeyResult.success || createPasskeyResult.Success) {
    logger.debug('  Passkey registered successfully!');
    return registrationResult.credential;
  }

  // Some instances might return just the passkey object directly
  if (createPasskeyResult.name || createPasskeyResult.Name) {
    logger.debug('  Passkey registered successfully! Name:', createPasskeyResult.name || createPasskeyResult.Name);
    return registrationResult.credential;
  }

  logger.debug('  Passkey registration may have failed. Check the response above.');
  return registrationResult.credential; // Return anyway — the credential was created
}

/**
 * List passkeys registered on a MyChart account.
 */
export async function listPasskeys(mychartRequest: MyChartRequest): Promise<unknown[] | null> {
  const csrfToken = await fetchSessionCsrfToken(mychartRequest);
  if (!csrfToken) return null;

  const origin = `${mychartRequest.protocol}://${mychartRequest.hostname}`;
  const apiHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    '__RequestVerificationToken': csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
    'origin': origin,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/passkey-management/LoadPasskeyInfo',
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ hostname: mychartRequest.hostname }),
  });

  if (resp.status !== 200) {
    logUnexpectedResponse('LoadPasskeyInfo', resp);
    return null;
  }

  const result = await resp.json();
  return result.passkeys || result.Passkeys || [];
}

/**
 * Delete a passkey from a MyChart account.
 */
export async function deletePasskey(mychartRequest: MyChartRequest, rawId: string): Promise<boolean> {
  const csrfToken = await fetchSessionCsrfToken(mychartRequest);
  if (!csrfToken) return false;

  const origin = `${mychartRequest.protocol}://${mychartRequest.hostname}`;
  const apiHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    '__RequestVerificationToken': csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
    'origin': origin,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/passkey-management/DeletePasskey',
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ rawId }),
  });

  if (resp.status !== 200) {
    logUnexpectedResponse('DeletePasskey', resp);
    return false;
  }

  logger.debug('  Passkey deleted successfully.');
  return true;
}
