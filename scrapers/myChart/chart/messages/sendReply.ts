/**
 * Send a reply to an existing conversation in MyChart.
 *
 * Flow:
 * 1. Get request verification token from /app/communication-center
 * 2. GetConversationDetails - refuse a thread whose replyFlags.canReply is false
 * 3. GetViewers - get patient viewer info (wprId)
 * 4. GetComposeId - get unique compose ID
 * 5. SendReply - send the reply
 * 6. RemoveComposeId - cleanup
 */

import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { getVerificationToken } from './communicationCenterToken';

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
  const res = await makeAuthenticatedRequest(mychartRequest, {
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

/**
 * Why the thread can't take a reply, or `undefined` when it can. MyChart
 * answers SendReply to a closed thread with 200 and an empty id and files
 * nothing, so the check has to happen before the send.
 */
async function replyRefusal(
  mychartRequest: MyChartRequest,
  token: string,
  conversationId: string,
): Promise<string | undefined> {
  // The read endpoints key the thread on `id`, not `conversationId`.
  const result = await makeApiRequest(
    mychartRequest,
    '/api/conversations/GetConversationDetails',
    { id: conversationId, maxReadMessages: 1, PageNonce: '' },
    token,
  );
  if (result.status !== 200) {
    return `Could not read conversation ${conversationId} to check it accepts replies (status ${result.status})`;
  }
  // A literal `null` is MyChart saying the active patient has no such conversation.
  if (result.json === null || typeof result.json !== 'object') {
    return `MyChart has no conversation ${conversationId} on the active patient record — take the id from get_messages`;
  }
  const flags = (result.json as { replyFlags?: { canReply?: unknown } }).replyFlags;
  if (flags?.canReply !== false) return undefined;
  return `MyChart does not accept replies on conversation ${conversationId}. ` +
    'Nothing was sent; send_message starts a new conversation instead.';
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

  // Step 2: Refuse a thread that does not take replies
  const refusal = await replyRefusal(mychartRequest, token, params.conversationId);
  if (refusal) {
    return { success: false, error: refusal };
  }

  // Step 3: Get viewer wprId
  const wprId = await getViewerWprId(mychartRequest, token, organizationId);
  if (!wprId) {
    return { success: false, error: 'Could not get viewer wprId' };
  }

  // Step 4: Get compose ID
  const composeId = await getComposeId(mychartRequest, token);
  if (!composeId) {
    return { success: false, error: 'Could not get compose ID' };
  }

  // Step 5: Send the reply
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

  // Step 6: Cleanup compose ID
  await removeComposeId(mychartRequest, token, composeId);

  if (result.status === 200 && typeof result.json === 'string') {
    return { success: true, conversationId: result.json };
  }

  return {
    success: false,
    error: `Reply failed with status ${result.status}: ${JSON.stringify(result.json)}`,
  };
}
