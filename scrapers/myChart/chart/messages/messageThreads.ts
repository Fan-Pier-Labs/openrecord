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

type MessageResponse = {
  messageId?: string;
  senderName?: string;
  sentDate?: string;
  messageBody?: string;
  isFromPatient?: boolean;
}

type GetConversationMessagesResponse = {
  conversationId?: string;
  subject?: string;
  messages?: MessageResponse[];
}

export async function getConversationMessages(mychartRequest: MyChartRequest, conversationId: string): Promise<ConversationThread> {
  const token = await getVerificationToken(mychartRequest);

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
    messages: (json.messages ?? []).map((msg: MessageResponse) => ({
      messageId: msg.messageId || '',
      senderName: msg.senderName || '',
      sentDate: msg.sentDate || '',
      messageBody: msg.messageBody || '',
      isFromPatient: msg.isFromPatient || false,
    })),
  };
}
