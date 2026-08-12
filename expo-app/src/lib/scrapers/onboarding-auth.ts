/**
 * On-device driver for the *pre-authentication* onboarding flows: account
 * signup (self-signup + activation code) and account recovery (forgot
 * username / password). Mirrors `session-manager.ts` but for the
 * "I don't have an account yet / I can't log in" branches (Vision
 * Implementation plan §7).
 *
 * Each flow spans several UI screens, and the underlying scraper carries a
 * live `MyChartRequest` (cookies + resolved firstPathPart) between steps. The
 * UI components are separate React screens, so we stash the in-progress
 * request + tokens in a module-level flow store keyed by an opaque flowId and
 * hand only that id to the UI — the same pattern session-manager uses for live
 * sessions.
 *
 * Like session-manager, scrapers are given raw `fetch` so iOS handles cookies
 * natively (NSHTTPCookieStorage), bypassing tough-cookie.
 *
 * ⚠️ Real Epic gates self-signup behind reCAPTCHA Enterprise (see
 * claude-memory/mychart-signup-recovery-api.md). On a real portal the
 * demographic submit needs a token minted by a WebView; `recaptchaToken`
 * threads it through. fake-mychart has no bot protection, so the simulator /
 * CI exercise the full flow without it.
 */
import { MyChartRequest } from "../../../../scrapers/myChart/myChartRequest";
import {
  submitSignupRequest,
  verifyActivationCode,
  verifySignupContactCode,
  createSignupCredentials,
  type SignupIdentity,
} from "../../../../scrapers/myChart/signup";
import {
  getAccountRecoverySettings,
  sendAccountRecoveryCode,
  verifyAccountRecoveryCode,
  resetAccountPassword,
  type RecoverySettings,
} from "../../../../scrapers/myChart/accountRecovery";

const nativeFetch = (url: string, init: RequestInit) => fetch(url, init);

type SignupFlow = {
  hostname: string;
  request: MyChartRequest;
  signupToken: string;
  /** Username/password aren't set until the final step; held to build the account. */
  email?: string;
};

type RecoveryFlow = {
  hostname: string;
  request: MyChartRequest;
  contactInfo: string;
  recoveryToken?: string;
  username?: string;
};

const signupFlows = new Map<string, SignupFlow>();
const recoveryFlows = new Map<string, RecoveryFlow>();

function newFlowId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Signup ─────────────────────────────────────────────────────────

export type StartSignupResult =
  | { state: "need_contact_verification"; flowId: string; deliveryMasked?: string }
  | { state: "account_exists" }
  | { state: "invalid" | "error"; error?: string };

/** Self-signup (identity match): submit demographics, kicking off an email OTP. */
export async function startSelfSignup(
  hostname: string,
  identity: SignupIdentity,
  recaptchaToken?: string,
): Promise<StartSignupResult> {
  const result = await submitSignupRequest({
    hostname,
    identity,
    recaptchaToken,
    fetchFn: nativeFetch,
  });
  if (result.state === "need_contact_verification" && result.signupToken) {
    const flowId = newFlowId("signup");
    signupFlows.set(flowId, {
      hostname,
      request: result.mychartRequest,
      signupToken: result.signupToken,
      email: identity.email,
    });
    return { state: "need_contact_verification", flowId, deliveryMasked: result.deliveryMasked };
  }
  if (result.state === "account_exists") return { state: "account_exists" };
  return { state: result.state, error: result.error };
}

export type StartActivationResult =
  | { state: "valid"; flowId: string }
  | { state: "invalid" | "error"; error?: string };

/**
 * Activation-code signup. The code already proves identity, so no separate
 * contact-verification step is required before choosing credentials.
 */
export async function startActivationCodeSignup(
  hostname: string,
  code: string,
  dateOfBirth?: string,
): Promise<StartActivationResult> {
  const result = await verifyActivationCode({ hostname, code, dateOfBirth, fetchFn: nativeFetch });
  if (result.state === "valid" && result.signupToken) {
    const flowId = newFlowId("signup");
    signupFlows.set(flowId, {
      hostname,
      request: result.mychartRequest,
      signupToken: result.signupToken,
    });
    return { state: "valid", flowId };
  }
  return { state: result.state, error: result.error };
}

