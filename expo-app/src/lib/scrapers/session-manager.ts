/**
 * Manages MyChart sessions on-device.
 *
 * Handles login, passkey auto-reconnect, session keepalive,
 * and exposes a tool executor for the AI client.
 *
 * On iOS, passes raw `fetch` to scrapers so iOS handles cookies natively
 * via NSHTTPCookieStorage (no tough-cookie needed).
 */
import { type MyChartRequest } from "../../../../scrapers/myChart/myChartRequest";
import {
  myChartUserPassLogin,
  myChartPasskeyLogin,
  complete2faFlow,
  type TwoFaDeliveryInfo,
} from "../../../../scrapers/myChart/login";

// Every scraper this app can run comes from the shared capability registry —
// see `shared/capabilities.ts`. It is a static import graph, which is what
// Metro needs (no dynamic import with template literals), and it is the reason
// this client can no longer fall behind the CLI or the desktop extension.
import {
  executeCapability,
  getCapability,
  readAccountArg,
  type Capability,
  type CapabilityArgs,
  type CapabilityContext,
  type StudyImagePayload,
} from "../../../../shared/capabilities";
import { toCapabilityArgs } from "./tool-args";
import { TOTP } from "totp-generator";
import { cloToJpegBase64 } from "@/lib/imaging/clo-to-jpeg";
import { putImageAttachment } from "@/lib/imaging/attachment-store";

