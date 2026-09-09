import { NextResponse, type NextRequest } from 'next/server';
import { conformToShape } from '@/lib/shape';
import * as shapes from '@/data/realShapes';
import { messagesPage } from '@/lib/html';
import { epicMessageBody } from '@/lib/messageBody';
import { state, type ConversationStore } from '@/lib/state';
import * as homer from '@/data/homer';
import { html, json } from './respond';
import { activeConversations } from './records';
import type { ExactRoutes, HandlerContext } from './types';

/**
 * Longest message body `SendMedicalAdviceRequest` will actually accept; anything longer is
 * dropped silently. Measured live — see the behavioral contract in `README.md` for what that
 * looks like on the wire and why it matters.
 *
 * Deliberately duplicated rather than imported from the scraper's own guard: this is the
 * server half of the contract, and a test sharing one constant with the client would pass no
 * matter which of the two was wrong.
 */
const MAX_MESSAGE_BODY_LENGTH = 500;

/**
 * Messages a conversation carries per response. Real MyChart inlines at most
 * this many into `GetConversationList`, and it is also the default page size
 * of `GetConversationMessages` / `GetConversationDetails` when the caller
 * sends no `maxReadMessages`. Sized around the real behaviour on purpose:
 * a thread longer than this is the only way `hasMoreMessages` is ever set,
 * and it is what forces a client to page.
 */
const CONVERSATION_PAGE_SIZE = 5;

/**
 * Conversations `GetConversationList` answers per page, newest thread first.
 * Measured on the one live instance with more than this many: 50, then the
 * remainder on a second request whose `localLoadParams.loadStartInstantISO`
 * is the first page's `oldestLoadedInstantISO`.
 */
const CONVERSATION_LIST_PAGE_SIZE = 50;

type FakeConversation = ConversationStore['conversations'][number];

export function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * `maxReadMessages` as the real endpoint reads it: a non-negative number is
 * the page size (0 legitimately means "none"), and anything else — absent,
 * negative, not a number — falls back to the default. Observed uncapped at
 * the top end, so a big value really does return the whole thread.
 */
function pageSize(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : CONVERSATION_PAGE_SIZE;
}

/**
 * The newest `limit` messages strictly older than `before`, oldest-first, plus
 * whether any older ones were left behind. `before` is an exclusive upper
 * bound on `deliveryInstantISO`; empty means "now", i.e. the newest page.
 */
function conversationPage(conv: FakeConversation, before: string, limit: number) {
  const ordered = [...conv.messages].sort((a, b) => a.deliveryInstantISO.localeCompare(b.deliveryInstantISO));
  const older = before ? ordered.filter(m => m.deliveryInstantISO < before) : ordered;
  const messages = older.slice(Math.max(0, older.length - limit));
  return { messages, hasMoreMessages: messages.length < older.length };
}

/** When a thread last moved: the instant of its newest message. This is what the inbox sorts and pages on. */
function latestInstant(conv: FakeConversation): string {
  return conv.messages.reduce((best, m) => (m.deliveryInstantISO > best ? m.deliveryInstantISO : best), '');
}

/**
 * One page of the inbox: the newest `limit` threads strictly older than
 * `before` (an exclusive bound on {@link latestInstant}; empty means "now"),
 * plus the `localSummary` the portal feeds back to ask for the next page.
 */
function conversationListPage(store: ConversationStore, before: string, limit: number) {
  const ordered = [...store.conversations].sort((a, b) => latestInstant(b).localeCompare(latestInstant(a)));
  const older = before ? ordered.filter(c => latestInstant(c) < before) : ordered;
  const page = older.slice(0, limit);
  return {
    conversations: page,
    localSummary: {
      hasMoreConversations: page.length < older.length,
      newestLoadedInstantISO: page.length ? latestInstant(page[0]!) : '',
      numberLoaded: page.length,
      oldestLoadedInstantISO: page.length ? latestInstant(page[page.length - 1]!) : '',
      oldestSearchedInstantISO: '',
      pagingInfo: 0,
    },
  };
}

function hasAttachments(conv: FakeConversation): boolean {
  return conv.messages.some(m => (m.attachments?.length ?? 0) > 0);
}

