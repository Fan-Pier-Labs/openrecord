/**
 * Send a reply to an existing conversation in MyChart.
 *
 * Flow:
 * 1. Get request verification token from /app/communication-center
 * 2. GetViewers - get patient viewer info (wprId)
 * 3. GetComposeId - get unique compose ID
 * 4. SendReply - send the reply
 * 5. RemoveComposeId - cleanup
 */

import { MyChartRequest } from '../myChartRequest';
import { getVerificationToken } from './sendMessage';

export type SendReplyParams = {
  /** The conversation ID (hthId) to reply to */
  conversationId: string;
  /** The reply message body text */
  messageBody: string;
  /** Organization ID (usually empty string for default org) */
  organizationId?: string;
};

export type SendReplyResult = {
  success: boolean;
  conversationId?: string;
  error?: string;
};

/** Helper to make authenticated JSON POST requests to MyChart API */
async function makeApiRequest(
  mychartRequest: MyChartRequest,
  path: string,
  body: unknown,
  token: string,
): Promise<{ status: number; json: unknown }> {
  const res = await mychartRequest.makeRequest({
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, json };
}

/** Get the viewer (patient) wprId needed for sending */
async function getViewerWprId(
  mychartRequest: MyChartRequest,
  token: string,
  organizationId = '',
): Promise<string | undefined> {
  const result = await makeApiRequest(
    mychartRequest,
    '/api/medicaladvicerequests/GetViewers',
    { organizationId },
    token,
  );
  const data = result.json as {
    viewers?: Array<{ wprId: string; isSelf: boolean }>;
  } | null;
  const selfViewer = data?.viewers?.find((v) => v.isSelf);
  return selfViewer?.wprId;
}

/** Get a compose ID for a new message */
async function getComposeId(
  mychartRequest: MyChartRequest,
  token: string,
): Promise<string | undefined> {
  const result = await makeApiRequest(
    mychartRequest,
    '/api/conversations/GetComposeId',
    {},
    token,
  );
  if (typeof result.json === 'string') {
    return result.json;
  }
  return undefined;
}

/** Remove a compose ID after sending */
async function removeComposeId(
  mychartRequest: MyChartRequest,
  token: string,
  composeId: string,
): Promise<void> {
  await makeApiRequest(
    mychartRequest,
    '/api/conversations/RemoveComposeId',
    { composeId },
    token,
  );
}

/**
 * Send a reply to an existing conversation.
 */
export async function sendReply(
  mychartRequest: MyChartRequest,
  params: SendReplyParams,
): Promise<SendReplyResult> {
  const organizationId = params.organizationId ?? '';

  // Step 1: Get verification token
  const token = await getVerificationToken(mychartRequest);
  if (!token) {
    return { success: false, error: 'Could not get verification token' };
  }

  // Step 2: Get viewer wprId
  const wprId = await getViewerWprId(mychartRequest, token, organizationId);
  if (!wprId) {
    return { success: false, error: 'Could not get viewer wprId' };
  }

  // Step 3: Get compose ID
  const composeId = await getComposeId(mychartRequest, token);
  if (!composeId) {
    return { success: false, error: 'Could not get compose ID' };
  }

  // Step 4: Send the reply
  const sendBody = {
    conversationId: params.conversationId,
    organizationId,
    viewers: [{ wprId }],
    messageBody: [params.messageBody],
    documentIds: [],
    includeOtherViewers: false,
    composeId,
  };

  const result = await makeApiRequest(
    mychartRequest,
    '/api/conversations/SendReply',
    sendBody,
    token,
  );

  // Step 5: Cleanup compose ID
  await removeComposeId(mychartRequest, token, composeId);

  if (result.status === 200 && typeof result.json === 'string') {
    return { success: true, conversationId: result.json };
  }

  return {
    success: false,
    error: `Reply failed with status ${result.status}: ${JSON.stringify(result.json)}`,
  };
}
