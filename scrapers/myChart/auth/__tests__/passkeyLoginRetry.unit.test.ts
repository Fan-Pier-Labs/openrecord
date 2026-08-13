import { describe, it, expect } from 'bun:test';
import { passkeyLoginWithCounterRetry, MAX_SIGN_COUNT_BUMPS } from '../passkeyLoginRetry';
import type { PasskeyCredential } from '../softwareAuthenticator';
import type { LoginResult } from '../login';

function makeCredential(signCount: number): PasskeyCredential {
  return {
    credentialId: 'cred-id',
    privateKey: 'priv',
    rpId: 'example.org',
    userHandle: 'user',
    signCount,
  };
}

// A fake login that mimics a WebAuthn relying party: it increments the
// credential's counter (as createAssertion does), then accepts only if the
// presented counter is strictly greater than the server's last-seen value.
function makeServerAttempt(serverLastSeen: number) {
  const calls: number[] = [];
  const attempt = async (credential: PasskeyCredential): Promise<LoginResult> => {
    credential.signCount++; // mirror createAssertion bumping before signing
    const presented = credential.signCount;
    calls.push(presented);
    if (presented > serverLastSeen) {
      return { state: 'logged_in', mychartRequest: {} as never };
    }
    return { state: 'invalid_login', error: 'counter too low', mychartRequest: {} as never };
  };
  return { attempt, calls };
}

describe('passkeyLoginWithCounterRetry', () => {
  it('succeeds on the first try when the counter is already ahead', async () => {
    const cred = makeCredential(50);
    const { attempt, calls } = makeServerAttempt(50); // server accepts > 50, i.e. 51
    const result = await passkeyLoginWithCounterRetry(attempt, cred);
    expect(result.state).toBe('logged_in');
    expect(calls).toEqual([51]);
    expect(cred.signCount).toBe(51); // persisted value the caller will save
  });

  it('recovers from a stale counter by bumping and retrying', async () => {
    const cred = makeCredential(50);
    // Server has already seen 51 (a prior login we never persisted), so it
    // requires > 51. First attempt sends 51 (rejected), second sends 52.
    const { attempt, calls } = makeServerAttempt(51);
    const result = await passkeyLoginWithCounterRetry(attempt, cred);
    expect(result.state).toBe('logged_in');
    expect(calls).toEqual([51, 52]);
    expect(cred.signCount).toBe(52);
  });

  it('sends a strictly increasing sequence with no gaps or repeats', async () => {
    const cred = makeCredential(10);
    const { attempt, calls } = makeServerAttempt(14); // needs 15; sends 11..15
    const result = await passkeyLoginWithCounterRetry(attempt, cred);
    expect(result.state).toBe('logged_in');
    expect(calls).toEqual([11, 12, 13, 14, 15]);
    expect(cred.signCount).toBe(15);
  });

  it('returns immediately on a non-counter error without retrying', async () => {
    const cred = makeCredential(50);
    let count = 0;
    const attempt = async (): Promise<LoginResult> => {
      count++;
      return { state: 'error', error: 'network down', mychartRequest: {} as never };
    };
    const result = await passkeyLoginWithCounterRetry(attempt, cred);
    expect(result.state).toBe('error');
    expect(count).toBe(1);
  });

  it('gives up after maxBumps when the passkey is genuinely rejected', async () => {
    const cred = makeCredential(50);
    let count = 0;
    const attempt = async (credential: PasskeyCredential): Promise<LoginResult> => {
      credential.signCount++;
      count++;
      return { state: 'invalid_login', error: 'nope', mychartRequest: {} as never };
    };
    const result = await passkeyLoginWithCounterRetry(attempt, cred, 3);
    expect(result.state).toBe('invalid_login');
    expect(count).toBe(4); // initial attempt + 3 bumps
  });

  it('defaults to a bounded number of attempts', async () => {
    const cred = makeCredential(0);
    let count = 0;
    const attempt = async (credential: PasskeyCredential): Promise<LoginResult> => {
      credential.signCount++;
      count++;
      return { state: 'invalid_login', error: 'nope', mychartRequest: {} as never };
    };
    await passkeyLoginWithCounterRetry(attempt, cred);
    expect(count).toBe(MAX_SIGN_COUNT_BUMPS + 1);
  });
});
