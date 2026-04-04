/**
 * Manages MyChart sessions on-device.
 *
 * Handles login, passkey auto-reconnect, session keepalive,
 * and exposes a tool executor for the AI client.
 */
import { MyChartRequest } from "../../../../scrapers/myChart/myChartRequest";
import {
  myChartUserPassLogin,
  myChartPasskeyLogin,
  complete2faFlow,
  type TwoFaDeliveryInfo,
} from "../../../../scrapers/myChart/login";
import {
  getMyChartAccounts,
  updateMyChartAccount,
  type StoredMyChartAccount,
} from "@/lib/storage/secure-store";
import { deserializeCredential } from "../../../../scrapers/myChart/softwareAuthenticator";

type SessionEntry = {
  account: StoredMyChartAccount;
  request: MyChartRequest;
  status: "logged_in" | "need_2fa" | "expired";
};

// In-memory session store
const sessions = new Map<string, SessionEntry>();

// Keepalive interval references
const keepaliveTimers = new Map<string, ReturnType<typeof setInterval>>();

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
      const result = await myChartPasskeyLogin({
        hostname: account.hostname,
        credential,
      });

      if (result.state === "logged_in") {
        sessions.set(account.id, {
          account,
          request: result.mychartRequest,
          status: "logged_in",
        });
        startKeepalive(account.id);
        // Update sign count
        await updateMyChartAccount(account.id, {
          passkeyCredential: JSON.stringify(credential),
        });
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
        const { TOTP } = await import("totp-generator");
        const cleanSecret = account.totpSecret.replace(/\s+/g, "").toUpperCase();
        const { otp } = await TOTP.generate(cleanSecret);

        const twoFaResult = await complete2faFlow({
          mychartRequest: result.mychartRequest,
          code: otp,
          isTOTP: true,
        });

        if (twoFaResult.state === "logged_in") {
          sessions.set(account.id, {
            account,
            request: twoFaResult.mychartRequest,
            status: "logged_in",
          });
          startKeepalive(account.id);
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
    sessions.set(account.id, {
      account,
      request: result.mychartRequest,
      status: "logged_in",
    });
    startKeepalive(account.id);
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
  if (!entry || entry.status !== "need_2fa") {
    return { state: "error" };
  }

  const result = await complete2faFlow({
    mychartRequest: entry.request,
    code,
  });

  if (result.state === "logged_in") {
    entry.status = "logged_in";
    entry.request = result.mychartRequest;
    startKeepalive(accountId);
    return { state: "logged_in" };
  }

  return { state: result.state };
}

/**
 * Disconnect an account and clear its session.
 */
export function disconnectAccount(accountId: string) {
  sessions.delete(accountId);
  const timer = keepaliveTimers.get(accountId);
  if (timer) {
    clearInterval(timer);
    keepaliveTimers.delete(accountId);
  }
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
 * Start keepalive pings for a session (every 30 seconds).
 */
function startKeepalive(accountId: string) {
  // Clear existing timer
  const existing = keepaliveTimers.get(accountId);
  if (existing) clearInterval(existing);

  const timer = setInterval(async () => {
    const entry = sessions.get(accountId);
    if (!entry || entry.status !== "logged_in") {
      clearInterval(timer);
      keepaliveTimers.delete(accountId);
      return;
    }

    try {
      const resp = await entry.request.makeRequest({
        path: "/Home/KeepAlive",
        followRedirects: false,
      });
      const text = await resp.text();
      if (text.trim() === "0" || resp.status === 302) {
        console.log(`Session expired for ${entry.account.hostname}`);
        entry.status = "expired";
        clearInterval(timer);
        keepaliveTimers.delete(accountId);

        // Auto-reconnect with passkey
        connectAccount(entry.account).catch(() => {});
      }
    } catch {
      // Network error — keep trying
    }
  }, 30000);

  keepaliveTimers.set(accountId, timer);
}

/**
 * Execute a scraper tool by name against a connected session.
 * This is called by the AI tool executor.
 */
export async function executeScraperTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const hostname = input.instance as string | undefined;
  const session = getSession(hostname);

  if (!session) {
    // Try auto-connecting
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
    const retrySession = getSession(hostname);
    if (!retrySession) {
      throw new Error("Failed to connect to MyChart.");
    }
    return runScraper(retrySession.request, toolName, input);
  }

  return runScraper(session.request, toolName, input);
}

/**
 * Run a specific scraper against a MyChartRequest.
 * Imports the scraper modules directly from the main repo.
 */
async function runScraper(
  request: MyChartRequest,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const S = "../../../../scrapers/myChart";

  switch (toolName) {
    case "get_profile": {
      const { getMyChartProfile, getEmail } = await import(`${S}/profile`);
      const profile = await getMyChartProfile(request);
      const email = await getEmail(request);
      return { ...profile, email };
    }
    case "get_health_summary": {
      const { getHealthSummary } = await import(`${S}/healthSummary`);
      return getHealthSummary(request);
    }
    case "get_medications": {
      const { getMedications } = await import(`${S}/medications`);
      return getMedications(request);
    }
    case "get_allergies": {
      const { getAllergies } = await import(`${S}/allergies`);
      return getAllergies(request);
    }
    case "get_health_issues": {
      const { getHealthIssues } = await import(`${S}/healthIssues`);
      return getHealthIssues(request);
    }
    case "get_upcoming_visits": {
      const { upcomingVisits } = await import(`${S}/visits/visits`);
      return upcomingVisits(request);
    }
    case "get_past_visits": {
      const { pastVisits } = await import(`${S}/visits/visits`);
      const oldest = new Date();
      oldest.setFullYear(oldest.getFullYear() - ((input.years_back as number) ?? 2));
      return pastVisits(request, oldest);
    }
    case "get_lab_results": {
      const { listLabResults } = await import(`${S}/labs_and_procedure_results/labResults`);
      return listLabResults(request);
    }
    case "get_messages": {
      const { listConversations } = await import(`${S}/messages/conversations`);
      return listConversations(request);
    }
    case "get_billing": {
      const { getBillingHistory } = await import(`${S}/bills/bills`);
      return getBillingHistory(request);
    }
    case "get_care_team": {
      const { getCareTeam } = await import(`${S}/careTeam`);
      return getCareTeam(request);
    }
    case "get_insurance": {
      const { getInsurance } = await import(`${S}/insurance`);
      return getInsurance(request);
    }
    case "get_immunizations": {
      const { getImmunizations } = await import(`${S}/immunizations`);
      return getImmunizations(request);
    }
    case "get_preventive_care": {
      const { getPreventiveCare } = await import(`${S}/preventiveCare`);
      return getPreventiveCare(request);
    }
    case "get_vitals": {
      const { getVitals } = await import(`${S}/vitals`);
      return getVitals(request);
    }
    case "get_documents": {
      const { getDocuments } = await import(`${S}/documents`);
      return getDocuments(request);
    }
    case "get_imaging_results": {
      const { getImagingResults } = await import(`${S}/labs_and_procedure_results/labResults`);
      return getImagingResults(request);
    }
    case "get_letters": {
      const { getLetters } = await import(`${S}/letters`);
      return getLetters(request);
    }
    case "get_referrals": {
      const { getReferrals } = await import(`${S}/referrals`);
      return getReferrals(request);
    }
    case "get_medical_history": {
      const { getMedicalHistory } = await import(`${S}/medicalHistory`);
      return getMedicalHistory(request);
    }
    case "get_emergency_contacts": {
      const { getEmergencyContacts } = await import(`${S}/emergencyContacts`);
      return getEmergencyContacts(request);
    }
    case "get_activity_feed": {
      const { getActivityFeed } = await import(`${S}/activityFeed`);
      return getActivityFeed(request);
    }
    case "get_care_journeys": {
      const { getCareJourneys } = await import(`${S}/careJourneys`);
      return getCareJourneys(request);
    }
    case "get_goals": {
      const { getGoals } = await import(`${S}/goals`);
      return getGoals(request);
    }
    case "get_education_materials": {
      const { getEducationMaterials } = await import(`${S}/educationMaterials`);
      return getEducationMaterials(request);
    }
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
