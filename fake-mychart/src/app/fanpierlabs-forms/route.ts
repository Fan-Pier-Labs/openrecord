// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { NextRequest, NextResponse } from 'next/server';

/**
 * `POST /fanpierlabs-forms` — stands in for the shared `fanpierlabs-forms`
 * Lambda (`fanpierlabs-projects-email-submission`, not this repo) that
 * `send_feature_request` posts to. Copied from its handler (`index.mjs`):
 *
 *  - a body that is not JSON → 400 `{"error":"invalid JSON body"}`
 *  - no well-formed `email` → 400 `{"error":"a valid \`email\` field is required"}`
 *  - anything else → 200 `{"ok":true}`, whatever the other fields are
 *
 * The real one then logs and emails the submission; this one does neither.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const email = (typeof body?.email === 'string' ? body.email : '').trim();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'a valid `email` field is required' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
