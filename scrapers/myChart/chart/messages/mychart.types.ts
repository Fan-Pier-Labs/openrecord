/**
 * Raw MyChart responses for the `messages` scraper.
 *
 * Observed by the capture harness behind `fake-mychart/src/data/realShapes.ts`
 * on three real instances — what we have seen, never a contract Epic owes us.
 *
 * `unknown` means the field was `null` on every instance captured: we saw no
 * value, so we know no type. `unknown[]` means the array was always empty, so
 * we have never seen an element. Neither is `null` or `never[]`, which would
 * read as settled.
 *
 * Read a payload with `rec<T>()` from `../../processors/read.ts` — it checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. Never
 * `as`: that checks the same names and then lies about the values.
 *
 * Endpoints: /api/conversations/getconversationlist, /api/medicaladvicerequests/getmedicaladvicerequestrecipients, /api/medicaladvicerequests/getsubtopics
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

/** Repeated shape. Appears in: chart/messages. */
export type User = {
  empId?: string;
  name?: string;
  outOfContactEndDate?: string;
  outOfContactContext?: number;
  outOfContactContextString?: string;
  photoUrl?: string;
  providerId?: string;
  organizationId?: string;
};

/** Repeated shape. Appears in: chart/messages. */
export type Message = {
  wmgId?: string;
  isUnread?: boolean;
  deliveryInstantISO?: string;
  body?: string;
  author?: {
    displayName?: string;
    empKey?: string;
  };
  attachments?: Array<{
    type?: number;
    dcsId?: string;
    etxId?: string;
    name?: string;
    fileExtension?: string;
    legacyUrlForCommunityJump?: string;
    organizationId?: string;
  }>;
  tasks?: unknown[];
  suggestedActions?: unknown[];
};

/** Repeated shape. Appears in: chart/messages. */
export type Attachment = {
  type?: number;
  dcsId?: string;
  etxId?: string;
  name?: string;
  fileExtension?: string;
  legacyUrlForCommunityJump?: string;
  organizationId?: string;
};

/** Repeated shape. Appears in: chart/messages. */
export type Viewer = {
  wprId?: string;
  name?: string;
  isSelf?: boolean;
  isShown?: boolean;
  isSelected?: boolean;
  organizationId?: string;
};

/** ``firstUnreadMsgId` instead, so neither is a shape all of them share.` */
export type GetConversationDetails = {
  contexts?: unknown[];
  lastViewedByStaffMsgId?: string;
  lastViewedByStaffInstantISO?: string;
  numUnread?: number;
  replyUrl?: string;
  replyFlags?: {
    canReply?: boolean;
    cannotReplyReason?: number;
  };
  totalMessages?: number;
  users?: Record<string, User>;
  viewers?: Record<string, Viewer>;
  hasPreviouslyViewed?: boolean;
  subject?: string;
  tags?: {
    Messages?: boolean;
  };
  previewText?: string;
  hasAttachments?: boolean;
  hasTasks?: boolean;
  hasUrgentMsgs?: boolean;
  legacyMessageDetailsUrl?: string;
  audience?: Array<{
    empId?: string;
    hipId?: string;
    name?: string;
    providerId?: string;
  }>;
  hasLoadAllUsers?: boolean;
  allowBulkActions?: boolean;
  hthId?: string;
  messages?: Message[];
  hasMoreMessages?: boolean;
  messageType?: string;
  userKeys?: string[];
  userOverrideNames?: Record<string, string>;
  maskedUserNames?: unknown[];
  showOtherViewersOption?: boolean;
  viewerKeys?: string[];
  organizationId?: string;
};

/** `/api/conversations/getconversationlist` */
export type GetConversationList = {
  legacyXUnreadCount?: number;
  conversations?: Array<{
    contexts?: unknown[];
    subject?: string;
    tags?: {
      Messages?: boolean;
      Unread?: boolean;
    };
    previewText?: string;
    hasAttachments?: boolean;
    hasTasks?: boolean;
    hasUrgentMsgs?: boolean;
    legacyMessageDetailsUrl?: string;
    audience?: unknown[];
    hasLoadAllUsers?: boolean;
    allowBulkActions?: boolean;
    hthId?: string;
    messages?: Array<{
      wmgId?: string;
      isUnread?: boolean;
      deliveryInstantISO?: string;
      body?: string;
      author?: {
        displayName?: string;
        empKey?: string;
      };
      attachments?: unknown[];
      tasks?: unknown[];
      suggestedActions?: unknown[];
    }>;
    hasMoreMessages?: boolean;
    messageType?: string;
    userKeys?: string[];
    userOverrideNames?: Record<string, string>;
    maskedUserNames?: unknown[];
    showOtherViewersOption?: boolean;
    viewerKeys?: string[];
    organizationId?: string;
  }>;
  localSummary?: {
    hasMoreConversations?: boolean;
    newestLoadedInstantISO?: string;
    numberLoaded?: number;
    oldestLoadedInstantISO?: string;
    oldestSearchedInstantISO?: string;
    pagingInfo?: number;
  };
  users?: Record<string, User>;
  viewers?: Record<string, Viewer>;
  externalSummaries?: Record<string, unknown>;
};

/** `come from getconversationdetails or the listing).` */
export type GetConversationMessages = {
  contexts?: unknown[];
  hthId?: string;
  messages?: Message[];
  hasMoreMessages?: boolean;
  messageType?: string;
  userKeys?: string[];
  userOverrideNames?: Record<string, string>;
  maskedUserNames?: unknown[];
  showOtherViewersOption?: boolean;
  viewerKeys?: string[];
  organizationId?: string;
};

/** `/api/medicaladvicerequests/getmedicaladvicerequestrecipients` */
export type GetMedicalAdviceRequestRecipients = Array<{
  recipientType?: number;
  pcpTypeDisplayName?: string;
  displayName?: string;
  specialty?: string;
  userId?: string;
  departmentId?: string;
  poolId?: string;
  oocContext?: number;
  photoUrl?: string;
  providerId?: string;
  organizationId?: string;
}>;

/** `/api/medicaladvicerequests/getsubtopics` */
export type GetSubTopics = {
  topicList?: Array<{
    displayName?: string;
    value?: string;
  }>;
  organizationId?: string;
};
