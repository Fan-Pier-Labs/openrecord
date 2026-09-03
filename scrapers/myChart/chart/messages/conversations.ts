import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { conversationsProcessor, type ConversationsStandard } from './conversations.processor';

export type {
  ConversationsStandard,
  ConversationStandard,
  MessageStandard,
  MessageConcise,
  MessageAttachmentStandard,
  MessageDirectory,
} from './conversations.processor';
export { conversationsProcessor } from './conversations.processor';

/**
 * `GET /app/communication-center` for the token every `/api/conversations/*`
 * POST has to carry, then `POST /api/conversations/GetConversationList` with
 * the request the portal's inbox sends.
 */
export async function fetchConversationsRaw(mychartRequest: MyChartRequest): Promise<RawResponse> {
  const collector = new RawCollector(mychartRequest);
  const token = await collector.pageToken('/app/communication-center');
  await collector.send({
    path: '/api/conversations/GetConversationList',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      __RequestVerificationToken: token,
    },
    body: JSON.stringify({
      tag: 1,
      localLoadParams: { loadStartInstantISO: '', loadEndInstantISO: '', pagingInfo: 1 },
      externalLoadParams: {},
      searchQuery: '',
      PageNonce: '',
    }),
  });
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function listConversations(mychartRequest: MyChartRequest): Promise<ConversationsStandard> {
  return conversationsProcessor.standard(await fetchConversationsRaw(mychartRequest));
}