import {
  getMyChartAccounts,
  updateMyChartAccount,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import {
  deserializeCredential,
  serializeCredential,
} from "../../../../scrapers/myChart/softwareAuthenticator";
import { setupPasskey } from "../../../../scrapers/myChart/setupPasskey";
import { passkeyLoginWithCounterRetry } from "../../../../scrapers/myChart/passkeyLoginRetry";
import { wireSilentReauthentication } from "../../../../scrapers/myChart/silentLogin";
import { sessionStore } from "../../../../scrapers/myChart/sessionStore";
import { getMemorySummary } from "@/lib/storage/database";

type SessionEntry = {
  account: StoredMyChartAccount;
  request: MyChartRequest;
  status: "logged_in" | "need_2fa" | "expired";
};

// In-memory session store
const sessions = new Map<string, SessionEntry>();

// Track which accounts already kicked off an initial-memory build this
// process lifetime, so we don't fire it twice if the account reconnects.
const initialMemoryStarted = new Set<string>();

/**
 * After a successful login, kick off the on-device memory build in the
 * background if this account has no prior memory yet. Lazy-loaded to
 * avoid pulling AI client + memory module into the initial bundle path.
 */
function maybeKickoffInitialMemory(accountId: string): void {
  if (initialMemoryStarted.has(accountId)) return;
  initialMemoryStarted.add(accountId);
  void (async () => {
    try {
      const existing = await getMemorySummary(accountId);
      if (existing) return;
      // eslint-disable-next-line no-restricted-syntax -- deliberate cold-start deferral: keeps the AI client + memory module out of the initial bundle path
      const { buildInitialMemory } = await import("@/lib/memory/builder");
      await buildInitialMemory(accountId);
    } catch (err) {
      console.warn(`[memory] initial build failed for ${accountId}:`, (err as Error).message);
      initialMemoryStarted.delete(accountId);
    }
  })();
}

export type ConnectResult = {
  state: "logged_in" | "need_2fa" | "invalid_login" | "error";
  accountId: string;
  twoFaDelivery?: TwoFaDeliveryInfo;
  error?: string;
};

/**
 * Connect a MyChart account. Tries passkey first, falls back to password + 2FA.
 */
export async function connectAccount(account: StoredMyChartAccount): Promise<ConnectResult> {
  // Check if already connected
  const existing = sessions.get(account.id);
  if (existing?.status === "logged_in") {
    return { state: "logged_in", accountId: account.id };
  }

  // Try passkey login first (no 2FA needed)
  if (account.passkeyCredential) {
    try {
      const credential = deserializeCredential(account.passkeyCredential);
      // MyChart enforces a strictly-increasing WebAuthn signature counter. Our
      // stored counter can lag the server's (a prior login bumped the server but
      // the new value was never persisted, or the passkey was used on another
      // device), which rejects the first assertion. passkeyLoginWithCounterRetry
      // bumps and retries to recover; on success `credential.signCount` holds the
      // accepted value, which we persist below.
      const result = await passkeyLoginWithCounterRetry(
        (cred) => myChartPasskeyLogin({
          hostname: account.hostname,
          credential: cred,
        }),
        credential,
      );

      if (result.state === "logged_in") {
        const entry: SessionEntry = {
          account,
          request: result.mychartRequest,
          status: "logged_in",
        };
        sessions.set(account.id, entry);
        manageSession(entry);
        // Persist the accepted (incremented) sign counter so the next login
        // starts from the right place and doesn't have to retry.
        await updateMyChartAccount(account.id, {
          passkeyCredential: JSON.stringify(credential),
        });
        maybeKickoffInitialMemory(account.id);
        return { state: "logged_in", accountId: account.id };
      }

      console.log(`Passkey login failed for ${account.hostname}: ${result.state}`);
    } catch (err) {
      console.log(`Passkey login error for ${account.hostname}:`, (err as Error).message);
    }
  }

  // Fall back to password login
  try {
    const hasTotpSecret = !!account.totpSecret;
    console.log(`[session] Attempting password login for ${account.hostname} (user=${account.username})`);
    const result = await myChartUserPassLogin({
      hostname: account.hostname,
      user: account.username,
      pass: account.password,
      skipSendCode: hasTotpSecret,
    });
    console.log(`[session] Login result: state=${result.state} error=${result.error || 'none'}`);

    if (result.state === "invalid_login") {
      return { state: "invalid_login", accountId: account.id, error: "Invalid credentials" };
    }

    if (result.state === "error") {
      return { state: "error", accountId: account.id, error: result.error };
    }

    if (result.state === "need_2fa") {
      // If we have a TOTP secret, auto-complete 2FA
      if (account.totpSecret) {
        const cleanSecret = account.totpSecret.replace(/\s+/g, "").toUpperCase();
        const { otp } = await TOTP.generate(cleanSecret);

        const twoFaResult = await complete2faFlow({
          mychartRequest: result.mychartRequest,
          code: otp,
          isTOTP: true,
        });

        if (twoFaResult.state === "logged_in") {
          const entry: SessionEntry = {
            account,
            request: twoFaResult.mychartRequest,
            status: "logged_in",
          };
          sessions.set(account.id, entry);
          manageSession(entry);
          maybeKickoffInitialMemory(account.id);
          return { state: "logged_in", accountId: account.id };
        }

        return { state: "error", accountId: account.id, error: "TOTP 2FA failed" };
      }

      // No TOTP — need user to enter code manually
      sessions.set(account.id, {
        account,
        request: result.mychartRequest,
        status: "need_2fa",
      });
      return {
        state: "need_2fa",
        accountId: account.id,
        twoFaDelivery: result.twoFaDelivery,
      };
    }

    // Logged in directly (no 2FA)
    const entry: SessionEntry = {
      account,
      request: result.mychartRequest,
      status: "logged_in",
    };
    sessions.set(account.id, entry);
    manageSession(entry);
    maybeKickoffInitialMemory(account.id);
    return { state: "logged_in", accountId: account.id };
  } catch (err) {
    return { state: "error", accountId: account.id, error: (err as Error).message };
  }
}

/**
 * Complete 2FA for an account that's in need_2fa state.
 */
export async function complete2fa(
  accountId: string,
  code: string,
): Promise<{ state: "logged_in" | "invalid_2fa" | "error" }> {
  const entry = sessions.get(accountId);
  if (entry?.status !== "need_2fa") {
    return { state: "error" };
  }

  const result = await complete2faFlow({
    mychartRequest: entry.request,
    code,
  });

  if (result.state === "logged_in") {
    entry.status = "logged_in";
    entry.request = result.mychartRequest;
    manageSession(entry);
    maybeKickoffInitialMemory(accountId);
    return { state: "logged_in" };
  }

  return { state: result.state };
}

/**
 * Register a passkey on an already-logged-in MyChart session and persist it.
 * Returns true on success.
 */
export async function registerPasskey(accountId: string): Promise<boolean> {
  const entry = sessions.get(accountId);
  if (entry?.status !== "logged_in") return false;
  const credential = await setupPasskey(entry.request);
  if (!credential) return false;
  const serialized = serializeCredential(credential);
  await updateMyChartAccount(accountId, { passkeyCredential: serialized });
  entry.account = { ...entry.account, passkeyCredential: serialized };
  return true;
}

/**
 * Disconnect an account and clear its session.
 */
export function disconnectAccount(accountId: string) {
  const entry = sessions.get(accountId);
  if (entry) sessionStore.unregister(entry.request);
  sessions.delete(accountId);
}

/**
 * Connect all configured accounts.
 */
export async function connectAll(): Promise<ConnectResult[]> {
  const accounts = await getMyChartAccounts();
  const results: ConnectResult[] = [];
  for (const account of accounts) {
    if (!sessions.has(account.id) || sessions.get(account.id)?.status !== "logged_in") {
      results.push(await connectAccount(account));
    } else {
      results.push({ state: "logged_in", accountId: account.id });
    }
  }
  return results;
}

/**
 * Get a logged-in session for a hostname (or the first available one).
 */
export function getSession(hostname?: string): SessionEntry | null {
  if (hostname) {
    for (const entry of sessions.values()) {
      if (entry.account.hostname === hostname && entry.status === "logged_in") {
        return entry;
      }
    }
    return null;
  }

  // Return first logged-in session
  for (const entry of sessions.values()) {
    if (entry.status === "logged_in") return entry;
  }
  return null;
}

/**
 * Get all sessions with their status.
 */
export function getAllSessions(): Array<{ accountId: string; hostname: string; status: string }> {
  const result: Array<{ accountId: string; hostname: string; status: string }> = [];
  for (const [id, entry] of sessions) {
    result.push({ accountId: id, hostname: entry.account.hostname, status: entry.status });
  }
  return result;
}

/**
 * Make a logged-in session self-sustaining: wire the silent re-login hook
 * (passkey with counter retry → password → TOTP secret; scrapers/http.ts
 * picks the on-device transport so iOS keeps managing cookies) and enroll it
 * in the shared 30-second keepalive heartbeat. From then on, expiry mid-scrape is renewed
 * transparently by makeAuthenticatedRequest, and a heartbeat that finds the
 * session dead renews it proactively through the same hook.
 *
 * Credentials are re-read from secure storage at renewal time so a passkey
 * registered (or a password updated) after connect still counts.
 */
function manageSession(entry: SessionEntry) {
  wireSilentReauthentication(entry.request, async () => {
    const accounts = await getMyChartAccounts();
    const account = accounts.find((a) => a.id === entry.account.id) ?? entry.account;
    let passkey = null;
    if (account.passkeyCredential) {
      try {
        passkey = deserializeCredential(account.passkeyCredential);
      } catch {
        // Corrupt stored passkey — fall back to password.
      }
    }
    return {
      hostname: account.hostname,
      username: account.username,
      password: account.password,
      totpSecret: account.totpSecret,
      passkey,
      onPasskeyUsed: (credential) =>
        updateMyChartAccount(account.id, { passkeyCredential: serializeCredential(credential) }),
    };
  });
  sessionStore.registerForKeepalive(entry.request);
}

/**
 * Per-account state the account-security capabilities need — the stored
 * password and TOTP secret, plus the callbacks that persist new ones into
 * expo-secure-store. Data capabilities ignore all of it.
 */
function contextFor(entry: SessionEntry): CapabilityContext {
  const accountId = entry.account.id;
  return {
    password: entry.account.password,
    totpSecret: entry.account.totpSecret,
    saveTotpSecret: async (totpSecret: string) => {
      await updateMyChartAccount(accountId, { totpSecret });
      entry.account = { ...entry.account, totpSecret };
    },
    savePasskey: async (passkeyCredential: string) => {
      await updateMyChartAccount(accountId, { passkeyCredential });
      entry.account = { ...entry.account, passkeyCredential };
    },
  };
}

/**
 * Execute a scraper tool by name against a connected session.
 * This is called by the AI tool executor.
 */
export async function executeScraperTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  // The model's JSON is untyped until here. Narrow it once, at the edge, so
  // nothing downstream has to wonder what it is holding.
  const args = toCapabilityArgs(input);
  // `account` is the registry's name; `instance` is what this app used to call
  // it and what the alerts generator still passes.
  const hostname = readAccountArg(args);
  const session = await requireSession(hostname);
  return runScraper(session.request, toolName, args, contextFor(session));
}

