/**
 * MyChartClient — high-level wrapper around a MyChart session.
 *
 * Owns the cookie jar, runs an auto-keepalive ping (default 30s), and exposes
 * one method per scraper. Returned image data preserves the structure of the
 * underlying scrapers; pixel bytes for individual images are available via
 * `DirectDownloadedImage.pixelData`.
 */

import { MyChartRequest, type MyChartRequestOptions } from '../../scrapers/myChart/myChartRequest';
import {
  myChartUserPassLogin,
  myChartPasskeyLogin,
  complete2faFlow,
  areCookiesValid,
  type LoginResult,
  type TwoFaResult,
  type TwoFaDeliveryInfo,
} from '../../scrapers/myChart/login';
import { generateTotpCode } from '../../scrapers/myChart/totp';
import type { PasskeyCredential } from '../../scrapers/myChart/softwareAuthenticator';

import { getMyChartProfile, getEmail } from '../../scrapers/myChart/profile';
import {
  discoverProxyTargets,
  switchProxyTarget,
  verifyActiveProxyTarget,
} from '../../scrapers/myChart/proxyContext';
import { getHealthSummary } from '../../scrapers/myChart/healthSummary';
import { getVitals } from '../../scrapers/myChart/vitals';
import { getMedications } from '../../scrapers/myChart/medications';
import { requestMedicationRefill } from '../../scrapers/myChart/medicationRefill';
import { getAllergies } from '../../scrapers/myChart/allergies';
import { getHealthIssues } from '../../scrapers/myChart/healthIssues';
import { getMedicalHistory } from '../../scrapers/myChart/medicalHistory';
import { getImmunizations } from '../../scrapers/myChart/immunizations';

import { listLabResults, getImagingResults } from '../../scrapers/myChart/labs_and_procedure_results/labResults';
import {
  downloadImagingStudyDirect,
  type DirectDownloadOptions,
  type DirectDownloadResult,
} from '../../scrapers/myChart/eunity/imagingDirectDownload';

import { upcomingVisits, pastVisits } from '../../scrapers/myChart/visits/visits';

import { listConversations } from '../../scrapers/myChart/messages/conversations';
import { getConversationMessages } from '../../scrapers/myChart/messages/messageThreads';
import {
  sendNewMessage,
  getMessageRecipients,
  getMessageTopics,
  type SendNewMessageParams,
  type SendNewMessageResult,
} from '../../scrapers/myChart/messages/sendMessage';
import { sendReply, type SendReplyParams, type SendReplyResult } from '../../scrapers/myChart/messages/sendReply';
import { deleteMessage } from '../../scrapers/myChart/messages/deleteMessage';

import { getBillingHistory } from '../../scrapers/myChart/bills/bills';

import { getCareTeam } from '../../scrapers/myChart/careTeam';
import { getReferrals } from '../../scrapers/myChart/referrals';
import { getInsurance } from '../../scrapers/myChart/insurance';
import { getDocuments } from '../../scrapers/myChart/documents';
import { getGoals } from '../../scrapers/myChart/goals';
import { getCareJourneys } from '../../scrapers/myChart/careJourneys';
import { getUpcomingOrders } from '../../scrapers/myChart/upcomingOrders';
import { getPreventiveCare } from '../../scrapers/myChart/preventiveCare';
import { getEducationMaterials } from '../../scrapers/myChart/educationMaterials';
import { getQuestionnaires } from '../../scrapers/myChart/questionnaires';
import { getActivityFeed } from '../../scrapers/myChart/activityFeed';
import { getLetters, getLetterDetails } from '../../scrapers/myChart/letters';

import {
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
  type EmergencyContactInput,
  type EmergencyContactUpdateInput,
} from '../../scrapers/myChart/emergencyContacts';

import { getLinkedMyChartAccounts } from '../../scrapers/myChart/other_mycharts/other_mycharts';
import { getEhiExportTemplates } from '../../scrapers/myChart/ehiExport';

