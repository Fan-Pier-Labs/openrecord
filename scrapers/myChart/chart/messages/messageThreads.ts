/**
 * One conversation, every message in it.
 *
 * The communication center only ever inlines the newest 5 messages of a thread
 * into `GetConversationList`; anything older sits behind two endpoints, both of
 * which key the conversation on `id` — NOT `conversationId`, which answers 500
 * `{"Message":"An error has occurred."}` on every instance:
 *
 *   POST /api/conversations/GetConversationDetails
 *        { id, messageId?, organizationId?, maxReadMessages?, PageNonce }
 *   POST /api/conversations/GetConversationMessages
 *        { id, organizationId?, startInstantISO?, maxReadMessages?, PageNonce }
 *
 * Both answer with the conversation object: `messages` ascending by
 * `deliveryInstantISO` (oldest first) and `hasMoreMessages` saying whether
 * older ones exist before `messages[0]`. Details additionally carries
 * `subject`, `totalMessages` and the `users`/`viewers` name maps, so it is the
 * seed here and GetConversationMessages pages backwards from it.
 *
 * `startInstantISO` is an exclusive upper bound — the response holds the newest
 * `maxReadMessages` messages strictly older than it — and omitting it means
 * "now", i.e. the newest page. `maxReadMessages` is the page size, defaulting
 * to 5 server-side; observed uncapped, but we still page rather than trust one
 * oversized request to return the lot.
 *
 * Neither `organizationId` nor a real `PageNonce` is required (both instances
 * we can test return an empty `organizationId` on every conversation), but the
 * `__RequestVerificationToken` header is: without it the endpoint 500s.
 *
 * The web UI's own request shape is in
 * `scripts/lib/pxbuild/epic.px.client.communication-center.js` on any instance.
 */
import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../../core/myChartRequest";
import { getVerificationToken } from './communicationCenterToken';
import { logger } from '../../../../shared/logger';

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

/**
 * Messages per request. The UI asks for 5 at a time; a chattier page size costs
 * the same round trip and keeps a long thread from turning into 20 of them.
 */
const PAGE_SIZE = 100;

/** Bound the paging loop, so a server that never clears `hasMoreMessages` can't spin forever. */
const MAX_PAGES = 50;

type ConversationMessage = {
  wmgId?: string;
  deliveryInstantISO?: string;
  body?: string;
  author?: {
    displayName?: string;
    /** Set when a patient-side user (the patient or a proxy) wrote the message. */
    wprKey?: string;
    /** Set when clinic staff wrote it. */
    empKey?: string;
  };
}

type ConversationPayload = {
  hthId?: string;
  subject?: string;
  messages?: ConversationMessage[];
  hasMoreMessages?: boolean;
  /** Per-conversation display names that win over the shared `users` map. */
  userOverrideNames?: Record<string, string>;
  users?: Record<string, { name?: string }>;
  viewers?: Record<string, { name?: string }>;
}

/**
 * Resolve a message author's display name the way the communication center
 * does: staff through `users` (with the conversation's `userOverrideNames`
 * taking precedence), patient-side authors through `viewers`, and only then
 * the message's own `displayName` — which real MyChart leaves empty.
 */
function authorName(msg: ConversationMessage, payload: ConversationPayload): string {
  const { wprKey = '', empKey = '', displayName = '' } = msg.author ?? {};
  if (wprKey) return payload.viewers?.[wprKey]?.name || displayName;
  if (empKey) return payload.userOverrideNames?.[empKey] || payload.users?.[empKey]?.name || displayName;
  return displayName;
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
    return { conversationId, subject: '', messages: [] };
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
    if (messages.length === 0) break;

    collected.unshift(...messages);
    hasMore = older.hasMoreMessages ?? false;
  }

  return {
    conversationId: details.hthId || conversationId,
    subject: details.subject || '',
    messages: collected.map((msg) => ({
      messageId: msg.wmgId || '',
      senderName: authorName(msg, details),
      sentDate: msg.deliveryInstantISO || '',
      messageBody: msg.body || '',
      isFromPatient: !!msg.author?.wprKey,
    })),
  };
}