/**
 * Run an `account`-kind capability (passkey registration, listing or deleting
 * passkeys, turning the authenticator app on or off) against one account.
 *
 * These are deliberately not offered to the model — they change how the
 * patient signs in — so they are driven from the settings screen instead.
 */
export async function executeAccountCapability(
  accountId: string,
  capabilityId: string,
  args: CapabilityArgs = {},
): Promise<unknown> {
  const entry = sessions.get(accountId);
  if (entry?.status !== "logged_in") {
    throw new Error("That MyChart account is not connected. Connect it first, then try again.");
  }
  const capability = getCapability(capabilityId);
  if (!capability) throw new Error(`Unknown capability "${capabilityId}".`);
  if (capability.kind !== "account") {
    throw new Error(`"${capabilityId}" is a data tool — run it through executeScraperTool.`);
  }
  // executeCapability exempts `account`-kind from the patient assertion, so
  // this is equivalent to calling `run` — but it keeps "no client reaches
  // capability.run" absolute, leaving no direct-dispatch line to grow.
  return executeCapability(entry.request, capability.id, args, contextFor(entry));
}

/** Get a logged-in session, connecting on demand, or throw with the reason. */
async function requireSession(hostname?: string): Promise<SessionEntry> {
  const existing = getSession(hostname);
  if (existing) return existing;

  const results = await connectAll();
  const connected = results.find((r) => r.state === "logged_in");
  if (!connected) {
    const needs2fa = results.find((r) => r.state === "need_2fa");
    if (needs2fa) {
      throw new Error(
        `MyChart requires 2FA verification for ${needs2fa.accountId}. Go to Settings to complete the login.`,
      );
    }
    const details = results.map((r) => `${r.accountId}=${r.state}${r.error ? ': ' + r.error : ''}`).join(', ');
    throw new Error(`Failed to connect to MyChart. (${details})`);
  }
  const retry = getSession(hostname);
  if (!retry) throw new Error("Failed to connect to MyChart.");
  return retry;
}