const KEEPALIVE_INTERVAL_MS = 30 * 1000;

/** Options accepted by every `MyChartClient.connect*` factory. */
export interface MyChartClientOptions {
  hostname: string;
  /** Defaults to `'https'`, except auto-detected as `'http'` for localhost / hostnames without a dot. */
  protocol?: 'http' | 'https';
  /** Custom fetch (e.g. raw `fetch` on iOS where the OS handles cookies natively). */
  fetchFn?: MyChartRequestOptions['fetchFn'];
  /** Run a background keepalive ping every 30s. Default `true`. */
  keepalive?: boolean;
}

export interface ConnectArgs extends MyChartClientOptions {
  user: string;
  pass: string;
  /** If true, skip MyChart's "send 2FA code" step (used when the consumer wants to drive delivery itself). */
  skipSendCode?: boolean;
}

export type ConnectResult =
  | { state: 'connected'; client: MyChartClient }
  | PendingTwoFa
  | { state: 'invalid_login' | 'error'; error?: string };

export interface PendingTwoFa {
  state: 'need_2fa';
  /** Best-effort info about how MyChart sent the code (email/SMS, masked contact). */
  delivery?: TwoFaDeliveryInfo;
  /** Approximate epoch-ms timestamp when MyChart said the code was sent. */
  sentAt?: number;
  /**
   * Submit the 6-digit code (or TOTP code) the user entered.
   * Resolves to a connected `MyChartClient` on success; throws on invalid code / error.
   */
  complete(code: string, opts?: { isTOTP?: boolean }): Promise<MyChartClient>;
}

/**
 * High-level wrapper around an authenticated MyChart session.
 *
 * Construct via {@link MyChartClient.connect}, {@link MyChartClient.connectWithPasskey},
 * or {@link MyChartClient.fromSerialized}. The class is not directly newable.
 */
export class MyChartClient {
  /** The underlying request/session. Public for power users; usually you don't need it. */
  readonly request: MyChartRequest;

  private readonly opts: MyChartClientOptions;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  private constructor(request: MyChartRequest, opts: MyChartClientOptions) {
    this.request = request;
    this.opts = opts;
    if (opts.keepalive !== false) {
      this.startKeepalive();
    }
  }

  // ── Factories ───────────────────────────────────────────────────────────

  /**
   * Log in with username + password.
   *
   * If MyChart requires 2FA, the returned `state` is `'need_2fa'` and the
   * caller must invoke `pending.complete(code)` to obtain a connected client.
   */
  static async connect(args: ConnectArgs): Promise<ConnectResult> {
    const result = await myChartUserPassLogin({
      hostname: args.hostname,
      protocol: args.protocol,
      fetchFn: args.fetchFn,
      user: args.user,
      pass: args.pass,
      skipSendCode: args.skipSendCode,
    });
    return MyChartClient.wrapLoginResult(result, args);
  }

  /**
   * Log in with a previously-registered passkey credential. (Bypasses 2FA.)
   */
  static async connectWithPasskey(args: MyChartClientOptions & { credential: PasskeyCredential }): Promise<ConnectResult> {
    const result = await myChartPasskeyLogin({
      hostname: args.hostname,
      protocol: args.protocol,
      fetchFn: args.fetchFn,
      credential: args.credential,
    });
    return MyChartClient.wrapLoginResult(result, args);
  }

  /**
   * Restore a connected client from a previously-serialized session.
   * Returns `null` if the JSON is malformed.
   */
  static async fromSerialized(
    json: string,
    opts?: { fetchFn?: MyChartRequestOptions['fetchFn']; keepalive?: boolean }
  ): Promise<MyChartClient | null> {
    const req = await MyChartRequest.unserialize(json, opts);
    if (!req) return null;
    return new MyChartClient(req, {
      hostname: req.hostname,
      protocol: req.protocol === 'http' ? 'http' : 'https',
      fetchFn: opts?.fetchFn,
      keepalive: opts?.keepalive,
    });
  }

