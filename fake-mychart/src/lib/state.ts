// Centralized in-memory mutable state for fake-mychart.
//
// All runtime mutations (sessions, per-user TOTP/passkey config, conversations,
// emergency contacts, booked appointments) live here. resetState() restores
// every field to its starting value, which the /reset endpoint uses to wipe
// the server back to a clean slate without restarting the process.

import * as homer from '@/data/homer';
import { resetSessions } from './session';
import { resetMountMode } from './mount';
import { resetProxyDiscoveryMode } from './proxy';

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

export type FakeUserProfile = {
  name: string;
  dob: string;
  mrn: string;
  pcp: string;
};

/**
 * A patient record the account holder has proxy access to — Epic's model for a
 * parent seeing a child's chart. `id` is what shows up as `Id` in the
 * `/ProxySwitch` payload and as `eid` in the switch URL. The account holder's
 * own record is NOT in this list; it is represented separately with the
 * empty-string id, exactly as real MyChart does.
 */
export type ProxySubject = {
  id: string;
  displayName: string;
  profile: FakeUserProfile;
};

export type FakeUser = {
  username: string;
  password: string;
  displayName: string;
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
  passkeys: Passkey[];
  /** Other patients' records this account can switch into. May be empty. */
  proxySubjects: ProxySubject[];
};

function seedUsers(): Record<string, FakeUser> {
  return {
    homer: {
      username: 'homer',
      password: 'donuts123',
      displayName: 'Homer Jay Simpson',
      profile: {
        name: homer.profile.name,
        dob: homer.profile.dob,
        mrn: homer.profile.mrn,
        pcp: homer.profile.pcp,
      },
      requires2faAtLogin: false,
      totpEnabled: false,
      passkeys: [],
      // Homer has proxy access to both kids, so discover → switch → switch
      // back is exercisable, and so "resolve by display name" has more than
      // one candidate to choose between.
      proxySubjects: [
        {
          id: 'PROXY-BART',
          displayName: 'Bart Simpson',
          profile: {
            name: 'Bartholomew JoJo Simpson',
            dob: '04/01/2014',
            mrn: '744',
            pcp: 'Dr. Julius Hibbert, MD',
          },
        },
        {
          id: 'PROXY-LISA',
          displayName: 'Lisa Simpson',
          profile: {
            name: 'Lisa Marie Simpson',
            dob: '05/09/2016',
            mrn: '745',
            pcp: 'Dr. Julius Hibbert, MD',
          },
        },
      ],
    },
    marge: {
      username: 'marge',
      password: 'donuts123',
      displayName: 'Marge Simpson',
      profile: {
        name: 'Marge Bouvier Simpson',
        dob: '03/19/1956',
        mrn: '743',
        pcp: 'Dr. Julius Hibbert, MD',
      },
      requires2faAtLogin: true,
      totpEnabled: true,
      passkeys: [],
      // Marge has no proxy access — the "single-record account" case.
      proxySubjects: [],
    },
  };
}

type State = {
  users: Record<string, FakeUser>;
  conversations: typeof homer.conversations;
  emergencyContacts: typeof homer.emergencyContacts;
  ecIdCounter: number;
  composeIdCounter: number;
  passkeyIdCounter: number;
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

function freshState(): State {
  return {
    users: seedUsers(),
    conversations: JSON.parse(JSON.stringify(homer.conversations)),
    emergencyContacts: JSON.parse(JSON.stringify(homer.emergencyContacts)),
    ecIdCounter: 100,
    composeIdCounter: 1000,
    passkeyIdCounter: 0,
    bookedAppointments: [],
  };
}

export const state: State = freshState();

export function resetState(): void {
  const next = freshState();
  state.users = next.users;
  state.conversations = next.conversations;
  state.emergencyContacts = next.emergencyContacts;
  state.ecIdCounter = next.ecIdCounter;
  state.composeIdCounter = next.composeIdCounter;
  state.passkeyIdCounter = next.passkeyIdCounter;
  state.bookedAppointments.length = 0;
  resetSessions();
  resetMountMode();
  resetProxyDiscoveryMode();
}

/**
 * The record a session is currently looking at: the account holder's own when
 * `activeProxyId` is empty, otherwise one of their proxy subjects. Returns null
 * for an id the user has no access to, which callers must treat as a failed
 * switch rather than silently falling back to self.
 */
export function resolveActiveRecord(
  user: FakeUser,
  activeProxyId: string,
): { id: string; displayName: string; profile: FakeUserProfile; isSelf: boolean } | null {
  if (!activeProxyId) {
    return { id: '', displayName: user.displayName, profile: user.profile, isSelf: true };
  }
  const subject = user.proxySubjects.find(s => s.id === activeProxyId);
  if (!subject) return null;
  return { id: subject.id, displayName: subject.displayName, profile: subject.profile, isSelf: false };
}

export function findUser(username: string | null | undefined): FakeUser | null {
  if (!username) return null;
  return state.users[username.toLowerCase()] ?? null;
}

export function findUserByPasskey(rawId: string): FakeUser | null {
  for (const user of Object.values(state.users)) {
    if (user.passkeys.some(pk => pk.rawId === rawId)) return user;
  }
  return null;
}
