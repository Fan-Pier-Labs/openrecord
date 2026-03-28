import { describe, it, expect } from 'bun:test';
import { state, signUp, signIn, signOut, authedFetch } from './helpers';

const TEST_EMAIL = `ci-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';
const TEST_NAME = 'CI Test User';

describe('Authentication', () => {
  it('signs up a new account', async () => {
    const res = await signUp(TEST_EMAIL, TEST_PASSWORD, TEST_NAME);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(TEST_EMAIL);
    expect(body.user.name).toBe(TEST_NAME);
    expect(body.user.id).toBeDefined();

    state.userId = body.user.id;

    // Should have session cookies after sign-up
    expect(state.cookies).toContain('better-auth.session_token');
  });

  it('can access authenticated endpoints after sign-up', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('signs out successfully', async () => {
    await signOut();

    // After sign-out, authed endpoints should fail
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(401);
  });

  it('signs in with existing credentials', async () => {
    const res = await signIn(TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(TEST_EMAIL);

    // Should have session cookies again
    expect(state.cookies).toContain('better-auth.session_token');
  });

  it('can access authenticated endpoints after sign-in', async () => {
    const res = await authedFetch('/api/mychart-instances');
    expect(res.status).toBe(200);
  });
});