  private static wrapLoginResult(result: LoginResult, opts: MyChartClientOptions): ConnectResult {
    if (result.state === 'logged_in') {
      return { state: 'connected', client: new MyChartClient(result.mychartRequest, opts) };
    }
    if (result.state === 'need_2fa') {
      // Don't start keepalive on a pending session — only after 2FA completes.
      const pendingClient = new MyChartClient(result.mychartRequest, { ...opts, keepalive: false });
      const pending: PendingTwoFa = {
        state: 'need_2fa',
        delivery: result.twoFaDelivery,
        sentAt: result.twoFaSentTime,
        complete: async (code, completeOpts) => {
          const r: TwoFaResult = await complete2faFlow({
            mychartRequest: pendingClient.request,
            code,
            isTOTP: completeOpts?.isTOTP,
          });
          if (r.state !== 'logged_in') {
            throw new Error(`2FA failed: state=${r.state}`);
          }
          // Promote: start keepalive now that we're authenticated.
          if (opts.keepalive !== false) pendingClient.startKeepalive();
          return pendingClient;
        },
      };
      return pending;
    }
    return { state: result.state, error: result.error };
  }

  // ── Session lifecycle ───────────────────────────────────────────────────

  /** Persist this session as a JSON blob. Pair with {@link MyChartClient.fromSerialized}. */
  async serialize(): Promise<string> {
    return this.request.serialize();
  }

  /** Cheap server-side check that the session is still authenticated. */
  async isSessionValid(): Promise<boolean> {
    return areCookiesValid(this.request);
  }

  /** Stop the keepalive timer and prevent further method calls. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private startKeepalive() {
    if (this.keepaliveTimer || this.closed) return;
    this.keepaliveTimer = setInterval(() => {
      // Don't await — we don't want the timer to drift. If a ping fails, the
      // next call will surface the auth failure.
      this.runKeepalivePing().catch(() => {});
    }, KEEPALIVE_INTERVAL_MS);
    // Don't keep the event loop alive just because of the keepalive timer.
    if (typeof this.keepaliveTimer === 'object' && this.keepaliveTimer && 'unref' in this.keepaliveTimer) {
      (this.keepaliveTimer as { unref: () => void }).unref();
    }
  }

  /**
   * Pings MyChart's two keepalive endpoints. Mirrors the official client's
   * 30s interval so server-side session timers stay armed.
   */
  private async runKeepalivePing(): Promise<void> {
    try {
      await Promise.all([
        this.request.makeRequest({ path: '/Home/KeepAlive', followRedirects: false }),
        this.request.makeRequest({ path: '/keepalive.asp', followRedirects: false }),
      ]);
    } catch {
      // Swallow — next user-driven request will surface real auth issues.
    }
  }

  private req(): MyChartRequest {
    if (this.closed) throw new Error('MyChartClient has been closed');
    return this.request;
  }

  // ── Auth-related convenience ────────────────────────────────────────────

  /** Convenience: derive a current TOTP code from the user's secret. Useful for app-stored TOTP setups. */
  static totpCode(secret: string): Promise<string> {
    return generateTotpCode(secret);
  }

  // ── Profile ─────────────────────────────────────────────────────────────
  getProfile() { return getMyChartProfile(this.req()); }
  getEmail()   { return getEmail(this.req()); }
  discoverProxyTargets() { return discoverProxyTargets(this.req()); }
  switchProxyTarget(target: { id?: string; displayName?: string }) { return switchProxyTarget(this.req(), target); }
  verifyActiveProxyTarget() { return verifyActiveProxyTarget(this.req()); }

  // ── Health summary / vitals ─────────────────────────────────────────────
  getHealthSummary() { return getHealthSummary(this.req()); }
  getVitals()        { return getVitals(this.req()); }

  // ── Medications ─────────────────────────────────────────────────────────
  getMedications() { return getMedications(this.req()); }
  requestMedicationRefill(medicationKey: string) { return requestMedicationRefill(this.req(), medicationKey); }

