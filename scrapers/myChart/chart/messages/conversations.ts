import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../../core/myChartRequest";
import { getVerificationToken } from './communicationCenterToken';
import { logger } from '../../../../shared/logger';
import { messageBodyToText } from './messageBodyText';

/** Author of a message: staff carry an `empKey`, patient-side viewers a `wprKey`. */
export interface MessageAuthor {
  displayName?: string;
  empKey?: string;
  wprKey?: string;
}

export interface ConversationMessage {
  wmgId?: string;
  /**
   * The message itself. Epic sends HTML here; `listConversations` converts it
   * to text before it reaches a caller, so the two capabilities that read a
   * message never disagree about what a body is.
   */
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

/**
 * Replace each inlined message body with its text, in place.
 *
 * The listing is returned to callers whole — it carries the subject, the name
 * maps and the paging summary, and nothing here reshapes it — so the bodies
 * are converted where they sit. `getConversationMessages` maps the same
 * messages itself and so takes the raw listing, not this one.
 */
function withPlainTextBodies(list: ConversationListResponse): ConversationListResponse {
  for (const conversation of [...(list.conversations ?? []), ...(list.threads ?? [])]) {
    for (const message of conversation.messages ?? []) {
      message.body = messageBodyToText(message.body);
    }
  }
  return list;
}

export async function listConversations(mychartRequest: MyChartRequest): Promise<ConversationListResponse | null> {


  const requestVerificationToken = await getVerificationToken(mychartRequest)

  if (!requestVerificationToken) {
    logger.debug('could not find request verification token')
    return null
  }

  const out = withPlainTextBodies(await fetchConversationList(mychartRequest, requestVerificationToken));

  logger.debug(out)

  return out;
}
