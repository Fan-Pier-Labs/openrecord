/**
 * Resolving a name a caller typed to exactly one MyChart entity.
 *
 * The shared `resolveUnique` does the work — exact match first, then a unique
 * partial, and an error listing the candidates otherwise. These wrappers exist
 * so the messaging capabilities read clearly and so consumers of the npm
 * package can reach the same logic.
 */

import { resolveUnique } from '../resolveUnique';
import type { MessageRecipient, MessageTopic } from '../../scrapers/myChart/chart/messages/sendMessage';

// package can reach the same logic.

/** Resolve a provider name to exactly one recipient, or throw with the options. */
export function resolveRecipient(recipients: MessageRecipient[], query: string): MessageRecipient {
  return resolveUnique(recipients, query, { getName: (r) => r.displayName, label: 'recipient' });
}

/**
 * Resolve a topic name, falling back to the first available topic.
 *
 * Unlike a recipient, an unmatched topic is not worth refusing over: MyChart
 * requires a topic on every message and the category is cosmetic, so stranding
 * the patient's message over it would help nobody. The fallback is *reported*
 * rather than silent — `send_message` returns the topic it actually used, so
 * the reply can say which one, instead of the substitution being invisible at
 * the call site.
 */
export function resolveTopic(
  topics: MessageTopic[],
  query: string | undefined,
): { topic: MessageTopic; substituted: boolean } {
  const firstTopic = topics[0];
  if (!firstTopic) throw new Error('No message topics are available on this MyChart.');
  const wanted = (query ?? '').toLowerCase().trim();
  if (!wanted) return { topic: firstTopic, substituted: false };
  const match = topics.find((t) => t.displayName.toLowerCase().includes(wanted));
  return match ? { topic: match, substituted: false } : { topic: firstTopic, substituted: true };
}
