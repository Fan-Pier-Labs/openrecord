import * as homer from '@/data/homer';
import { generateTotpSecret, verifyTotpCode } from '@/lib/totp';
import { json } from './respond';
import { acceptAny } from './guards';
import { currentUser } from './records';
import type { ExactRoutes } from './types';

/** TOTP enrolment and opt-out. The login-time 2FA challenge lives in `auth.ts`. */
export const secondaryValidationPost: ExactRoutes = {
  'api/secondary-validation/gettwofactorinfo': ({ request }) => {
    const u = currentUser(request);
    return json({ ...homer.totpInfo, IsTotpEnabled: u?.totpEnabled ?? false });
  },

  'api/secondary-validation/verifypasswordandupdatecontact': async ({ request }) => {
    try {
      const body = await request.json();
      const password = body.Password || body.password || '';
      const u = currentUser(request);
      const valid = acceptAny() || (u != null && password === u.password);
      return json({ IsPasswordValid: valid });
    } catch {
      return json({ IsPasswordValid: true });
    }
  },

  'api/secondary-validation/totpqrcode': ({ request }) => {
    // Real MyChart mints a fresh secret per call and holds it pending until a
    // valid code proves the client stored it. Returning a constant here would
    // let a client that ignores the response still "set up" TOTP.
    const u = currentUser(request);
    const secret = generateTotpSecret();
    if (u) u.pendingTotpSecret = secret;
    return json({ ...homer.totpQrCode, encodedSecretKey: secret });
  },

  'api/secondary-validation/verifycode': async ({ request }) => {
    try {
      const body = await request.json();
      const code = body.Code || body.code || '';
      const u = currentUser(request);
      // Validate against the secret this account is actually setting up (or
      // already using, for the opt-out flow). Deliberately NOT bypassed by
      // FAKE_MYCHART_ACCEPT_ANY: that knob loosens credential lookup, not
      // cryptography, and bypassing it here would make the one step of the
      // setup flow that involves real computation untestable.
      const secret = u?.pendingTotpSecret ?? u?.totpSecret ?? null;
      if (secret && verifyTotpCode(secret, String(code))) {
        return json({ Success: true });
      }
      return json({ Success: false }, 400);
    } catch {
      return json({ Success: false }, 400);
    }
  },

  'api/secondary-validation/updatetwofactortotpoptinstatus': ({ request }) => {
    // Toggle TOTP status for the logged-in user. The scraper sends an empty
    // body for both directions, so the endpoint infers which one is meant.
    const u = currentUser(request);
    if (u) {
      u.totpEnabled = !u.totpEnabled;
      if (u.totpEnabled) {
        // Commit the secret VerifyCode just validated.
        u.totpSecret = u.pendingTotpSecret ?? u.totpSecret;
      } else {
        u.totpSecret = null;
      }
      u.pendingTotpSecret = null;
    }
    return json({ Success: true });
  },
};
