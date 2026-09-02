/**
 * Send a new message (medical advice request) to a provider in MyChart.
 *
 * Flow:
 * 1. Get request verification token from /app/communication-center
 * 2. GetSubtopics - get available message topics/categories
 * 3. GetMedicalAdviceRequestRecipients - get list of providers
 * 4. GetViewers - get patient viewer info (wprId)
 * 5. GetComposeId - get unique compose ID
 * 6. SendMedicalAdviceRequest - send the message
 * 7. RemoveComposeId - cleanup
 */

import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from '../../core/myChartRequest';
import { getRequestVerificationTokenFromBody } from '../../core/util';
import { logger } from '../../../../shared/logger';

export type MessageRecipient = {
  recipientType: number;
  displayName: string;
  specialty: string;
  userId: string;
  departmentId: string;
  poolId: string;
  providerId: string;
  organizationId: string;
  pcpTypeDisplayName?: string;
  photoUrl?: string;
  /** Out-of-context flag; absent on most instances, required on some. */
  oocContext?: number;
};

export type MessageTopic = {
  displayName: string;
  value: string;
};

export type SendNewMessageParams = {
  /** The provider to send the message to */
  recipient: MessageRecipient;
  /** The topic/category of the message */
  topic: MessageTopic;
  /** The subject line of the message */
  subject: string;
  /** The message body text */
  messageBody: string;
  /** Organization ID (usually empty string for default org) */
  organizationId?: string;
};

export type SendNewMessageResult = {
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
): Promise<{ status: number; json: unknown; text: string }> {
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
  return { status: res.status, json, text };
}

/** Get the request verification token needed for all API calls */
export async function getVerificationToken(mychartRequest: MyChartRequest): Promise<string | undefined> {
  const res = await makeAuthenticatedRequest(mychartRequest, { path: '/app/communication-center' });
  const html = await res.text();
  return getRequestVerificationTokenFromBody(html);
}

/** Get available message topics/subtopics */
export async function getMessageTopics(
  mychartRequest: MyChartRequest,
  token: string,
  organizationId = '',
): Promise<MessageTopic[]> {
  const result = await makeApiRequest(
    mychartRequest,
    '/api/medicaladvicerequests/GetSubtopics',
    { organizationId },
    token,
  );
  const data = result.json as { topicList?: MessageTopic[] } | null;
  return data?.topicList ?? [];
}

/** Get list of providers who can receive messages */
export async function getMessageRecipients(
  mychartRequest: MyChartRequest,
  token: string,
  organizationId = '',
): Promise<MessageRecipient[]> {
  const result = await makeApiRequest(
    mychartRequest,
    '/api/medicaladvicerequests/GetMedicalAdviceRequestRecipients',
    { organizationId },
    token,
  );
  // Some instances return a bare array; others wrap it in an object.
  if (Array.isArray(result.json)) {
    return result.json as MessageRecipient[];
  }
  const data = result.json as Record<string, unknown> | null;
  const list =
    data?.recipients ??
    data?.recipientList ??
    data?.Providers ??
    data?.providers ??
    data?.ProviderList ??
    data?.providerList;
  return Array.isArray(list) ? (list as MessageRecipient[]) : [];
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

const SEND_PATH = '/api/medicaladvicerequests/SendMedicalAdviceRequest';

/**
 * The body `sendNewMessage` posts to `SEND_PATH`, split out so tests can send
 * the real shape rather than a hand-copied one that drifts from it.
 *
 * `recipientType` and `oocContext` are harmless on instances that ignore them
 * and required on some, so they always go out.
 */
export function buildSendPayload(
  params: SendNewMessageParams,
  session: { wprId: string; composeId: string },
): Record<string, unknown> {
  return {
    recipient: {
      recipientType: params.recipient.recipientType,
      displayName: params.recipient.displayName,
      userId: params.recipient.userId,
      poolId: params.recipient.poolId,
      providerId: params.recipient.providerId,
      departmentId: params.recipient.departmentId,
      oocContext: params.recipient.oocContext ?? 0,
    },
    topic: {
      title: params.topic.displayName,
      value: params.topic.value,
    },
    conversationId: '',
    organizationId: params.organizationId ?? '',
    viewers: [{ wprId: session.wprId }],
    messageBody: [params.messageBody],
    messageSubject: params.subject,
    documentIds: [],
    includeOtherViewers: false,
    composeId: session.composeId,
  };
}

/**
 * Per-instance Epic quirk: the send endpoint answers HTTP 200 with an empty
 * conversation id, and files nothing, for message bodies over this length.
 * Measured, and modelled by fake-mychart — see the behavioral contract in
 * `fake-mychart/README.md`. Other instances may accept more; the
 * 200-without-id branch below still catches any silent drop regardless of
 * cause.
 */
const MAX_MESSAGE_BODY_LENGTH = 500;
/** Cap on raw response-body text kept for diagnostics. */
const MAX_LOGGED_BODY = 2000;

/**
 * Send a new message to a provider.
 *
 * This creates a new conversation (medical advice request). Never reports
 * success without a durable conversation id: some Epic instances answer
 * HTTP 200 with an empty body when they silently drop the request (e.g.
 * under-populated recipient or an over-limit body) — treated as
 * indeterminate, not success, because the caller cannot safely retry.
 */
export async function sendNewMessage(
  mychartRequest: MyChartRequest,
  params: SendNewMessageParams,
): Promise<SendNewMessageResult> {
  if (params.messageBody.length > MAX_MESSAGE_BODY_LENGTH) {
    return {
      success: false,
      error: `Message body is ${params.messageBody.length} characters; an Epic instance we've tested silently drops bodies over ${MAX_MESSAGE_BODY_LENGTH}. Shorten the message or split it into multiple sends.`,
    };
  }
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

  // Step 4: Send the message
  const result = await makeApiRequest(
    mychartRequest,
    SEND_PATH,
    buildSendPayload(params, { wprId, composeId }),
    token,
  );

  // Step 5: Cleanup compose ID
  await removeComposeId(mychartRequest, token, composeId);

  if (result.status === 200 && typeof result.json === 'string' && result.json.length > 0) {
    return { success: true, conversationId: result.json };
  }
  if (result.status === 200) {
    // Some Epic instances answer 200 with an empty string when they silently
    // drop the request (e.g. under-populated recipient). Treat as
    // indeterminate, never success — and log the raw response for debugging.
    const rawBody = result.text.slice(0, MAX_LOGGED_BODY);
    logger.error(
      '[sendMessage] indeterminate send: HTTP 200 without a conversation id. ' +
      `path=${SEND_PATH} ` +
      `body=${JSON.stringify(rawBody)}`,
    );
    return {
      success: false,
      error: 'Send returned HTTP 200 but no conversation id — indeterminate; ' +
        'the message may not exist.',
    };
  }
  return {
    success: false,
    error: `Send failed with status ${result.status}: ` +
      JSON.stringify(result.text.slice(0, MAX_LOGGED_BODY)),
  };
}
