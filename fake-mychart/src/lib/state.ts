// Centralized in-memory mutable state for fake-mychart.
//
// All runtime mutations (sessions, per-user TOTP/passkey config, conversations,
// emergency contacts, booked appointments) live here. resetState() restores
// every field to its starting value, which the /reset endpoint uses to wipe
// the server back to a clean slate without restarting the process.

import * as homer from '@/data/homer';
import { HOMER_PROXY_RECORDS } from '@/data/kids';
import { buildDataset, selfDataset, resetDatasetCache, type PatientDataset } from './dataset';
import { resetSessions } from './session';
import { resetMountMode } from './mount';
import { resetProxyDiscoveryMode } from './proxy';
import { resetRequireTerms } from './terms';

/**
 * Homer's own patient record id. Real instances give the account holder a real
 * opaque id just like a proxy record — see `FakeUser.selfProxyId`.
 */
export const HOMER_SELF_PROXY_ID =
  'WP-2KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MTHW1C';

/** Marge's own record id. She has no proxy access, but she still has a record. */
export const MARGE_SELF_PROXY_ID =
  'WP-8HRTVN3QZ5XKMW2JBC7LFD9PYGA4SEU6KQMWJ1RXTV5NZBHFC3LPD8YSGA2EK7UNQXWRJ6MVTZ4HC9';

export type Passkey = {
  rawId: string;
  name: string;
  createdOnDevice: string;
  creationInstant: string;
  lastUsedInstant: string | null;
  // Highest WebAuthn signature counter the server has accepted for this
  // credential. Real MyChart (like any WebAuthn RP) requires each assertion's
  // counter to be strictly greater than this; we mirror that to catch
  // client/server counter desync. 0 = no assertion accepted yet.
  signCount: number;
};

/**
 * Message threads for one patient record. Structural rather than
 * `typeof homer.conversations` so an empty record can be represented — the
 * seed's `users` map has literal keys that a fresh record obviously lacks.
 */
export type ConversationStore = {
  conversations: typeof homer.conversations.conversations;
  users: Record<string, { name: string }>;
  hasMoreMessages: boolean;
};

export type FakeUserProfile = {
  name: string;
  dob: string;
  mrn: string;
  pcp: string;
};

/**
 * A patient record the account holder has proxy access to — Epic's model for a
 * parent seeing a child's chart. `id` is what shows up as `Id` in the
 * `/ProxySwitch` payload and as `eid` in the switch URL.
 *
 * The account holder's own record is not in this list — it's the user itself,
 * and it carries its own `selfProxyId`. Both kinds of record have a real,
 * non-empty opaque `WP-…` id; "self" is signalled by `IsSelf`, never by the id
 * being blank. See the note on `FakeUser.selfProxyId`.
 */
export type ProxySubject = {
  id: string;
  displayName: string;
  profile: FakeUserProfile;
  /** This patient's own chart data. Never falls back to the account holder's. */
  dataset: PatientDataset;
};

export type FakeUser = {
  username: string;
  password: string;
  displayName: string;
  // Contact info used by the account-recovery flow (one-time code destination
  // + username lookup) and by self-signup duplicate-email detection. Optional
  // so callers that build ad-hoc users keep compiling, but the seeds set them.
  email?: string;
  mobilePhone?: string;
  // Profile data rendered on /Home and parsed by the profile scraper.
  // Each user gets a distinct name/dob/mrn so integration tests can verify
  // which session was actually hit when multiple accounts share a hostname.
  profile: FakeUserProfile;
  // Whether the login flow itself demands the 2FA step. Seeded per user and
  // never mutated by the TOTP toggle endpoint — that endpoint only flips the
  // UI-visible totpEnabled flag, matching the prior fake-mychart behavior so
  // the CLI's --set-up-totp / --disable-totp round-trip can keep using
  // username+password without juggling a 2FA code.
  requires2faAtLogin: boolean;
  // What the settings UI and getTwoFactorInfo report. Mutable via the toggle
  // endpoint. Independent of requires2faAtLogin.
  totpEnabled: boolean;
  /**
   * The Base32 secret currently bound to this account, or null when TOTP is
   * off. Set when the account opts in, cleared when it opts out. VerifyCode
   * checks submitted codes against it, exactly as a real instance does.
   */
  totpSecret: string | null;
  /**
   * A secret issued by TotpQrCode but not yet opted into. Real MyChart mints a
   * fresh secret on each call and only commits it once a valid code proves the
   * client stored it, so an abandoned setup leaves the account untouched.
   */
  pendingTotpSecret: string | null;
  passkeys: Passkey[];
  /**
   * The opaque id of this account holder's OWN patient record.
   *
   * Confirmed against UCSF, Renown and Carson Tahoe: the self entry in
   * `/ProxySwitch` carries a real non-empty `WP-…` id exactly like a proxy
   * record does, and is distinguished only by `IsSelf: true`. An earlier
   * version of this fake modelled self as the empty string; that shape was
   * never observed on any real instance and has been removed. Anything needing
   * "the account holder" must key off `IsSelf`.
   *
   * Empty for accounts with no proxy access, which expose no proxy surface.
   */
  selfProxyId: string;
  /** Other patients' records this account can switch into. May be empty. */
  proxySubjects: ProxySubject[];
};

