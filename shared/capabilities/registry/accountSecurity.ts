/**
 * The `Account security` group.
 *
 * `account` kind: these change how the patient logs in, so no client offers
 * them to a model. They are reachable from the CLI's flags, the desktop
 * extension's setup surface and the mobile app's settings screen.
 */

import { setupPasskey, listPasskeys, deletePasskey } from '../../../scrapers/myChart/auth/setupPasskey';
import { serializeCredential } from '../../../scrapers/myChart/auth/softwareAuthenticator';
import { setupTotp, disableTotp } from '../../../scrapers/myChart/auth/setupTotp';
import { optStr } from '../args';
import type { CapabilityImpl } from '../types';

export const ACCOUNT_SECURITY_CAPABILITIES: readonly CapabilityImpl[] = [
  {
    id: 'register_passkey',
    title: 'Register a passkey',
    description: 'Register a passkey on this MyChart account so future logins skip the password and the 2FA prompt.',
    kind: 'account',
    group: 'Account security',
    // The whole group is a sign-in setting rather than a chart operation, and
    // the CLI drives all five from dedicated flags (`--set-up-passkey`,
    // `--set-up-totp`, …) that the help text lists in their own section.
    lessFrequentlyUsed: true,
    params: [],
    run: async (request, _args, ctx) => {
      const credential = await setupPasskey(request);
      if (!credential) {
        throw new Error('MyChart did not return a credential. Some instances disable passkey registration from the patient portal.');
      }
      const serialized = serializeCredential(credential);
      await ctx?.savePasskey?.(serialized);
      return { registered: true, saved: !!ctx?.savePasskey };
    },
  },
  {
    id: 'list_passkeys',
    title: 'List passkeys',
    description: 'List the passkeys registered on this MyChart account.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [],
    run: async (request) => {
      const passkeys = await listPasskeys(request);
      if (!passkeys) throw new Error('MyChart would not list passkeys for this account.');
      return { count: passkeys.length, passkeys };
    },
  },
  {
    id: 'delete_passkey',
    title: 'Delete passkeys',
    description: 'Delete a passkey from the MyChart account by rawId, or every registered passkey when no id is given.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [{ name: 'raw_id', type: 'string', description: 'rawId from list_passkeys. Omit to delete every passkey on the account.' }],
    run: async (request, args) => {
      const rawId = optStr(args, 'raw_id');
      const passkeys = (await listPasskeys(request)) ?? [];
      const targets = (rawId ? passkeys.filter((p) => (p as { rawId?: string }).rawId === rawId) : passkeys)
        .map((p) => (p as { rawId?: string }).rawId)
        .filter((id): id is string => !!id);
      if (targets.length === 0) {
        throw new Error(rawId ? `No passkey with rawId ${rawId}.` : 'No passkeys are registered on this account.');
      }
      const deleted: string[] = [];
      const failed: string[] = [];
      for (const id of targets) {
        if (await deletePasskey(request, id)) deleted.push(id);
        else failed.push(id);
      }
      return { deleted, failed };
    },
  },
  {
    id: 'setup_totp',
    title: 'Set up an authenticator app',
    description: 'Turn on authenticator-app (TOTP) two-factor authentication and store the secret locally so future logins can generate their own codes.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [],
    run: async (request, _args, ctx) => {
      if (!ctx?.password) throw new Error('The account password is required to set up TOTP.');
      const result = await setupTotp(request, ctx.password);
      if (!result.secret) throw new Error(result.error || 'MyChart did not return a TOTP secret.');
      await ctx.saveTotpSecret?.(result.secret);
      return { enabled: true, saved: !!ctx.saveTotpSecret };
    },
  },
  {
    id: 'disable_totp',
    title: 'Turn off the authenticator app',
    description: 'Turn off authenticator-app (TOTP) two-factor authentication on this MyChart account.',
    kind: 'account',
    group: 'Account security',
    lessFrequentlyUsed: true,
    params: [],
    run: async (request, _args, ctx) => {
      if (!ctx?.password) throw new Error('The account password is required to disable TOTP.');
      if (!ctx.totpSecret) throw new Error('No saved TOTP secret for this account — MyChart requires a current code to turn TOTP off.');
      const ok = await disableTotp(request, ctx.password, ctx.totpSecret);
      if (!ok) throw new Error('MyChart rejected the request to disable TOTP.');
      return { enabled: false };
    },
  },
];
