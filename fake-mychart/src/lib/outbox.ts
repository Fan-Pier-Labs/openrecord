// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import crypto from 'crypto';

/**
 * The texts and emails this fake "sends": one per 2FA SendCode. Real MyChart
 * delivers a fresh code to the patient's phone or inbox; here it lands in this
 * list, which `GET /outbox` exposes so a test (or a person) can read the code
 * and finish the sign-in the way a patient would. It also lets a test assert
 * that a flow sent nothing.
 */
export type OutboxMessage = {
  /** 1-based, in send order. */
  id: number;
  /** The account the 2FA challenge belongs to. Null if SendCode came without a pending login. */
  username: string | null;
  channel: 'email' | 'sms';
  code: string;
  sentAt: string;
};

const messages: OutboxMessage[] = [];

/** Which channel a SendCode body asks for. `deliveryMethodEmail=false` is the legacy SMS shape. */
export function channelFromSendCodeBody(body: string): 'email' | 'sms' {
  return new URLSearchParams(body).get('deliveryMethodEmail') === 'true' ? 'email' : 'sms';
}

export function deliverCode(username: string | null, channel: 'email' | 'sms'): OutboxMessage {
  const message: OutboxMessage = {
    id: messages.length + 1,
    username,
    channel,
    code: crypto.randomInt(0, 1_000_000).toString().padStart(6, '0'),
    sentAt: new Date().toISOString(),
  };
  messages.push(message);
  return message;
}

/** Whether `code` is one this fake sent to `username`. */
export function wasSentTo(username: string | null, code: string): boolean {
  return messages.some((m) => m.username === username && m.code === code);
}

export function listOutbox(username?: string | null): OutboxMessage[] {
  return username ? messages.filter((m) => m.username === username) : [...messages];
}

export function resetOutbox(): void {
  messages.length = 0;
}
