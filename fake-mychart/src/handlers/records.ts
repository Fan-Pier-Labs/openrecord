import type { NextRequest } from 'next/server';
import { getActiveProxyId, getSessionUsername } from '@/lib/session';
import { findUser, resolveActiveRecord, state, type ConversationStore, type FakeUser } from '@/lib/state';
import { selfDataset, type PatientDataset } from '@/lib/dataset';
import type { ProxySelectorModel } from '@/lib/html';
import * as homer from '@/data/homer';

/**
 * Which username is mid-2FA. Real MyChart uses a server-side flow state; here
 * we just remember the user attached to the temporary session created during
 * the password step so we know whose TOTP profile to mutate after they verify.
 */
export function currentUser(request: NextRequest): FakeUser | null {
  const cookie = request.headers.get('cookie');
  return findUser(getSessionUsername(cookie));
}

/** The record this session is currently in, or null before login. */
function activeRecord(request: NextRequest) {
  const user = currentUser(request);
  if (!user) return null;
  return resolveActiveRecord(user, getActiveProxyId(request.headers.get('cookie')));
}

/**
 * The id every piece of mutable per-record state below is keyed by: the active
 * proxy record, falling back to the account holder's own.
 */
function activeRecordId(request: NextRequest): string {
  const user = currentUser(request);
  return activeRecord(request)?.id ?? user?.selfProxyId ?? '';
}

/**
 * Chart data scoped to the record this session is currently in.
 *
 * This is what makes proxy switching mean something: after switching into a
 * child's record, every data endpoint reads that child's dataset. A record with
 * nothing in a given category returns an empty envelope — never the account
 * holder's data. Before login (no session, no user) it falls back to the
 * account holder's seed so unauthenticated paths behave as they always did.
 */
export function activeDataset(request: NextRequest): PatientDataset {
  if (!currentUser(request)) return selfDataset();
  return activeRecord(request)?.dataset ?? selfDataset();
}

/**
 * Emergency contacts for the record this session is in.
 *
 * These can't ride in the per-record dataset because they're mutable — the
 * add/update/remove endpoints write to them — so they live in `state`, keyed by
 * record id. A record with no entry yet gets a fresh empty list rather than
 * inheriting anyone else's.
 */
export function activeEmergencyContacts(request: NextRequest): typeof homer.emergencyContacts {
  const recordId = activeRecordId(request);
  const existing = state.emergencyContactsByRecord[recordId];
  if (existing) return existing;
  const created: typeof homer.emergencyContacts = {
    ...JSON.parse(JSON.stringify(homer.emergencyContacts)),
    contacts: [],
  };
  state.emergencyContactsByRecord[recordId] = created;
  return created;
}

/**
 * Message threads for the record this session is in. Mutable like emergency
 * contacts, so keyed by record id for the same reason — a child's chart must
 * not list the account holder's messages.
 */
export function activeConversations(request: NextRequest): ConversationStore {
  const recordId = activeRecordId(request);
  if (!state.conversationsByRecord[recordId]) {
    state.conversationsByRecord[recordId] = { conversations: [], users: {}, viewers: {} };
  }
  return state.conversationsByRecord[recordId];
}

/**
 * The proxy-record dropdown model for this session, or null when the account
 * has no proxy access at all. Real MyChart renders no selector for a
 * single-record account, and the scraper must cope with that.
 */
export function proxySelectorFor(request: NextRequest, user: FakeUser): ProxySelectorModel | null {
  if (user.proxySubjects.length === 0) return null;
  const active = activeRecord(request);
  return {
    self: { id: user.selfProxyId, displayName: user.displayName },
    subjects: user.proxySubjects.map(s => ({ id: s.id, displayName: s.displayName })),
    activeId: active?.id ?? user.selfProxyId,
  };
}
