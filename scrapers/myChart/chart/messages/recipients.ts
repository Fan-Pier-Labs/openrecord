/**
 * Read side of composing a message: who can be written to and about what.
 * `sendMessage.ts` keeps its own `getMessageRecipients` / `getMessageTopics`
 * for the send flow; these are the capability-facing fetches that record the
 * exchange.
 */
import type { MyChartRequest } from '../../core/myChartRequest';
import { RawCollector, type RawResponse } from '../../core/rawResponse';
import { MissingVerificationTokenError } from '../../core/util';
import { getVerificationToken } from './communicationCenterToken';
import {
  messageRecipientsProcessor,
  messageTopicsProcessor,
  type MessageRecipientsStandard,
  type MessageTopicsStandard,
} from './recipients.processor';

export type {
  MessageRecipientStandard,
  MessageRecipientsStandard,
  MessageTopicStandard,
  MessageTopicsStandard,
} from './recipients.processor';
export { messageRecipientsProcessor, messageTopicsProcessor, recipientList } from './recipients.processor';

const COMMUNICATION_CENTER = '/app/communication-center';

async function requireMessagingToken(mychartRequest: MyChartRequest): Promise<string> {
  const token = await getVerificationToken(mychartRequest);
  if (!token) throw new MissingVerificationTokenError(COMMUNICATION_CENTER);
  return token;
}

async function postMedicalAdvice(collector: RawCollector, action: string, token: string, organizationId: string): Promise<void> {
  await collector.send({
    path: `/api/medicaladvicerequests/${action}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      __RequestVerificationToken: token,
    },
    body: JSON.stringify({ organizationId }),
  });
}

/** `POST /api/medicaladvicerequests/GetMedicalAdviceRequestRecipients`, with the communication-center token. */
export async function fetchMessageRecipientsRaw(mychartRequest: MyChartRequest, organizationId = ''): Promise<RawResponse> {
  const token = await requireMessagingToken(mychartRequest);
  const collector = new RawCollector(mychartRequest);
  await postMedicalAdvice(collector, 'GetMedicalAdviceRequestRecipients', token, organizationId);
  return collector.toRaw();
}

/** `POST /api/medicaladvicerequests/GetSubtopics`, with the communication-center token. */
export async function fetchMessageTopicsRaw(mychartRequest: MyChartRequest, organizationId = ''): Promise<RawResponse> {
  const token = await requireMessagingToken(mychartRequest);
  const collector = new RawCollector(mychartRequest);
  await postMedicalAdvice(collector, 'GetSubtopics', token, organizationId);
  return collector.toRaw();
}

/** The standard object — what `mode: 'json'` returns. */
export async function listMessageRecipients(mychartRequest: MyChartRequest, organizationId = ''): Promise<MessageRecipientsStandard> {
  return messageRecipientsProcessor.standard(await fetchMessageRecipientsRaw(mychartRequest, organizationId));
}

/** The standard object — what `mode: 'json'` returns. */
export async function listMessageTopics(mychartRequest: MyChartRequest, organizationId = ''): Promise<MessageTopicsStandard> {
  return messageTopicsProcessor.standard(await fetchMessageTopicsRaw(mychartRequest, organizationId));
}