/**
 * The staff and patient-side participants of a thread, as the two key lists
 * every conversation response carries. They index the `users` / `viewers` maps
 * the listing and details responses return.
 */
function participantKeys(conv: FakeConversation) {
  const keys = (pick: (a: FakeConversation['messages'][number]['author']) => string | undefined) =>
    [...new Set(conv.messages.map(m => pick(m.author)).filter((k): k is string => !!k))];
  return { userKeys: keys(a => a.empKey), viewerKeys: keys(a => a.wprKey) };
}

/**
 * Both single-conversation read endpoints key on `id` (ASP.NET's model binding
 * is case-insensitive, so `Id` works too). `conversationId` — the name the
 * *mutating* endpoints take — is not accepted, and neither is an id for a
 * thread this record doesn't have.
 *
 * The two endpoints then REJECT DIFFERENTLY, which is why each has its own
 * failure helper below. Verified identically on all four live instances.
 */
function findConversation(request: NextRequest, body: Record<string, unknown>): FakeConversation | undefined {
  const id = asString(body.id) || asString(body.Id);
  if (!id) return undefined;
  return activeConversations(request).conversations.find(c => c.hthId === id);
}

/**
 * GetConversationMessages rejects with a bare 500 carrying ASP.NET's generic
 * error body — not a JSON error a client can act on.
 */
function conversationMessagesFailure(): NextResponse {
  return json({ Message: 'An error has occurred.' }, 500);
}

/**
 * GetConversationDetails rejects with **200 and a literal JSON `null`**, the
 * same way GetVisitNotes and GetLetterDetails answer unknown ids. A client that
 * only checks the status code reads that as a thread with nothing in it, which
 * on a medical record is the worst of the two failure modes — so the fake
 * models it rather than the tidier 500 its sibling gives.
 */
function conversationDetailsFailure(): NextResponse {
  return json(null);
}

/**
 * The attachment `dcsId` names, if the record this session is in holds it.
 * Server-side enforcement: another record's document id is unknown here,
 * exactly as a real instance answers for a `dcsId` off the active chart.
 */
export function findAttachment(request: NextRequest, dcsId: string) {
  if (!dcsId) return undefined;
  for (const conv of activeConversations(request).conversations) {
    for (const message of conv.messages) {
      const found = (message.attachments ?? []).find(a => a.dcsId === dcsId);
      if (found) return found;
    }
  }
  return undefined;
}

export const messagesGet: ExactRoutes = {
  'messaging': () => html(messagesPage()),
};