function seedUsers(): Record<string, FakeUser> {
  return {
    homer: {
      username: 'homer',
      password: 'donuts123',
      displayName: 'Homer Jay Simpson',
      email: 'homer@springfield.net',
      mobilePhone: '555-555-7890',
      profile: {
        name: homer.profile.name,
        dob: homer.profile.dob,
        mrn: homer.profile.mrn,
        pcp: homer.profile.pcp,
      },
      requires2faAtLogin: false,
      totpEnabled: false,
      totpSecret: null,
      pendingTotpSecret: null,
      passkeys: [],
      selfProxyId: HOMER_SELF_PROXY_ID,
      // Homer has proxy access to all three kids, so discover → switch →
      // switch back is exercisable, "resolve by display name" has several
      // candidates to choose between, and the multi-proxy case observed on
      // Carson Tahoe is covered.
      proxySubjects: HOMER_PROXY_RECORDS.map(kid => ({
        id: kid.id,
        displayName: kid.displayName,
        profile: kid.profile,
        dataset: buildDataset(kid.dataset),
      })),
    },
    marge: {
      username: 'marge',
      password: 'donuts123',
      displayName: 'Marge Simpson',
      email: 'marge@springfield.net',
      mobilePhone: '555-555-7204',
      profile: {
        name: 'Marge Bouvier Simpson',
        dob: '03/19/1956',
        mrn: '743',
        pcp: 'Dr. Julius Hibbert, MD',
      },
      requires2faAtLogin: true,
      totpEnabled: true,
      // Marge is seeded with TOTP already on, so she needs a secret to go with
      // it — an "enabled" account with no secret could never verify a code.
      // The standard RFC 4648 test vector, so a test can derive her codes.
      totpSecret: 'JBSWY3DPEHPK3PXP',
      pendingTotpSecret: null,
      passkeys: [],
      // Marge has no proxy access — the single-record account. She still has
      // her own record id, because `/ProxySwitch` on such an account returns a
      // one-entry list containing the account holder rather than an empty one.
      // Captured on two live instances; the empty list modelled here before was
      // never observed anywhere.
      selfProxyId: MARGE_SELF_PROXY_ID,
      proxySubjects: [],
    },
  };
}

// A signup in progress: the demographics (self-signup) or pre-matched identity
// (activation code) are captured, a one-time contact code has been "sent", and
// the flow is waiting on contact verification + a chosen username/password.
export type PendingSignup = {
  email: string;
  mobilePhone?: string;
  displayName: string;
  // The fixed one-time code we "sent" (always TEST_OTP_CODE here; real MyChart
  // emails/texts a random code). Verified before the account can be created.
  contactCode: string;
  contactVerified: boolean;
};

// A recovery in progress: the contact is known, a code has been "sent", and the
// resolved username is held until the code is verified (then revealed).
export type PendingRecovery = {
  contactInfo: string;
  username: string;
  code: string;
  codeVerified: boolean;
};

// The fixed one-time code the fake "sends" for signup contact verification and
// account recovery, mirroring the fixed 2FA code (123456) the login flow uses.
export const TEST_OTP_CODE = '123456';

type State = {
  users: Record<string, FakeUser>;
  /**
   * Message threads, keyed by patient record id. Per-patient in real MyChart
   * and mutable (send/reply/delete write to them), so they live here rather
   * than in the immutable per-record dataset — same reasoning as emergency
   * contacts. Without the keying, a child's chart lists the parent's messages.
   */
  conversationsByRecord: Record<string, ConversationStore>;
  /**
   * Emergency contacts, keyed by patient record id.
   *
   * These are per-patient in real MyChart, and they are *mutable* — the add /
   * update / remove endpoints write to them — so they can't live in the
   * immutable per-record dataset. Keying by record id is what stops a child's
   * chart from listing the account holder's contacts.
   */
  emergencyContactsByRecord: Record<string, typeof homer.emergencyContacts>;
  ecIdCounter: number;
  composeIdCounter: number;
  passkeyIdCounter: number;
  // Pre-auth onboarding flows (keyed by opaque token handed back to the client).
  pendingSignups: Record<string, PendingSignup>;
  pendingRecoveries: Record<string, PendingRecovery>;
  // Valid activation codes (enrollment-letter / AVS codes) → seeded identity.
  activationCodes: Record<string, { displayName: string; email: string }>;
  signupTokenCounter: number;
  bookedAppointments: Array<{
    confirmationNumber: string;
    slotId: string;
    provider: string;
    department: string;
    location: string;
    visitType: string;
    date: string;
    time: string;
    reason: string;
  }>;
};

