// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/** One 2FA code fake-mychart "sent". See fake-mychart/README.md, "The outbox". */
export type OutboxMessage = {
  id: number;
  username: string | null;
  channel: 'email' | 'sms';
  code: string;
  sentAt: string;
};

/** Every code fake-mychart has texted or emailed to `username` since the last reset, oldest first. */
export async function readOutbox(host: string, username: string): Promise<OutboxMessage[]> {
  const res = await fetch(`http://${host}/outbox?username=${encodeURIComponent(username)}`);
  if (!res.ok) throw new Error(`Failed to read fake-mychart's outbox on ${host}: ${res.status}`);
  return ((await res.json()) as { messages: OutboxMessage[] }).messages;
}
