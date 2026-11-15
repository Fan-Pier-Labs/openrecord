// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { NextRequest, NextResponse } from 'next/server';
import { listOutbox, type OutboxMessage } from '@/lib/outbox';

/**
 * Test-control endpoint (not part of MyChart's API surface, same as /reset and
 * /mode): the 2FA codes this fake has "texted" or "emailed", newest last.
 *
 *   GET /outbox                  → { messages: [...] } for every account
 *   GET /outbox?username=marge   → only marge's
 *
 * A browser (Accept: text/html) gets the same list as a page. POST /reset
 * empties it.
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username');
  const messages = listOutbox(username);
  if ((request.headers.get('accept') ?? '').includes('text/html')) {
    return new NextResponse(page(messages, username), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  return NextResponse.json({ messages });
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(messages: OutboxMessage[], username: string | null): string {
  const rows = [...messages]
    .reverse()
    .map(
      (m) =>
        `<tr><td>${m.channel === 'email' ? 'Email' : 'Text'}</td><td>${escape(m.username ?? '(no login)')}</td>` +
        `<td class="code">${escape(m.code)}</td><td>${escape(m.sentAt)}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <title>Fake MyChart — Outbox</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; color: #222; }
    h1 { color: #1a5276; }
    .scroll { overflow-x: auto; margin-top: 20px; }
    table { border-collapse: collapse; width: 100%; }
    td, th { white-space: nowrap; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #ddd; }
    .code { font-family: ui-monospace, monospace; font-size: 18px; font-weight: 600; letter-spacing: 2px; }
    .empty { color: #777; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>Fake MyChart — Outbox</h1>
  <p>The 2FA codes this server would have texted or emailed${username ? ` to <strong>${escape(username)}</strong>` : ''}, newest first. Refreshes every 5 seconds; <code>POST /reset</code> empties it.</p>
  ${
    messages.length
      ? `<div class="scroll"><table><thead><tr><th>Sent by</th><th>Account</th><th>Code</th><th>Sent at</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="empty">Nothing sent yet.</p>'
  }
</body>
</html>`;
}
