/** The `Messages` group — the inbox, and sending into it. */

import { fetchConversationsRaw, conversationsProcessor } from '../../../scrapers/myChart/chart/messages/conversations';
import { fetchConversationThreadRaw, conversationThreadProcessor } from '../../../scrapers/myChart/chart/messages/messageThreads';
import {
  fetchMessageRecipientsRaw,
  fetchMessageTopicsRaw,
  messageRecipientsProcessor,
  messageTopicsProcessor,
} from '../../../scrapers/myChart/chart/messages/recipients';
import {
  sendNewMessage,
  getMessageRecipients,
  getMessageTopics,
  getVerificationToken,
} from '../../../scrapers/myChart/chart/messages/sendMessage';
import { sendReply } from '../../../scrapers/myChart/chart/messages/sendReply';
import { deleteMessage } from '../../../scrapers/myChart/chart/messages/deleteMessage';
import type { MyChartRequest } from '../../../scrapers/myChart/core/myChartRequest';
import { optStr, requireStr } from '../args';
import { resolveRecipient, resolveTopic } from '../resolve';
import type { CapabilityImpl } from '../types';

async function messagingToken(request: MyChartRequest): Promise<string> {
  const token = await getVerificationToken(request);
  if (!token) throw new Error('Could not get a MyChart verification token for messaging.');
  return token;
}

export const MESSAGE_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'get_messages',
    title: 'Messages',
    description: 'Inbox conversations with the care team.',
    kind: 'read',
    group: 'Messages',
    params: [],
    run: (request) => fetchConversationsRaw(request),
    processor: conversationsProcessor,
  },
  {
    id: 'get_message_thread',
    title: 'Message thread',
    description: 'Every message in one conversation.',
    kind: 'read',
    group: 'Messages',
    params: [{ name: 'conversation_id', type: 'string', description: 'Conversation id from get_messages.', required: true }],
    run: async (request, args) => {
      const conversationId = requireStr(args, 'conversation_id');
      const raw = await fetchConversationThreadRaw(request, conversationId);
      // GetConversationDetails answers an unknown id with a literal JSON null
      // (same as GetVisitNotes). Saying so beats rendering an empty thread.
      if (raw.requests.find((r) => r.path.includes('GetConversationDetails'))?.body === null) {
        throw new Error(
          `No conversation ${conversationId} on the active patient record. Check the id from get_messages, and that the right patient is active.`,
        );
      }
      return raw;
    },
    processor: conversationThreadProcessor,
  },
  {
    id: 'get_message_recipients',
    title: 'Message recipients',
    description: 'Providers and departments that can receive a new message.',
    kind: 'read',
    group: 'Messages',
    params: [],
    run: (request) => fetchMessageRecipientsRaw(request),
    processor: messageRecipientsProcessor,
  },
  {
    id: 'get_message_topics',
    title: 'Message topics',
    description: 'Topics/categories a new message can be filed under.',
    kind: 'read',
    group: 'Messages',
    // send_message resolves the topic itself and reports any substitution, so
    // listing them up front is rarely a step anyone needs to take.
    lessFrequentlyUsed: true,
    params: [],
    run: (request) => fetchMessageTopicsRaw(request),
    processor: messageTopicsProcessor,
  },
  {
    id: 'send_message',
    title: 'Send a message',
    description:
      'Send a new message to a provider or department. Names are matched against get_message_recipients — an ambiguous name is an error rather than a guess.',
    kind: 'write',
    group: 'Messages',
    params: [
      { name: 'recipient_name', type: 'string', description: 'Provider or department name, as shown by get_message_recipients.', required: true },
      { name: 'topic', type: 'string', description: 'Topic name, e.g. "Medical Question". Defaults to the first available topic.' },
      { name: 'subject', type: 'string', description: 'Subject line.', required: true },
      { name: 'message', type: 'string', description: 'Body of the message.', required: true },
    ],
    run: async (request, args) => {
      const token = await messagingToken(request);
      const [recipients, topics] = await Promise.all([
        getMessageRecipients(request, token),
        getMessageTopics(request, token),
      ]);
      const recipient = resolveRecipient(recipients, requireStr(args, 'recipient_name'));
      const { topic, substituted } = resolveTopic(topics, optStr(args, 'topic'));
      const result = await sendNewMessage(request, {
        recipient,
        topic,
        subject: requireStr(args, 'subject'),
        messageBody: requireStr(args, 'message'),
      });
      // Say who it went to and under which topic. The topic can be a
      // substitution when the requested one doesn't exist on this instance,
      // and a silent substitution is one the patient never gets told about.
      return {
        ...result,
        sent_to: recipient.displayName,
        topic_used: topic.displayName,
        ...(substituted
          ? { topic_substituted: `No topic matched "${optStr(args, 'topic')}"; used "${topic.displayName}" instead.` }
          : {}),
      };
    },
  },
  {
    id: 'send_reply',
    title: 'Reply to a message',
    description: 'Reply in an existing conversation.',
    kind: 'write',
    group: 'Messages',
    params: [
      { name: 'conversation_id', type: 'string', description: 'Conversation id from get_messages.', required: true },
      { name: 'message', type: 'string', description: 'Reply text.', required: true },
    ],
    run: (request, args) =>
      sendReply(request, {
        conversationId: requireStr(args, 'conversation_id'),
        messageBody: requireStr(args, 'message'),
      }),
  },
  {
    id: 'delete_message',
    title: 'Delete a conversation',
    description: 'Delete a message conversation from the inbox.',
    kind: 'write',
    group: 'Messages',
    lessFrequentlyUsed: true,
    params: [{ name: 'conversation_id', type: 'string', description: 'Conversation id from get_messages.', required: true }],
    run: (request, args) => deleteMessage(request, requireStr(args, 'conversation_id')),
  },
];
