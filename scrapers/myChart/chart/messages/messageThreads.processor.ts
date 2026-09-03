/**
 * Conversation thread processor. Field decisions:
 * docs/processor-layer-proposal.md, `get_message_thread`.
 *
 * The scraper records `GetConversationDetails` and then every
 * `GetConversationMessages` page it walked backwards through. This merges the
 * pages into one list ascending by `deliveryInstantISO`, de-duplicated by
 * `wmgId`, and resolves names through the maps `GetConversationDetails`
 * carries (the pages only carry `userOverrideNames`).
 *
 * `truncated` is derived from the LAST page the scraper recorded: the paging
 * loop only stops on a non-empty page that still says `hasMoreMessages` when
 * it hit its page cap. A page that is empty, `null`, or says there is nothing
 * older is the end of the thread, not a truncation.
 *
 * A literal JSON `null` from `GetConversationDetails` is MyChart saying it
 * has no such conversation on the active patient record; it passes through
 * as `null` in every mode (rule 7).
 */

import { findRequest, findRequests, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { bool, boolOrNull, list, num, rec, textOrNull } from '../../processors/read';
import {
  messageConcise,
  messageDirectory,
  messageStandard,
  type MessageConcise,
  type MessageStandard,
} from './conversations.processor';

export interface ConversationThreadStandard {
  hthId: string | null;
  subject: string | null;
  audience: Array<{ name: string | null }>;
  totalMessages: number | null;
  numUnread: number | null;
  /** Derived: paging stopped at the cap with `hasMoreMessages` still true. */
  truncated: boolean;
  /** Every page merged, oldest first. */
  messages: MessageStandard[];
  replyFlags: { canReply: boolean | null; cannotReplyReason: number | null };
  hasPreviouslyViewed: boolean | null;
  hasAttachments: boolean | null;
  hasUrgentMsgs: boolean | null;
  hasTasks: boolean | null;
  messageType: string | null;
  previewText: string | null;
}

export interface ConversationThreadConcise {
  hthId: string | null;
  subject: string | null;
  audience: Array<{ name: string | null }>;
  totalMessages: number | null;
  numUnread: number | null;
  truncated: boolean;
  messages: MessageConcise[];
}

export const conversationThreadProcessor: Processor<ConversationThreadStandard | null> = {
  standard(raw: RawResponse): ConversationThreadStandard | null {
    const detailsRequest = findRequest(raw, 'GetConversationDetails');
    const detailsBody = detailsRequest?.body;
    if (detailsBody === null || typeof detailsBody !== 'object' || Array.isArray(detailsBody)) return null;
    const details = rec(detailsBody);
    const pages = findRequests(raw, 'GetConversationMessages');

    const directory = messageDirectory(details, ...pages.map((p) => p.body));

    const seen = new Set<string>();
    const merged: MessageStandard[] = [];
    for (const source of [details, ...pages.map((p) => rec(p.body))]) {
      for (const m of list(source.messages)) {
        const parsed = messageStandard(m, directory);
        const key = parsed.wmgId ?? '';
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        merged.push(parsed);
      }
    }
    merged.sort((a, b) => (a.deliveryInstantISO ?? '').localeCompare(b.deliveryInstantISO ?? ''));

    const last = pages.length > 0 ? pages[pages.length - 1]!.body : details;
    const lastPage = rec(last);
    const truncated =
      last !== null && typeof last === 'object' && bool(lastPage.hasMoreMessages) && list(lastPage.messages).length > 0;

    const replyFlags = rec(details.replyFlags);
    return {
      hthId: textOrNull(details.hthId),
      subject: textOrNull(details.subject),
      audience: list(details.audience).map((a) => ({ name: textOrNull(rec(a).name) })),
      totalMessages: num(details.totalMessages),
      numUnread: num(details.numUnread),
      truncated,
      messages: merged,
      replyFlags: { canReply: boolOrNull(replyFlags.canReply), cannotReplyReason: num(replyFlags.cannotReplyReason) },
      hasPreviouslyViewed: boolOrNull(details.hasPreviouslyViewed),
      hasAttachments: boolOrNull(details.hasAttachments),
      hasUrgentMsgs: boolOrNull(details.hasUrgentMsgs),
      hasTasks: boolOrNull(details.hasTasks),
      messageType: textOrNull(details.messageType),
      previewText: textOrNull(details.previewText),
    };
  },

  concise(standard): ConversationThreadConcise | null {
    if (standard === null) return null;
    return {
      hthId: standard.hthId,
      subject: standard.subject,
      audience: standard.audience,
      totalMessages: standard.totalMessages,
      numUnread: standard.numUnread,
      truncated: standard.truncated,
      messages: standard.messages.map(messageConcise),
    };
  },
};
