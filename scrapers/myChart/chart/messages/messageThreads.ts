/**
 * One conversation, every message in it.
 *
 * `GetConversationMessages` answered 500 `{"Message":"An error has occurred."}`
 * on every instance anyone checked, which looked exactly like a dead endpoint.
 * It wasn't: **the read endpoints key the thread on `id`**, and we were sending
 * `conversationId`. Parameter names here are per-endpoint, not per-area — the
 * *mutating* siblings (`SendReply`, `DeleteConversation`) really do take
 * `conversationId`, which is where the guess came from. With `id` both read
 * endpoints answer 200 on both instances we can test:
 *
 *   POST /api/conversations/GetConversationDetails
 *        { id, messageId?, organizationId?, maxReadMessages?, PageNonce }
 *   POST /api/conversations/GetConversationMessages
 *        { id, organizationId?, startInstantISO?, maxReadMessages?, PageNonce }
 *
 * Both answer with the conversation object: `messages` ascending by
 * `deliveryInstantISO` (oldest first) and `hasMoreMessages` saying whether
 * older ones exist before `messages[0]`. Details additionally carries
 * `subject`, `totalMessages` and the `users` / `viewers` name maps, so it is
 * the seed here and GetConversationMessages pages backwards from it.
 *
 * `startInstantISO` is an exclusive upper bound — the response holds the newest
 * `maxReadMessages` messages strictly older than it — and omitting it means
 * "now", i.e. the newest page. `maxReadMessages` is the page size, defaulting
 * to 5 server-side, which is also all the listing ever inlines.
 *
 * Neither `organizationId` nor a real `PageNonce` is required (both instances
 * return an empty `organizationId` on every conversation), but the
 * `__RequestVerificationToken` header is: without it the endpoint 500s.
 *
 * The web UI's own request shape is in
 * `scripts/lib/pxbuild/epic.px.client.communication-center.js` on any instance
 * — see `docs/scraping.md`.
 */
import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../../core/myChartRequest";
import { getVerificationToken } from './communicationCenterToken';
import { logger } from '../../../../shared/logger';
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
   * stopped asking. Only reachable by hitting MAX_PAGES — the paging loop
   * otherwise runs to the end of the thread — and reported so a reader never
   * presents a partial thread as the whole exchange.
   */
  truncated: boolean;
}

/** The name maps a conversation response returns alongside the messages. */
type ThreadDirectory = Pick<ConversationListResponse, 'users' | 'viewers'>;

/** One page of a conversation, as both read endpoints return it. */
type ConversationPayload = ThreadDirectory & {
  hthId?: string;
  subject?: string;
  messages?: ConversationMessage[];
  hasMoreMessages?: boolean;
  /** Per-conversation display names that win over the shared `users` map. */
  userOverrideNames?: Record<string, string>;
}

/**
 * Messages per request. The UI asks for 5 at a time; a chattier page size costs
 * the same round trip and keeps a long thread from turning into 20 of them.
 */
const PAGE_SIZE = 100;

/** Bound the paging loop, so a server that never clears `hasMoreMessages` can't spin forever. */
const MAX_PAGES = 50;

/**
 * MyChart identifies a message's author by key, not by role: care-team authors
 * carry an `empKey` and patient-side authors a `wprKey` that appears in the
 * conversation's `viewers` map. An author with a staff key is never the
 * patient, and one with only a viewer key always is.
 */
function isPatientAuthor(author: MessageAuthor | undefined): boolean {
  return !author?.empKey && !!author?.wprKey;
}

/**
 * Resolve an author's display name the way the communication center's own
 * `getAuthorInfo` does: the key maps first, `displayName` only when they miss.
 * That order matters — on every instance we can check, `displayName` is EMPTY
 * on every message and the name lives in `users` (staff), `viewers` (patient)
 * or the conversation's `userOverrideNames`, which the bundle resolves as
 * `userOverrideNames[empKey] || users[empKey].name`.
 */
function senderName(
  author: MessageAuthor | undefined,
  directory: ThreadDirectory,
  overrideNames?: Record<string, string>,
): string {
  if (author?.wprKey) return directory.viewers?.[author.wprKey]?.name || author.displayName || '';
  if (author?.empKey) {
    return overrideNames?.[author.empKey] || directory.users?.[author.empKey]?.name || author.displayName || '';
  }
  return author?.displayName ?? '';
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

async function postConversationApi(
  mychartRequest: MyChartRequest,
  action: 'GetConversationDetails' | 'GetConversationMessages',
  token: string,
  body: Record<string, unknown>,
): Promise<ConversationPayload> {
  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: `/api/conversations/${action}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({ ...body, PageNonce: '' }),
  });

  if (!resp.ok) {
    throw new Error(`${action} failed with status ${resp.status}`);
  }

  return await resp.json() as ConversationPayload;
}

export async function getConversationMessages(mychartRequest: MyChartRequest, conversationId: string): Promise<ConversationThread> {
  const token = await getVerificationToken(mychartRequest);

  if (!token) {
    logger.debug('Could not find request verification token for message threads');
    return { conversationId, subject: '', messages: [], truncated: false };
  }

  const details = await postConversationApi(mychartRequest, 'GetConversationDetails', token, {
    id: conversationId,
    maxReadMessages: PAGE_SIZE,
  });

  const collected: ConversationMessage[] = [...(details.messages ?? [])];
  let hasMore = details.hasMoreMessages ?? false;

  let pages = 0;
  while (hasMore) {
    if (pages === MAX_PAGES) {
      logger.debug(`Stopped paging conversation ${conversationId} after ${MAX_PAGES} pages`);
      break;
    }
    pages++;

    // Exclusive bound: ask for the messages immediately older than the oldest
    // one we hold.
    const startInstantISO = collected[0]?.deliveryInstantISO ?? '';
    const older = await postConversationApi(mychartRequest, 'GetConversationMessages', token, {
      id: conversationId,
      startInstantISO,
      maxReadMessages: PAGE_SIZE,
    });

    // An empty page with `hasMoreMessages` still set would ask for the same
    // instant forever, so treat it as the end of the thread.
    const messages = older.messages ?? [];
    if (messages.length === 0) {
      hasMore = false;
      break;
    }

    collected.unshift(...messages);
    hasMore = older.hasMoreMessages ?? false;
  }

  return {
    conversationId: details.hthId || conversationId,
    subject: details.subject ?? '',
    messages: collected.map((msg) => toThreadMessage(msg, details, details.userOverrideNames)),
    truncated: hasMore,
  };
}
