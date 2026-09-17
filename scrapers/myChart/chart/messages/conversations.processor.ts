/**
 * Conversations (inbox) processor. Field decisions:
 * docs/processor-layer-proposal.md, `get_messages`.
 *
 * The scraper records one `GetConversationList` answer per page. This merges
 * the pages into one list in inbox order, de-duplicated by `hthId`, with the
 * unread count from the first page and the paging summary from the last.
 *
 * The message element shape is shared with `get_message_thread`, so the
 * per-message projection and the name resolution live here and the thread
 * processor imports them.
 *
 * `senderName` follows the order the portal's own `getAuthorInfo` uses: a
 * `wprKey` resolves through `viewers`, an `empKey` through the conversation's
 * `userOverrideNames` and then the shared `users` map, and `displayName` is
 * the last resort. On every captured instance `displayName` is `""` on every
 * message, so without the maps every message would be anonymous.
 *
 * Concise is the inbox as a list of threads — id, subject, who, when, and the
 * flags that change what a reader does next — and never the messages: the
 * listing only ever inlines the newest five of a thread, and a reader who
 * wants the messages takes the `hthId` to `get_message_thread`.
 */

import { findRequests, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { htmlToText } from '../../processors/htmlText';
import { bool, boolOrNull, list, num, rec, text, textOrNull } from '../../processors/read';
import type { ConversationStandard, ConversationsConcise, ConversationsStandard, MessageConcise, MessageDirectory, MessageStandard } from './standardized.types';

export type { ConversationConcise, ConversationStandard, ConversationsConcise, ConversationsStandard, MessageAttachmentConcise, MessageAttachmentStandard, MessageConcise, MessageDirectory, MessageStandard } from './standardized.types';

/** Read the three name maps off a conversation payload (or the listing that carries it). */
export function messageDirectory(...sources: unknown[]): MessageDirectory {
  const directory: MessageDirectory = { users: {}, viewers: {}, userOverrideNames: {} };
  for (const source of sources) {
    const s = rec(source);
    Object.assign(directory.users, rec(s.users));
    Object.assign(directory.viewers, rec(s.viewers));
    Object.assign(directory.userOverrideNames, rec(s.userOverrideNames));
  }
  return directory;
}

/**
 * MyChart identifies an author by key, not by role: staff carry an `empKey`,
 * patient-side viewers a `wprKey`. An author with a staff key is never the
 * patient, and one with only a viewer key always is.
 */
export function isFromPatient(author: unknown): boolean {
  const a = rec(author);
  return !text(a.empKey) && !!text(a.wprKey);
}

export function senderName(author: unknown, directory: MessageDirectory): string {
  const a = rec(author);
  const wprKey = text(a.wprKey);
  const empKey = text(a.empKey);
  const displayName = text(a.displayName);
  if (wprKey) return text(rec(directory.viewers[wprKey]).name) || displayName;
  if (empKey) {
    return text(directory.userOverrideNames[empKey]) || text(rec(directory.users[empKey]).name) || displayName;
  }
  return displayName;
}

export function messageStandard(value: unknown, directory: MessageDirectory): MessageStandard {
  const m = rec(value);
  const author = rec(m.author);
  return {
    wmgId: textOrNull(m.wmgId),
    deliveryInstantISO: textOrNull(m.deliveryInstantISO),
    senderName: senderName(author, directory),
    isFromPatient: isFromPatient(author),
    isUnread: boolOrNull(m.isUnread),
    bodyText: htmlToText(text(m.body)),
    author: { empKey: textOrNull(author.empKey), wprKey: textOrNull(author.wprKey) },
    attachments: list(m.attachments).map((a) => ({
      name: textOrNull(rec(a).name),
      fileExtension: textOrNull(rec(a).fileExtension),
      dcsId: textOrNull(rec(a).dcsId),
      type: num(rec(a).type),
    })),
    tasks: list(m.tasks),
    suggestedActions: list(m.suggestedActions),
  };
}

export function messageConcise(m: MessageStandard): MessageConcise {
  return {
    deliveryInstantISO: m.deliveryInstantISO,
    senderName: m.senderName,
    isFromPatient: m.isFromPatient,
    bodyText: m.bodyText,
    attachments: m.attachments.map((a) => ({ name: a.name, dcsId: a.dcsId })),
  };
}

function conversationStandard(value: unknown, listing: Record<string, unknown>): ConversationStandard {
  const c = rec(value);
  // The listing's `users` / `viewers` are shared; `userOverrideNames` is per conversation.
  const directory = messageDirectory({ users: listing.users, viewers: listing.viewers }, { userOverrideNames: c.userOverrideNames });
  const messages = list(c.messages).map((m) => messageStandard(m, directory));
  // Pages arrive ascending by deliveryInstantISO; the newest is the max either way.
  const latest = messages.reduce<string | null>(
    (best, m) => (m.deliveryInstantISO !== null && (best === null || m.deliveryInstantISO > best) ? m.deliveryInstantISO : best),
    null,
  );
  const audience = list(c.audience).map((a) => ({ name: textOrNull(rec(a).name) }));
  const unread = boolOrNull(rec(c.tags).Unread);
  return {
    hthId: textOrNull(c.hthId),
    subject: textOrNull(c.subject),
    audience,
    audienceNames: audience.map((a) => a.name ?? ''),
    latestMessageInstantISO: latest,
    tags: { Unread: unread },
    hasUnreadMessages: unread,
    hasUrgentMsgs: boolOrNull(c.hasUrgentMsgs),
    hasMoreMessages: boolOrNull(c.hasMoreMessages),
    previewText: textOrNull(c.previewText),
    hasAttachments: boolOrNull(c.hasAttachments),
    hasTasks: boolOrNull(c.hasTasks),
    messageType: textOrNull(c.messageType),
    messages,
  };
}

export const conversationsProcessor: Processor<ConversationsStandard> = {
  standard(raw: RawResponse): ConversationsStandard {
    const requests = findRequests(raw, 'GetConversationList');
    const pages = requests.map((r) => rec(r.body));
    const first = pages[0] ?? {};
    const last = pages[pages.length - 1] ?? {};

    const seen = new Set<string>();
    const conversations: ConversationStandard[] = [];
    for (const page of pages) {
      for (const value of list(page.conversations)) {
        const conversation = conversationStandard(value, page);
        const key = conversation.hthId ?? '';
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        conversations.push(conversation);
      }
    }

    const summary = rec(last.localSummary);
    // The scraper stops with `hasMoreConversations` still set in two cases: at
    // its page cap, and when a page ends at the very instant it asked to start
    // from (asking again would loop forever). Only the cap leaves threads
    // unread; the second is the server repeating itself, so the inbox is whole.
    const askedFrom = text(rec(rec(requests[requests.length - 1]?.requestBody).localLoadParams).loadStartInstantISO);
    const stoppedRepeating = text(summary.oldestLoadedInstantISO) === askedFrom;
    return {
      legacyXUnreadCount: num(first.legacyXUnreadCount),
      truncated: bool(summary.hasMoreConversations) && list(last.conversations).length > 0 && !stoppedRepeating,
      conversations,
      localSummary: {
        hasMoreConversations: boolOrNull(summary.hasMoreConversations),
        oldestLoadedInstantISO: textOrNull(summary.oldestLoadedInstantISO),
      },
    };
  },

  concise(standard): ConversationsConcise {
    return {
      legacyXUnreadCount: standard.legacyXUnreadCount,
      truncated: standard.truncated,
      conversations: standard.conversations.map((c) => ({
        hthId: c.hthId,
        subject: c.subject,
        audienceNames: c.audienceNames,
        latestMessageInstantISO: c.latestMessageInstantISO,
        hasUnreadMessages: c.hasUnreadMessages,
        hasUrgentMsgs: c.hasUrgentMsgs,
        hasAttachments: c.hasAttachments,
      })),
    };
  },
};
