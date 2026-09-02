import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../../core/util";
import { logger } from '../../../../shared/logger';
import { fetchConversationList } from './conversations';
import type { ConversationListResponse, ConversationMessage, MessageAuthor } from './conversations';

export type ThreadMessage = {
  messageId: string;
  senderName: string;
  sentDate: string;
  messageBody: string;
  isFromPatient: boolean;
}

export type ConversationThread = {
  conversationId: string;
  subject: string;
  messages: ThreadMessage[];
}

type GetConversationMessagesResponse = {
  messages?: ConversationMessage[];
}

/** The name maps GetConversationList returns alongside the conversations. */
type ThreadDirectory = {
  users?: Record<string, { name?: string }> | undefined;
  viewers?: Record<string, { name?: string; isSelf?: boolean }> | undefined;
};

/**
 * MyChart identifies a message's author by key, not by role: care-team authors
 * carry an `empKey` and patient-side authors a `wprKey` that appears in the
 * conversation list's `viewers` map. An author with a staff key is never the
 * patient, and one with only a viewer key always is.
 */
function isPatientAuthor(author: MessageAuthor | undefined): boolean {
  return !author?.empKey && !!author?.wprKey;
}

/** displayName is normally set; the key maps are what MyChart's own UI falls back to. */
function senderName(author: MessageAuthor | undefined, directory: ThreadDirectory): string {
  if (author?.displayName) return author.displayName;
  if (author?.empKey) return directory.users?.[author.empKey]?.name ?? '';
  if (author?.wprKey) return directory.viewers?.[author.wprKey]?.name ?? '';
  return '';
}

/** Map one message from MyChart's wire shape to ours. Exported for tests. */
export function toThreadMessage(msg: ConversationMessage, directory: ThreadDirectory = {}): ThreadMessage {
  return {
    messageId: msg.wmgId ?? '',
    senderName: senderName(msg.author, directory),
    sentDate: msg.deliveryInstantISO ?? '',
    messageBody: msg.body ?? '',
    isFromPatient: isPatientAuthor(msg.author),
  };
}

/** The thread's context is a nice-to-have: a failed listing must not lose the messages. */
async function conversationListOrEmpty(
  mychartRequest: MyChartRequest,
  token: string,
): Promise<ConversationListResponse> {
  try {
    return await fetchConversationList(mychartRequest, token);
  } catch (err) {
    logger.debug('Could not load the conversation list for thread context', err);
    return {};
  }
}

export async function getConversationMessages(mychartRequest: MyChartRequest, conversationId: string): Promise<ConversationThread> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/communication-center' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  const empty: ConversationThread = { conversationId, subject: '', messages: [] };

  if (!token) {
    logger.debug('Could not find request verification token for message threads');
    return empty;
  }

  // GetConversationMessages returns the messages and nothing else — no subject,
  // and no way to tell a staff key from a viewer key. The inbox listing carries
  // both, so fetch it alongside.
  const [list, resp] = await Promise.all([
    conversationListOrEmpty(mychartRequest, token),
    makeAuthenticatedRequest(mychartRequest, {
      path: '/api/conversations/GetConversationMessages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        '__RequestVerificationToken': token,
      },
      body: JSON.stringify({ conversationId, PageNonce: "" }),
    }),
  ]);

  const json: GetConversationMessagesResponse = await resp.json();

  const conversation = (list.conversations ?? list.threads ?? []).find((c) => c.hthId === conversationId);
  const directory: ThreadDirectory = { users: list.users, viewers: list.viewers };

  return {
    conversationId,
    subject: conversation?.subject ?? '',
    messages: (json.messages ?? []).map((msg) => toThreadMessage(msg, directory)),
  };
}
