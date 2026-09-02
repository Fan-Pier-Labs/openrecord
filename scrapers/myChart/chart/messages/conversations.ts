import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../../core/util";
import { logger } from '../../../../shared/logger';

/** Author of a message: staff carry an `empKey`, patient-side viewers a `wprKey`. */
export interface MessageAuthor {
  displayName?: string;
  empKey?: string;
  wprKey?: string;
}

export interface ConversationMessage {
  wmgId?: string;
  body?: string;
  deliveryInstantISO?: string;
  author?: MessageAuthor;
}

export interface ConversationEntry {
  hthId?: string;
  subject?: string;
  previewText?: string;
  preview?: string;
  senderName?: string;
  lastMessageDateDisplay?: string;
  audience?: { name: string }[];
  messages?: ConversationMessage[];
  /** Set when the conversation has messages the listing did not inline. */
  hasMoreMessages?: boolean;
  /** Per-conversation display names, keyed by the author's `empKey`. */
  userOverrideNames?: Record<string, string>;
}

export interface ConversationListResponse {
  conversations?: ConversationEntry[];
  threads?: ConversationEntry[];
  users?: Record<string, { name?: string }>;
  viewers?: Record<string, { name?: string; isSelf?: boolean }>;
  [key: string]: unknown;
}

/**
 * Fetch the inbox with a token the caller already has, so a caller that needs
 * both the list and another conversations API doesn't pay for the
 * communication-center page twice.
 */
export async function fetchConversationList(
  mychartRequest: MyChartRequest,
  requestVerificationToken: string,
): Promise<ConversationListResponse> {
  const messages = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/conversations/GetConversationList',
    "headers": {
      "Content-Type": "application/json; charset=utf-8",
      '__RequestVerificationToken': requestVerificationToken,
    },
    "body": JSON.stringify({ "tag": 1, "localLoadParams": { "loadStartInstantISO": "", "loadEndInstantISO": "", "pagingInfo": 1 }, "externalLoadParams": {}, "searchQuery": "", "PageNonce": "" }),
    "method": "POST",
  });

  return await messages.json() as ConversationListResponse;
}

export async function listConversations(mychartRequest: MyChartRequest): Promise<ConversationListResponse | null> {


  // Go to the communication center
  const communicationCenterRes = await makeAuthenticatedRequest(mychartRequest, { path: '/app/communication-center' })
  const requestVerificationToken = getRequestVerificationTokenFromBody(await communicationCenterRes.text())

  if (!requestVerificationToken) {
    logger.debug('could not find request verification token')
    return null
  }

  const out = await fetchConversationList(mychartRequest, requestVerificationToken);

  logger.debug(out)

  return out;
}
