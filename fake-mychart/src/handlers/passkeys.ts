import crypto from 'crypto';
import * as homer from '@/data/homer';
import { state } from '@/lib/state';
import { json } from './respond';
import { currentUser } from './records';
import type { ExactRoutes } from './types';

/** Passkey management, per user. The login-time challenge lives in `auth.ts`. */
export const passkeysPost: ExactRoutes = {
  'api/passkey-management/loadpasskeyinfo': ({ request }) => {
    const u = currentUser(request);
    return json({
      passkeys: u?.passkeys ?? [],
      lastAuthentication: undefined,
    });
  },

  'api/passkey-management/generatecreaterequest': ({ request }) => {
    const challenge = crypto.randomBytes(32).toString('base64');
    const u = currentUser(request);
    return json({
      success: true,
      data: {
        ...homer.passkeyCreationOptions,
        challenge,
        // Use logged-in user's identity in the WebAuthn user handle so the
        // resulting credential is bound to them.
        user: u
          ? {
              id: Buffer.from(`${u.username}-user-id`).toString('base64'),
              name: u.username,
              displayName: u.displayName,
            }
          : homer.passkeyCreationOptions.user,
        excludeCredentials: (u?.passkeys ?? []).map(pk => ({ id: pk.rawId, type: 'public-key' })),
      },
    });
  },

  'api/passkey-management/createpasskey': async ({ request }) => {
    try {
      const body = await request.json();
      const u = currentUser(request);
      if (!u) return json({ success: false, errors: ['Not logged in'] }, 401);
      state.passkeyIdCounter++;
      const newPasskey = {
        rawId: body.rawId || crypto.randomBytes(32).toString('base64'),
        name: `Passkey ${state.passkeyIdCounter}`,
        createdOnDevice: 'Software Authenticator',
        creationInstant: new Date().toISOString(),
        lastUsedInstant: null,
        signCount: 0,
      };
      u.passkeys.push(newPasskey);
      return json({ success: true, data: newPasskey });
    } catch {
      return json({ success: false, errors: ['Invalid request'] }, 400);
    }
  },

  'api/passkey-management/deletepasskey': async ({ request }) => {
    try {
      const body = await request.json();
      const u = currentUser(request);
      if (u) u.passkeys = u.passkeys.filter(pk => pk.rawId !== body.rawId);
      return json({ success: true });
    } catch {
      return json({ success: false }, 400);
    }
  },

  'api/passkey-management/renamepasskey': async ({ request }) => {
    try {
      const body = await request.json();
      const u = currentUser(request);
      const pk = u?.passkeys.find(p => p.rawId === body.rawId);
      if (pk) pk.name = body.name || pk.name;
      return json({ success: true });
    } catch {
      return json({ success: false }, 400);
    }
  },
};
