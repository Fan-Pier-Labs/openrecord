/**
 * The inbox: every conversation on the active patient record.
 *
 * `GetConversationList` answers 50 conversations per page (measured on the one
 * instance with more than 50) and says so with `localSummary.hasMoreConversations`.
 * The portal loads the next page by re-posting with `localLoadParams` set to
 * `{ loadStartInstantISO: <oldestLoadedInstantISO of the page it has>,
 * loadEndInstantISO: '', pagingInfo: <the page's pagingInfo> }`, and this
 * scraper does the same until the summary says there is nothing older. Every
 * page is recorded; the processor merges them.
 */
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { logger } from '../../../../shared/logger';
import { list, num, rec, text } from '../../processors/read';
import { conversationsProcessor, type ConversationsStandard } from './conversations.processor';

export type {
  ConversationsStandard,
  ConversationStandard,
  MessageStandard,
  MessageConcise,
  MessageAttachmentStandard,
  MessageAttachmentConcise,
  MessageDirectory,
} from './conversations.processor';
export { conversationsProcessor } from './conversations.processor';

/** Bound the paging loop, so a server that never clears `hasMoreConversations` can't spin forever. */
export const MAX_PAGES = 40;

/**
 * `GET /app/communication-center` for the token every `/api/conversations/*`
 * POST has to carry, then `POST /api/conversations/GetConversationList` with
 * the request the portal's inbox sends, once per page.
 */
export async function fetchConversationsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/communication-center');

  let localLoadParams: Record<string, unknown> = { loadStartInstantISO: '', loadEndInstantISO: '', pagingInfo: 1 };
  for (let page = 1; ; page++) {
    const { body } = await collector.send({
      path: '/api/conversations/GetConversationList',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        __RequestVerificationToken: token,
      },
      body: JSON.stringify({
        tag: 1,
        localLoadParams,
        externalLoadParams: {},
        searchQuery: '',
        PageNonce: '',
      }),
    });

    const payload = rec(body);
    const summary = rec(payload.localSummary);
    if (summary.hasMoreConversations !== true) break;
    if (page === MAX_PAGES) {
      logger.debug(`Stopped paging the inbox after ${MAX_PAGES} pages`);
      break;
    }
    // A page that carried nothing, or that ends where the last one did, would
    // ask for the same instant forever: treat it as the end of the inbox.
    const oldest = text(summary.oldestLoadedInstantISO);
    if (!oldest || list(payload.conversations).length === 0 || oldest === localLoadParams.loadStartInstantISO) break;
    localLoadParams = { loadStartInstantISO: oldest, loadEndInstantISO: '', pagingInfo: num(summary.pagingInfo) ?? 0 };
  }

  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function listConversations(mychartRequest: MyChartRequest): Promise<ConversationsStandard> {
  return conversationsProcessor.standard(await fetchConversationsRaw(mychartRequest));
}
