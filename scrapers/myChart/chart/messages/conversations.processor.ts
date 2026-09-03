/**
 * Conversations (inbox) processor. Field decisions:
 * docs/processor-layer-proposal.md, `get_messages`.
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
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { htmlToText } from '../../processors/htmlText';
import { boolOrNull, list, num, rec, text, textOrNull } from '../../processors/read';

/** The name maps a conversation payload carries next to its messages. */
export interface MessageDirectory {
  users: Record<string, unknown>;
  viewers: Record<string, unknown>;
  userOverrideNames: Record<string, unknown>;
}

export interface MessageAttachmentStandard {
  name: string | null;
  fileExtension: string | null;
}

export interface MessageStandard {
  wmgId: string | null;
  deliveryInstantISO: string | null;
  /** Derived: resolved through the name maps (see module comment). `""` when nothing resolves. */
  senderName: string;
  /** Derived: `wprKey` set and `empKey` absent. */
  isFromPatient: boolean;
  isUnread: boolean | null;
  /** Derived: `body` with any markup stripped. `body` itself stays in raw (rule 9). */
  bodyText: string;
  /** The inputs to `senderName`, kept so the resolution is checkable. */
  author: { empKey: string | null; wprKey: string | null };
  attachments: MessageAttachmentStandard[];
  /** Uncaptured element shape; passed through whole. */
  tasks: unknown[];
  /** Uncaptured element shape; passed through whole. */
  suggestedActions: unknown[];
}

export interface MessageConcise {
  deliveryInstantISO: string | null;
  senderName: string;
  isFromPatient: boolean;
  bodyText: string;
}

export interface ConversationStandard {
  hthId: string | null;
  subject: string | null;
  audience: Array<{ name: string | null }>;
  tags: { Unread: boolean | null };
  hasUrgentMsgs: boolean | null;
  hasMoreMessages: boolean | null;
  previewText: string | null;
  hasAttachments: boolean | null;
  hasTasks: boolean | null;
  messageType: string | null;
  messages: MessageStandard[];
}

export interface ConversationsStandard {
  legacyXUnreadCount: number | null;
  conversations: ConversationStandard[];
  localSummary: { hasMoreConversations: boolean | null; oldestLoadedInstantISO: string | null };
}

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
  };
}

export const conversationsProcessor: Processor<ConversationsStandard> = {
  standard(raw: RawResponse): ConversationsStandard {
    const body = rec(bodyOf(raw, 'GetConversationList'));
    const summary = rec(body.localSummary);
    return {
      legacyXUnreadCount: num(body.legacyXUnreadCount),
      conversations: list(body.conversations).map((value) => {
        const c = rec(value);
        // The listing's `users` / `viewers` are shared; `userOverrideNames` is per conversation.
        const directory = messageDirectory({ users: body.users, viewers: body.viewers }, { userOverrideNames: c.userOverrideNames });
        return {
          hthId: textOrNull(c.hthId),
          subject: textOrNull(c.subject),
          audience: list(c.audience).map((a) => ({ name: textOrNull(rec(a).name) })),
          tags: { Unread: boolOrNull(rec(c.tags).Unread) },
          hasUrgentMsgs: boolOrNull(c.hasUrgentMsgs),
          hasMoreMessages: boolOrNull(c.hasMoreMessages),
          previewText: textOrNull(c.previewText),
          hasAttachments: boolOrNull(c.hasAttachments),
          hasTasks: boolOrNull(c.hasTasks),
          messageType: textOrNull(c.messageType),
          messages: list(c.messages).map((m) => messageStandard(m, directory)),
        };
      }),
      localSummary: {
        hasMoreConversations: boolOrNull(summary.hasMoreConversations),
        oldestLoadedInstantISO: textOrNull(summary.oldestLoadedInstantISO),
      },
    };
  },

  concise(standard) {
    return {
      legacyXUnreadCount: standard.legacyXUnreadCount,
      conversations: standard.conversations.map((c) => ({
        hthId: c.hthId,
        subject: c.subject,
        audience: c.audience,
        tags: c.tags,
        hasUrgentMsgs: c.hasUrgentMsgs,
        hasMoreMessages: c.hasMoreMessages,
        previewText: c.previewText,
        messages: c.messages.map(messageConcise),
      })),
    };
  },
};
