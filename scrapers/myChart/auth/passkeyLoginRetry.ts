import type { PasskeyCredential } from './softwareAuthenticator';
import type { LoginResult } from './login';

// How many times we'll bump the WebAuthn signature counter and retry a passkey
// login before giving up. The server's counter only ever moves a little ahead
// of ours, so a handful of attempts is plenty; the cap just bounds the work if
// the passkey is genuinely invalid (every attempt would fail regardless).
export const MAX_SIGN_COUNT_BUMPS = 10;

/**
 * Run a passkey login, recovering from WebAuthn signature-counter desync.
 *
 * MyChart enforces a strictly-increasing signature counter on each passkey
 * assertion. Our locally-stored counter can fall behind the server's — a prior
 * login advanced the server but the bumped value was never persisted (e.g. the
 * login was treated as failed, or the process exited first), or the same
 * passkey was used from another device. When that happens the first assertion
 * is rejected because its counter is too low, and the previous behaviour was to
 * give up immediately.
 *
 * Here we treat an `invalid_login` as a possible counter mismatch: bump the
 * counter and retry, up to `maxBumps` times. `attempt` is expected to run the
 * real login (which increments `credential.signCount` while building the
 * assertion), so on success `credential.signCount` holds the value the server
 * accepted and the caller can persist it. Non-counter outcomes (`logged_in`,
 * `need_2fa`, `error`) return immediately — bumping wouldn't help those.
 *
 * `credential` is mutated in place (its `signCount` is advanced); callers
 * should persist it after a successful return.
 *
 * Shared by the CLI (`npm-package/cli/cli.ts`) and the Expo app
 * (`expo-app/src/lib/scrapers/session-manager.ts`) — both auto-login with a
 * locally-stored passkey credential and hit the same desync.
 */
export async function passkeyLoginWithCounterRetry(
  attempt: (credential: PasskeyCredential) => Promise<LoginResult>,
  credential: PasskeyCredential,
  maxBumps: number = MAX_SIGN_COUNT_BUMPS,
): Promise<LoginResult> {
  const startCount = credential.signCount;
  let result: LoginResult | undefined;

  for (let bump = 0; bump <= maxBumps; bump++) {
    // attempt() (via createAssertion) increments signCount before signing, so
    // setting it to startCount + bump means the server sees startCount + bump +
    // 1 — a strictly increasing sequence across retries with no gaps or repeats.
    credential.signCount = startCount + bump;
    result = await attempt(credential);

    // Anything other than a counter rejection is final.
    if (result.state !== 'invalid_login') return result;
  }

  return result!;
}