/**
 * Run one capability against a MyChartRequest.
 *
 * The dispatch used to be a hand-written switch, and it had drifted eight
 * tools behind the other clients. Everything now routes through the shared
 * registry (`shared/capabilities.ts`), so the app supports exactly what the
 * CLI and the desktop extension support.
 *
 * The one thing that stays here is imaging: the registry hands back raw CLO
 * bytes and each client decodes them its own way. On-device that means
 * cloToJpegBase64 plus the attachment store, so the reply can carry an
 * [image:ID] token the chat UI swaps for the picture.
 */
async function runScraper(
  request: MyChartRequest,
  toolName: string,
  input: CapabilityArgs,
  ctx?: CapabilityContext,
): Promise<unknown> {
  const capability = getCapability(toolName);
  if (!capability) return { error: `Unknown tool: ${toolName}` };

  // The flag, not the id: a second media capability must not need this branch
  // edited. `run` hands back raw CLO bytes; this client decodes them on-device.
  if (capability.rendersMedia) {
    return downloadImagingStudyAsAttachment(capability, request, input);
  }

  try {
    return await executeCapability(request, toolName, input, ctx);
  } catch (err) {
    // The agent loop reads tool results as text, so a thrown "no medication
    // matching X / here are the options" is far more useful to it as a
    // structured error than as a crashed turn.
    return { error: (err as Error).message };
  }
}

/**
 * Download one imaging study, decode the first image on-device and stash it in
 * the attachment store. Returns the token the model puts in its reply.
 */
async function downloadImagingStudyAsAttachment(
  capability: Capability,
  request: MyChartRequest,
  input: CapabilityArgs,
): Promise<unknown> {
  let payload: StudyImagePayload;
  try {
    payload = (await executeCapability(request, capability.id, input)) as StudyImagePayload;
  } catch (err) {
    return { error: `Could not download the image: ${(err as Error).message}` };
  }

  const img = payload.images.find((i) => i.pixelData);
  if (!img?.pixelData) {
    const why = payload.errors.length ? payload.errors.join("; ") : "No pixel data returned.";
    return { error: `Could not download the image: ${why}` };
  }

  let base64: string, width: number, height: number;
  try {
    ({ base64, width, height } = cloToJpegBase64(
      Buffer.from(img.pixelData),
      img.wrapperData ? Buffer.from(img.wrapperData) : undefined,
    ));
  } catch (err) {
    return { error: `Failed to decode the image: ${(err as Error).message}` };
  }

  const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const caption = img.seriesDescription || payload.studyName || "Imaging study";
  putImageAttachment(imageId, `data:image/jpeg;base64,${base64}`, caption, width, height);
  return { image_id: imageId, caption, width, height };
}
