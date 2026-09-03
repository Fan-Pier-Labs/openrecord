/**
 * Message recipients and topics processors. Field decisions:
 * docs/processor-layer-proposal.md, `get_message_recipients` and
 * `get_message_topics`.
 *
 * `GetMedicalAdviceRequestRecipients` is a bare array on every captured
 * instance; the scraper it replaced also tolerated six wrapper keys, which
 * are honoured here so an instance that wraps the list does not read as
 * "nobody to message".
 */

import { bodyOf, type RawResponse } from '../../core/rawResponse';
import type { Processor } from '../../processors/processor';
import { list, num, rec, textOrNull } from '../../processors/read';

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

const WRAPPER_KEYS = ['recipients', 'recipientList', 'Providers', 'providers', 'ProviderList', 'providerList'];

/** The recipient list, whether the instance sent it bare or under one of the known wrapper keys. */
export function recipientList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const wrapper = rec(body);
  for (const key of WRAPPER_KEYS) {
    if (Array.isArray(wrapper[key])) return wrapper[key] as unknown[];
  }
  return [];
}

export const messageRecipientsProcessor: Processor<MessageRecipientsStandard> = {
  standard(raw: RawResponse): MessageRecipientsStandard {
    return {
      recipients: recipientList(bodyOf(raw, 'GetMedicalAdviceRequestRecipients')).map((value) => {
        const r = rec(value);
        return {
          displayName: textOrNull(r.displayName),
          specialty: textOrNull(r.specialty),
          pcpTypeDisplayName: textOrNull(r.pcpTypeDisplayName),
          recipientType: num(r.recipientType),
          oocContext: num(r.oocContext),
          userId: textOrNull(r.userId),
          departmentId: textOrNull(r.departmentId),
          poolId: textOrNull(r.poolId),
          providerId: textOrNull(r.providerId),
        };
      }),
    };
  },
  concise(standard) {
    return {
      recipients: standard.recipients.map((r) => ({
        displayName: r.displayName,
        specialty: r.specialty,
        pcpTypeDisplayName: r.pcpTypeDisplayName,
      })),
    };
  },
};

export const messageTopicsProcessor: Processor<MessageTopicsStandard> = {
  standard(raw: RawResponse): MessageTopicsStandard {
    const body = rec(bodyOf(raw, 'GetSubtopics'));
    return {
      topicList: list(body.topicList).map((value) => ({
        displayName: textOrNull(rec(value).displayName),
        value: textOrNull(rec(value).value),
      })),
    };
  },
  concise: (standard) => standard,
};
