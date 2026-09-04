/**
 * One conversation, every message in it.
 *
 * `GetConversationMessages` answered 500 `{"Message":"An error has occurred."}`
 * on every instance anyone checked, which looked exactly like a dead endpoint.
 * It wasn't: **the read endpoints key the thread on `id`**, and we were sending
 * `conversationId`. Parameter names here are per-endpoint, not per-area — the
 * *mutating* siblings (`SendReply`, `DeleteConversation`) really do take
 * `conversationId`, which is where the guess came from. With `id` both read
 * endpoints answer 200 on all four instances there are credentials for:
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
 * Neither `organizationId` nor a real `PageNonce` is required, but the
 * `__RequestVerificationToken` header is: without it the endpoint 500s.
 *
 * The two endpoints REJECT a bad id differently, which is the trap here.
 * GetConversationMessages answers 500; GetConversationDetails answers **200
 * with a literal JSON `null`** — same as GetVisitNotes and GetLetterDetails do
 * for unknown ids. The `null` is recorded and passes through the processor as
 * `null` (rule 7) rather than being read as a thread with nothing in it.
 *
 * The web UI's own request shape is in
 * `scripts/lib/pxbuild/epic.px.client.communication-center.js` on any instance
 * — see `docs/scraping.md`.
 */
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { logger } from '../../../../shared/logger';
import { list, rec, text } from '../../processors/read';
import { conversationThreadProcessor, type ConversationThreadStandard } from './messageThreads.processor';

export type { ConversationThreadStandard, ConversationThreadConcise } from './messageThreads.processor';
export { conversationThreadProcessor } from './messageThreads.processor';

/**
 * Messages per request. The UI asks for 5 at a time; a chattier page size costs
 * the same round trip and keeps a long thread from turning into 20 of them.
 */
const PAGE_SIZE = 100;

/** Bound the paging loop, so a server that never clears `hasMoreMessages` can't spin forever. */
export const MAX_PAGES = 50;

/**
 * `GET /app/communication-center` for the token, `POST GetConversationDetails`
 * for the seed page, then `POST GetConversationMessages` backwards while the
 * last page says older messages exist. Every page is recorded; the processor
 * merges them.
 *
 * A non-2xx answer throws (`RawCollector.send` refuses it): a 500 here is an
 * error, and an error read as an empty thread looks exactly like a
 * conversation with nothing in it.
 */
export async function fetchConversationThreadRaw(mychartRequest: MyChartRequest, conversationId: string): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/communication-center');

  const post = async (action: 'GetConversationDetails' | 'GetConversationMessages', body: Record<string, unknown>) => {
    const { body: payload } = await collector.send({
      path: `/api/conversations/${action}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        __RequestVerificationToken: token,
      },
      body: JSON.stringify({ ...body, PageNonce: '' }),
    });
    return payload;
  };

  const details = await post('GetConversationDetails', { id: conversationId, maxReadMessages: PAGE_SIZE });
  // `null` is MyChart saying it has no such conversation; nothing to page.
  if (details === null || typeof details !== 'object') return collector.toRaw();

  let page = rec(details);
  let oldestInstant = text(rec(list(page.messages)[0]).deliveryInstantISO);
  let pages = 0;
  while (page.hasMoreMessages === true) {
    if (pages === MAX_PAGES) {
      logger.debug(`Stopped paging conversation ${conversationId} after ${MAX_PAGES} pages`);
      break;
    }
    pages++;

    // Exclusive bound: ask for the messages immediately older than the oldest one held.
    const older = await post('GetConversationMessages', {
      id: conversationId,
      startInstantISO: oldestInstant,
      maxReadMessages: PAGE_SIZE,
    });
    page = rec(older);

    // An empty page with `hasMoreMessages` still set would ask for the same
    // instant forever, so it is the end of the thread.
    const messages = list(page.messages);
    if (messages.length === 0) break;
    oldestInstant = text(rec(messages[0]).deliveryInstantISO);
  }

  return collector.toRaw();
}

/**
 * The standard object — what `mode: 'json'` returns. `null` when MyChart has
 * no such conversation on the active patient record.
 */
export async function getConversationMessages(
  mychartRequest: MyChartRequest,
  conversationId: string,
): Promise<ConversationThreadStandard | null> {
  return conversationThreadProcessor.standard(await fetchConversationThreadRaw(mychartRequest, conversationId));
}