/** Verify the one-time contact code sent during self-signup. */
export async function verifySignupCode(
  flowId: string,
  code: string,
): Promise<{ state: "verified" | "invalid" | "error"; error?: string }> {
  const flow = signupFlows.get(flowId);
  if (!flow) return { state: "error", error: "signup flow expired" };
  return verifySignupContactCode({ mychartRequest: flow.request, signupToken: flow.signupToken, code });
}

/**
 * Final signup step: choose username + password, creating the account. Returns
 * the credentials so the caller can connect + persist the account.
 */
export async function finishSignup(
  flowId: string,
  username: string,
  password: string,
): Promise<
  | { state: "created"; hostname: string; username: string; password: string }
  | { state: "username_taken" | "invalid" | "error"; error?: string }
> {
  const flow = signupFlows.get(flowId);
  if (!flow) return { state: "error", error: "signup flow expired" };
  const result = await createSignupCredentials({
    mychartRequest: flow.request,
    signupToken: flow.signupToken,
    username,
    password,
  });
  if (result.state === "created") {
    signupFlows.delete(flowId);
    return { state: "created", hostname: flow.hostname, username, password };
  }
  return { state: result.state, error: result.error };
}

// ─── Recovery ───────────────────────────────────────────────────────

export type StartRecoveryResult =
  | { state: "ok"; flowId: string; settings: RecoverySettings }
  | { state: "error"; error?: string };

/** Begin account recovery: look up how the contact can receive a code. */
export async function startRecovery(
  hostname: string,
  contactInfo: string,
): Promise<StartRecoveryResult> {
  const result = await getAccountRecoverySettings({ hostname, contactInfo, fetchFn: nativeFetch });
  if (!result.settings) return { state: "error", error: result.error };
  const flowId = newFlowId("recovery");
  recoveryFlows.set(flowId, { hostname, request: result.mychartRequest, contactInfo });
  return { state: "ok", flowId, settings: result.settings };
}

/** Send a recovery code via email (default) or SMS. */
export async function sendRecoveryCode(
  flowId: string,
  useSMS?: boolean,
): Promise<{ state: "sent" | "invalid" | "error"; deliveryMasked?: string; error?: string }> {
  const flow = recoveryFlows.get(flowId);
  if (!flow) return { state: "error", error: "recovery flow expired" };
  const result = await sendAccountRecoveryCode({
    mychartRequest: flow.request,
    contactInfo: flow.contactInfo,
    useSMS,
  });
  return { state: result.state, deliveryMasked: result.deliveryMasked, error: result.error };
}

/** Verify the recovery code → reveals the username. */
export async function verifyRecoveryCode(
  flowId: string,
  code: string,
): Promise<{ state: "verified" | "invalid" | "error"; username?: string; error?: string }> {
  const flow = recoveryFlows.get(flowId);
  if (!flow) return { state: "error", error: "recovery flow expired" };
  const result = await verifyAccountRecoveryCode({
    mychartRequest: flow.request,
    contactInfo: flow.contactInfo,
    code,
  });
  if (result.state === "verified") {
    flow.recoveryToken = result.recoveryToken;
    flow.username = result.username;
    return { state: "verified", username: result.username };
  }
  return { state: result.state, error: result.error };
}

/**
 * Set a new password using the verified recovery token. Returns the recovered
 * username + new password so the caller can connect + persist the account.
 */
export async function finishRecovery(
  flowId: string,
  newPassword: string,
): Promise<
  | { state: "reset"; hostname: string; username: string; password: string }
  | { state: "invalid" | "error"; error?: string }
> {
  const flow = recoveryFlows.get(flowId);
  if (!flow || !flow.recoveryToken || !flow.username) {
    return { state: "error", error: "recovery flow expired" };
  }
  const result = await resetAccountPassword({
    mychartRequest: flow.request,
    recoveryToken: flow.recoveryToken,
    newPassword,
  });
  if (result.state === "reset") {
    const username = flow.username;
    const hostname = flow.hostname;
    recoveryFlows.delete(flowId);
    return { state: "reset", hostname, username, password: newPassword };
  }
  return { state: result.state, error: result.error };
}
