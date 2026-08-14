/**
 * E2E test-mode flag.
 *
 * Set EXPO_PUBLIC_E2E=1 when exporting/building the app for automated
 * end-to-end testing (Maestro on simulators/emulators, Playwright on
 * the web export). It is inlined at bundle time, so production builds
 * (built without the env var) carry IS_E2E === false and none of the
 * test affordances exist in them.
 *
 * What it unlocks:
 *  - The "Skip (dev)" button on the Google onboarding step (normally
 *    __DEV__-only), so tests don't need a real OAuth round-trip.
 *  - Skipping Google sign-in also writes a fake backend session token,
 *    so the free-tier AI path talks to the mock AI server that E2E
 *    runs point EXPO_PUBLIC_BACKEND_URL at.
 */
export const IS_E2E = process.env.EXPO_PUBLIC_E2E === "1";

/** True in dev builds or E2E test builds — gates test-only UI. */
export const DEV_OR_E2E = __DEV__ || IS_E2E;
