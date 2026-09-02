import { makeAuthenticatedRequest } from '../../core/makeAuthenticatedRequest';
import type { MyChartRequest } from "../../core/myChartRequest";
import { getRequestVerificationTokenFromBody } from "../../core/util";
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
 * One message as Epic serializes it.
 *
 * This is the same shape `/api/conversations/GetConversationList` returns for
 * the messages it inlines under each conversation — Epic serializes a WPR
 * message identically wherever it appears, and the list shape is held to a
 * skeleton captured from live instances (`fake-mychart/src/data/realShapes.ts`).
 *
 * `author` carries exactly one key: `empKey` for a care-team member, `wprKey`
 * for the patient (or a proxy writing on the patient's record).
 */
type ConversationMessageResponse = {
  wmgId?: string;
  body?: string;
  deliveryInstantISO?: string;
  author?: {
    displayName?: string;
    empKey?: string;
    wprKey?: string;
  };
}

type GetConversationMessagesResponse = {
  /**
   * Neither of these has been seen on a live capture of this endpoint — the
   * conversation LIST is the authority for a thread's subject. They are read
   * tolerantly so a capture that does carry them is used rather than ignored.
   */
  conversationId?: string;
  subject?: string;
  messages?: ConversationMessageResponse[];
}

export async function getConversationMessages(mychartRequest: MyChartRequest, conversationId: string): Promise<ConversationThread> {
  const pageResp = await makeAuthenticatedRequest(mychartRequest, { path: '/app/communication-center' });
  const html = await pageResp.text();
  const token = getRequestVerificationTokenFromBody(html);

  const empty: ConversationThread = { conversationId, subject: '', messages: [] };

  if (!token) {
    logger.debug('Could not find request verification token for message threads');
    return empty;
  }

  const resp = await makeAuthenticatedRequest(mychartRequest, {
    path: '/api/conversations/GetConversationMessages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '__RequestVerificationToken': token,
    },
    body: JSON.stringify({ conversationId, PageNonce: "" }),
  });

  const json: GetConversationMessagesResponse = await resp.json();

  return {
    conversationId: json.conversationId || conversationId,
    subject: json.subject || '',
    messages: (json.messages ?? []).map(toThreadMessage),
  };
}

function toThreadMessage(msg: ConversationMessageResponse): ThreadMessage {
  const author = msg.author ?? {};
  return {
    messageId: msg.wmgId || '',
    senderName: author.displayName || '',
    sentDate: msg.deliveryInstantISO || '',
    messageBody: msg.body || '',
    // A message the patient wrote is keyed by wprKey and has no empKey; a
    // care-team message is the other way round. Requiring both sides makes an
    // author object we couldn't read fall to "not from the patient" rather
    // than mislabelling a provider's message as the patient's.
    isFromPatient: Boolean(author.wprKey) && !author.empKey,
  };
}