// Seed one known-good activation code so the activation-code signup path is
// testable end-to-end. Format mirrors Epic's 3-part code.
function seedActivationCodes(): Record<string, { displayName: string; email: string }> {
  return {
    'ABCDE-FGHIJ-KLMNO': { displayName: 'Bart Simpson', email: 'bart@springfield.net' },
  };
}

function freshState(): State {
  return {
    users: seedUsers(),
    conversationsByRecord: {
      [HOMER_SELF_PROXY_ID]: JSON.parse(JSON.stringify(homer.conversations)),
      ...Object.fromEntries(HOMER_PROXY_RECORDS.map(kid => [
        kid.id,
        { conversations: [], users: {}, hasMoreMessages: false },
      ])),
    },
    // Only the account holder is seeded with contacts; each child starts
    // empty, which is what their chart must report rather than the parent's.
    emergencyContactsByRecord: {
      [HOMER_SELF_PROXY_ID]: JSON.parse(JSON.stringify(homer.emergencyContacts)),
      ...Object.fromEntries(HOMER_PROXY_RECORDS.map(kid => [kid.id, { relationships: [] }])),
    },
    ecIdCounter: 100,
    composeIdCounter: 1000,
    passkeyIdCounter: 0,
    pendingSignups: {},
    pendingRecoveries: {},
    activationCodes: seedActivationCodes(),
    signupTokenCounter: 0,
    bookedAppointments: [],
  };
}

export const state: State = freshState();

export function resetState(): void {
  const next = freshState();
  state.users = next.users;
  state.conversationsByRecord = next.conversationsByRecord;
  state.emergencyContactsByRecord = next.emergencyContactsByRecord;
  state.ecIdCounter = next.ecIdCounter;
  state.composeIdCounter = next.composeIdCounter;
  state.passkeyIdCounter = next.passkeyIdCounter;
  state.pendingSignups = next.pendingSignups;
  state.pendingRecoveries = next.pendingRecoveries;
  state.activationCodes = next.activationCodes;
  state.signupTokenCounter = next.signupTokenCounter;
  state.bookedAppointments.length = 0;
  resetSessions();
  resetMountMode();
  resetProxyDiscoveryMode();
  resetRequireTerms();
  resetDatasetCache();
}

export type ActiveRecord = {
  id: string;
  displayName: string;
  profile: FakeUserProfile;
  isSelf: boolean;
  /** Chart data scoped to this patient. */
  dataset: PatientDataset;
};

/**
 * The record a session is currently looking at.
 *
 * A session with no stored `activeProxyId` is on the account holder's own
 * record, as is one holding the account holder's real `selfProxyId` — both mean
 * self. Returns null for an id the account has no access to, which callers must
 * treat as a failed switch rather than silently falling back to self.
 */
export function resolveActiveRecord(user: FakeUser, activeProxyId: string): ActiveRecord | null {
  if (!activeProxyId || activeProxyId === user.selfProxyId) {
    return {
      id: user.selfProxyId,
      displayName: user.displayName,
      profile: user.profile,
      isSelf: true,
      dataset: selfDataset(),
    };
  }
  const subject = user.proxySubjects.find(s => s.id === activeProxyId);
  if (!subject) return null;
  return {
    id: subject.id,
    displayName: subject.displayName,
    profile: subject.profile,
    isSelf: false,
    dataset: subject.dataset,
  };
}

export function findUser(username: string | null | undefined): FakeUser | null {
  if (!username) return null;
  return state.users[username.toLowerCase()] ?? null;
}

/**
 * Find a user by their recovery contact (email or mobile phone), normalizing
 * away formatting on phone numbers so "555-555-7890" matches "5555557890".
 */
export function findUserByContact(contactInfo: string | null | undefined): FakeUser | null {
  if (!contactInfo) return null;
  const needle = contactInfo.trim().toLowerCase();
  const digits = (s: string) => s.replace(/\D/g, '');
  for (const user of Object.values(state.users)) {
    if (user.email && user.email.toLowerCase() === needle) return user;
    if (user.mobilePhone && digits(user.mobilePhone) === digits(needle) && digits(needle).length >= 7) {
      return user;
    }
  }
  return null;
}

/** Generate the next opaque signup/recovery token. */
export function nextSignupToken(prefix: string): string {
  state.signupTokenCounter++;
  return `${prefix}-${state.signupTokenCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export function findUserByPasskey(rawId: string): FakeUser | null {
  for (const user of Object.values(state.users)) {
    if (user.passkeys.some(pk => pk.rawId === rawId)) return user;
  }
  return null;
}