export const messagesPost: ExactRoutes = {
  'api/conversations/getconversationlist': async ({ request }) => {
    const store = activeConversations(request);
    const body = await readJsonBody(request);
    const loadParams = body.localLoadParams && typeof body.localLoadParams === 'object'
      ? body.localLoadParams as Record<string, unknown>
      : {};
    const page = conversationListPage(store, asString(loadParams.loadStartInstantISO), CONVERSATION_LIST_PAGE_SIZE);
    return json(conformToShape(shapes.getConversationList, {
      ...store,
      // The listing inlines only the newest page of each thread; everything
      // older is behind GetConversationMessages.
      conversations: page.conversations.map(conv => ({
        ...conv,
        hasAttachments: hasAttachments(conv),
        ...conversationPage(conv, '', CONVERSATION_PAGE_SIZE),
        ...participantKeys(conv),
      })),
      localSummary: page.localSummary,
    }));
  },

  'api/conversations/getconversationmessages': async ({ request }) => {
    const body = await readJsonBody(request);
    const conv = findConversation(request, body);
    if (!conv) return conversationMessagesFailure();
    return json(conformToShape(shapes.getConversationMessages, {
      hthId: conv.hthId,
      userOverrideNames: conv.userOverrideNames,
      ...participantKeys(conv),
      ...conversationPage(conv, asString(body.startInstantISO), pageSize(body.maxReadMessages)),
    }));
  },

  'api/conversations/getconversationdetails': async ({ request }) => {
    const body = await readJsonBody(request);
    const conv = findConversation(request, body);
    if (!conv) return conversationDetailsFailure();
    const store = activeConversations(request);
    return json(conformToShape(shapes.getConversationDetails, {
      hthId: conv.hthId,
      subject: conv.subject,
      previewText: conv.previewText,
      audience: conv.audience,
      totalMessages: conv.messages.length,
      hasAttachments: hasAttachments(conv),
      userOverrideNames: conv.userOverrideNames,
      // Only details carries the name maps, so this is the one response that
      // lets a client turn an author's empKey / wprKey into a display name.
      users: store.users,
      viewers: store.viewers,
      replyFlags: { canReply: true, cannotReplyReason: 0 },
      ...participantKeys(conv),
      // Always the newest page. Real MyChart also accepts a `messageId` to
      // centre the page on one message, but that variant was never captured,
      // so the fake doesn't guess at it.
      ...conversationPage(conv, '', pageSize(body.maxReadMessages)),
    }));
  },

  'api/conversations/getcomposeid': () => {
    state.composeIdCounter++;
    return json(`COMPOSE-${state.composeIdCounter}`);
  },
  'api/conversations/removecomposeid': () => json({ success: true }),
  'api/conversations/savereplydraft': () => json({ success: true }),
  'api/conversations/deletedraft': () => json({ success: true }),

  'api/conversations/deleteconversation': async ({ request }) => {
    try {
      const body = await request.json();
      activeConversations(request).conversations = activeConversations(request).conversations.filter(
        (c: { hthId: string }) => c.hthId !== body.conversationId
      );
      return json({ success: true });
    } catch {
      return json({ success: true });
    }
  },

  'api/conversations/sendreply': async ({ request }) => {
    try {
      const body = await request.json();
      const convId = body.conversationId || '';
      const conv = activeConversations(request).conversations.find(
        (c: { hthId: string }) => c.hthId === convId
      );
      if (conv) {
        const replyBody = Array.isArray(body.messageBody) ? body.messageBody[0] : (body.messageBody || body.body || '');
        conv.messages.push({
          wmgId: `MSG-${Date.now()}`,
          author: { wprKey: 'WPR-HOMER', displayName: '' },
          deliveryInstantISO: new Date().toISOString(),
          // Sent as text, stored and served as markup — Epic formats on the way
          // in, so a body never reads back the way it was posted.
          body: epicMessageBody(replyBody),
        });
      }
      // Real MyChart returns the conversation ID as a plain JSON string
      return json(convId);
    } catch {
      return json('');
    }
  },

  // ── Medical Advice Requests (new message compose) ─────────────
  'api/medicaladvicerequests/getsubtopics': ({ ds }) =>
    json(conformToShape(shapes.getSubTopics, ds.subtopics)),
  'api/medicaladvicerequests/getmedicaladvicerequestrecipients': ({ ds }) =>
    json(conformToShape(shapes.getMedicalAdviceRequestRecipients, ds.messageRecipients)),
  'api/medicaladvicerequests/getviewers': ({ ds }) => json(ds.messageViewers),
  'api/medicaladvicerequests/savemedicaladvicerequestdraft': () => json({ success: true }),

  'api/medicaladvicerequests/sendmedicaladvicerequest': async ({ request }) => {
    try {
      const body = await request.json();
      const msgBody = Array.isArray(body.messageBody) ? body.messageBody[0] : (body.messageBody || '');
      // An over-long body is swallowed, not rejected: 200, an empty conversation id, and
      // nothing filed. See MAX_MESSAGE_BODY_LENGTH above.
      if (String(msgBody).length > MAX_MESSAGE_BODY_LENGTH) {
        return json('');
      }
      const newConvId = `CONV-${Date.now()}`;
      const msgSubject = body.messageSubject || body.subject || 'New Message';
      const recipientName = body.recipient?.displayName || body.recipientName || 'Provider';
      activeConversations(request).conversations.unshift({
        hthId: newConvId,
        subject: msgSubject,
        previewText: msgBody,
        audience: [{ name: recipientName }],
        userOverrideNames: {},
        messages: [
          {
            wmgId: `MSG-${Date.now()}`,
            author: { wprKey: 'WPR-HOMER', displayName: '' },
            deliveryInstantISO: new Date().toISOString(),
            body: epicMessageBody(msgBody),
          },
        ],
      });
      return json(newConvId);
    } catch {
      return json(`CONV-${Date.now()}`);
    }
  },
};
