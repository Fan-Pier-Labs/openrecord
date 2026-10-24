// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { SANDBOX_INSTANCE } from '../../scrapers/list-all-mycharts/searchDirectory';
import { accountId, normalizeHostname, readAccounts, removeAccount, upsertAccount } from './credential-store';
import { clearSession } from './session-manager';

/**
 * The fake MyChart demo and real accounts are never connected together: with
 * both saved, Claude could read the fictional chart while the user believes it
 * is theirs, or the reverse. A real account replaces the demo (its login is
 * throwaway); the demo is refused while real accounts exist, because making
 * room would delete the user's saved logins and passkeys.
 */

const DEMO_HOSTNAME = normalizeHostname(SANDBOX_INSTANCE.url);

export const isDemoHostname = (hostname: string) => normalizeHostname(hostname) === DEMO_HOSTNAME;

/** Why `hostname` can't be connected now, or null when it can. Checked before logging in. */
export function demoConflict(hostname: string): string | null {
  if (!isDemoHostname(hostname)) return null;
  const real = readAccounts().filter((a) => !isDemoHostname(a.hostname));
  if (!real.length) return null;
  return (
    `The fake MyChart can't be connected while real accounts are: ${real.map(accountId).join(', ')}. ` +
    'Tell the user it would mean disconnecting those first (disconnect_account deletes their saved login and passkey). ' +
    'Do not disconnect them unless the user explicitly asks.'
  );
}

/** Save a login that just succeeded, enforcing the rule above. */
export function saveAccount(hostname: string, username: string, password: string): void {
  const conflict = demoConflict(hostname);
  if (conflict) throw new Error(conflict);
  upsertAccount({ hostname: normalizeHostname(hostname), username, password });
  if (isDemoHostname(hostname)) return;
  for (const demo of readAccounts().filter((a) => isDemoHostname(a.hostname))) {
    clearSession(accountId(demo));
    removeAccount(demo.hostname, demo.username);
  }
}