  // ── Allergies / health issues / history / immunizations ────────────────
  getAllergies()      { return getAllergies(this.req()); }
  getHealthIssues()   { return getHealthIssues(this.req()); }
  getMedicalHistory() { return getMedicalHistory(this.req()); }
  getImmunizations()  { return getImmunizations(this.req()); }

  // ── Labs / imaging ──────────────────────────────────────────────────────
  listLabResults()                                                   { return listLabResults(this.req()); }
  getImagingResults(options?: { followSaml?: boolean })              { return getImagingResults(this.req(), options); }
  /**
   * Download imaging study image data via eUnity. Returns parsed series and
   * (if not skipped) raw `pixelData` Buffers per image.
   *
   * `outputDir` is required by the underlying scraper for filesystem writes;
   * pass `options.skipFileWrite: true` to keep results in-memory only.
   */
  downloadImagingStudy(
    fdiContext: Parameters<typeof downloadImagingStudyDirect>[1],
    studyName: string,
    outputDir: string,
    options?: DirectDownloadOptions,
  ): Promise<DirectDownloadResult> {
    return downloadImagingStudyDirect(this.req(), fdiContext, studyName, outputDir, options);
  }

  // ── Visits ──────────────────────────────────────────────────────────────
  upcomingVisits()                          { return upcomingVisits(this.req()); }
  pastVisits(oldestRenderedDate: Date)      { return pastVisits(this.req(), oldestRenderedDate); }

  // ── Messages ────────────────────────────────────────────────────────────
  listConversations()                                       { return listConversations(this.req()); }
  getConversationMessages(conversationId: string)           { return getConversationMessages(this.req(), conversationId); }
  sendMessage(params: SendNewMessageParams): Promise<SendNewMessageResult> {
    return sendNewMessage(this.req(), params);
  }
  sendReply(params: SendReplyParams): Promise<SendReplyResult>  { return sendReply(this.req(), params); }
  deleteMessage(conversationId: string)                         { return deleteMessage(this.req(), conversationId); }
  getMessageRecipients(token: string)                           { return getMessageRecipients(this.req(), token); }
  getMessageTopics(token: string)                               { return getMessageTopics(this.req(), token); }

  // ── Bills ───────────────────────────────────────────────────────────────
  getBillingHistory() { return getBillingHistory(this.req()); }

  // ── Care coordination ──────────────────────────────────────────────────
  getCareTeam()           { return getCareTeam(this.req()); }
  getReferrals()          { return getReferrals(this.req()); }
  getInsurance()          { return getInsurance(this.req()); }
  getDocuments()          { return getDocuments(this.req()); }
  getGoals()              { return getGoals(this.req()); }
  getCareJourneys()       { return getCareJourneys(this.req()); }
  getUpcomingOrders()     { return getUpcomingOrders(this.req()); }
  getPreventiveCare()     { return getPreventiveCare(this.req()); }
  getEducationMaterials() { return getEducationMaterials(this.req()); }
  getQuestionnaires()     { return getQuestionnaires(this.req()); }
  getActivityFeed()       { return getActivityFeed(this.req()); }
  getLetters()            { return getLetters(this.req()); }
  getLetterDetails(hnoId: string, csn: string) { return getLetterDetails(this.req(), hnoId, csn); }

  // ── Emergency contacts ─────────────────────────────────────────────────
  getEmergencyContacts()                              { return getEmergencyContacts(this.req()); }
  addEmergencyContact(input: EmergencyContactInput)   { return addEmergencyContact(this.req(), input); }
  updateEmergencyContact(input: EmergencyContactUpdateInput) { return updateEmergencyContact(this.req(), input); }
  removeEmergencyContact(id: string)                  { return removeEmergencyContact(this.req(), id); }

  // ── Linked accounts / EHI export ───────────────────────────────────────
  getLinkedMyChartAccounts() { return getLinkedMyChartAccounts(this.req()); }
  getEhiExportTemplates()    { return getEhiExportTemplates(this.req()); }
}
