import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../../core/myChartRequest";
import { getVerificationToken } from './communicationCenterToken';
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
  /**
   * MyChart said this conversation has messages beyond the ones here and we
   * could not fetch them. Reported so a reader never presents a partial
   * thread as the whole exchange.
   */
  truncated: boolean;
}

type GetConversationMessagesResponse = {
  messages?: ConversationMessage[];
}

/** The name maps GetConversationList returns alongside the conversations. */
type ThreadDirectory = Pick<ConversationListResponse, 'users' | 'viewers'>;

/**
 * MyChart identifies a message's author by key, not by role: care-team authors
 * carry an `empKey` and patient-side authors a `wprKey` that appears in the
 * conversation list's `viewers` map. An author with a staff key is never the
 * patient, and one with only a viewer key always is.
 */
function isPatientAuthor(author: MessageAuthor | undefined): boolean {
  return !author?.empKey && !!author?.wprKey;
}

/**
 * The key maps are the primary source, not a fallback: on the instances we
 * can check against, every inline message carries an EMPTY `displayName` and
 * the name lives in `users` (staff), `viewers` (patient) or the
 * conversation's own `userOverrideNames`.
 */
function senderName(
  author: MessageAuthor | undefined,
  directory: ThreadDirectory,
  overrideNames?: Record<string, string>,
): string {
  if (author?.displayName) return author.displayName;
  if (author?.empKey) {
    return directory.users?.[author.empKey]?.name ?? overrideNames?.[author.empKey] ?? '';
  }
  if (author?.wprKey) return directory.viewers?.[author.wprKey]?.name ?? '';
  return '';
}

/** Map one message from MyChart's wire shape to ours. Exported for tests. */
export function toThreadMessage(
  msg: ConversationMessage,
  directory: ThreadDirectory = {},
  overrideNames?: Record<string, string>,
): ThreadMessage {
  return {
    messageId: msg.wmgId ?? '',
    senderName: senderName(msg.author, directory, overrideNames),
    sentDate: msg.deliveryInstantISO ?? '',
    messageBody: msg.body ?? '',
    isFromPatient: isPatientAuthor(msg.author),
  };
}

export async function getConversationMessages(mychartRequest: MyChartRequest, conversationId: string): Promise<ConversationThread> {
  const token = await getVerificationToken(mychartRequest);

  const empty: ConversationThread = { conversationId, subject: '', messages: [], truncated: false };

  if (!token) {
    logger.debug('Could not find request verification token for message threads');
    return empty;
  }

  // Two sources, because the one this used to rely on has never been seen to
  // work. GetConversationList inlines each conversation's messages and is the
  // only place the subject and the name maps live. GetConversationMessages is
  // *supposed* to return the full thread, but both instances anyone has
  // checked answer it with 500 "An error has occurred." — every conversation,
  // every body shape and content-type tried — and inline everything in the
  // listing instead. Take whichever gives more.
  const [list, fetched] = await Promise.all([
    fetchConversationList(mychartRequest, token).catch((err: unknown): ConversationListResponse => {
      logger.debug('Could not load the conversation list for thread context', err);
      return {};
    }),
    fetchThreadMessages(mychartRequest, token, conversationId),
  ]);

  const conversation = (list.conversations ?? list.threads ?? []).find((c) => c.hthId === conversationId);
  const inlined = conversation?.messages ?? [];
  const usingInlined = fetched.length <= inlined.length;
  const messages = usingInlined ? inlined : fetched;

  return {
    conversationId,
    subject: conversation?.subject ?? '',
    messages: messages.map((msg) => toThreadMessage(msg, list, conversation?.userOverrideNames)),
    // Only the listing truncates; a full thread from the endpoint is complete.
    truncated: usingInlined && conversation?.hasMoreMessages === true,
  };
}

/**
 * The full thread, or nothing. Both instances checked answer with a 500 and a
 * JSON error body; the parse is guarded anyway because an ASP.NET failure
 * renders an HTML error page on some releases, and neither should cost us the
 * messages the listing already carries.
 */
async function fetchThreadMessages(
  mychartRequest: MyChartRequest,
  token: string,
  conversationId: string,
): Promise<ConversationMessage[]> {
  try {
    const resp = await makeAuthenticatedRequest(mychartRequest, {
      path: '/api/conversations/GetConversationMessages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        '__RequestVerificationToken': token,
      },
      body: JSON.stringify({ conversationId, PageNonce: "" }),
    });
    const json = await resp.json() as GetConversationMessagesResponse;
    return json.messages ?? [];
  } catch (err) {
    logger.debug('GetConversationMessages did not return a thread', err);
    return [];
  }
}
