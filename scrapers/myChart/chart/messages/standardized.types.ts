/**
 * What the `messages` capabilities return: the standard objects the processors
 * build from MyChart's responses. MyChart's own shapes are in
 * `./mychart.types.ts`.
 */

/** The name maps a conversation payload carries next to its messages. */
export interface MessageDirectory {
  users: Record<string, unknown>;
  viewers: Record<string, unknown>;
  userOverrideNames: Record<string, unknown>;
}

export interface MessageAttachmentStandard {
  name: string | null;
  fileExtension: string | null;
  /** The handle `get_message_attachment` takes. */
  dcsId: string | null;
  type: number | null;
}

export interface MessageAttachmentConcise {
  name: string | null;
  dcsId: string | null;
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
  attachments: MessageAttachmentConcise[];
}

export interface ConversationStandard {
  hthId: string | null;
  subject: string | null;
  audience: Array<{ name: string | null }>;
  /** Derived: `audience[].name`, flattened. */
  audienceNames: string[];
  /** Derived: `deliveryInstantISO` of the newest inlined message. */
  latestMessageInstantISO: string | null;
  tags: { Unread: boolean | null };
  /** Derived: `tags.Unread`, flat. */
  hasUnreadMessages: boolean | null;
  hasUrgentMsgs: boolean | null;
  hasMoreMessages: boolean | null;
  previewText: string | null;
  hasAttachments: boolean | null;
  hasTasks: boolean | null;
  messageType: string | null;
  messages: MessageStandard[];
}

export interface ConversationConcise {
  hthId: string | null;
  subject: string | null;
  audienceNames: string[];
  latestMessageInstantISO: string | null;
  hasUnreadMessages: boolean | null;
  hasUrgentMsgs: boolean | null;
  hasAttachments: boolean | null;
}

export interface ConversationsStandard {
  legacyXUnreadCount: number | null;
  /** Derived: paging stopped at the cap with `hasMoreConversations` still true. */
  truncated: boolean;
  /** Every page merged, in inbox order. */
  conversations: ConversationStandard[];
  localSummary: { hasMoreConversations: boolean | null; oldestLoadedInstantISO: string | null };
}

export interface ConversationsConcise {
  legacyXUnreadCount: number | null;
  truncated: boolean;
  conversations: ConversationConcise[];
}

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

export interface MessageRecipientStandard {
  displayName: string | null;
  specialty: string | null;
  pcpTypeDisplayName: string | null;
  recipientType: number | null;
  /** Out-of-contact context; absent on most instances. */
  oocContext: number | null;
  userId: string | null;
  departmentId: string | null;
  poolId: string | null;
  providerId: string | null;
}

export interface MessageRecipientsStandard {
  recipients: MessageRecipientStandard[];
}

export interface MessageTopicStandard {
  displayName: string | null;
  value: string | null;
}

export interface MessageTopicsStandard {
  topicList: MessageTopicStandard[];
}
