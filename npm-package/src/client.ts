/**
 * MyChartClient — high-level wrapper around a MyChart session.
 *
 * Owns the cookie jar, runs an auto-keepalive ping (default 30s), and exposes
 * one method per scraper. Returned image data preserves the structure of the
 * underlying scrapers; pixel bytes for individual images are available via
 * `DirectDownloadedImage.pixelData`.
 */

import { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import {
  myChartUserPassLogin,
  myChartPasskeyLogin,
  complete2faFlow,
  areCookiesValid,
  type LoginResult,
  type TwoFaResult,
  type TwoFaDeliveryInfo,
} from '../../scrapers/myChart/auth/login';
import { generateTotpCode } from '../../scrapers/myChart/auth/totp';
import {
  lookupNpi,
  searchNpiRegistry,
  type NpiProviderStandard,
  type NpiRegistryErrors,
  type NpiRegistryOptions,
  type NpiSearchQuery,
  type NpiSearchStandard,
} from '../../scrapers/npi/npiRegistry';
import {
  searchMyChartDirectory,
  type MyChartDirectorySearchOptions,
  type MyChartDirectorySearchResult,
} from '../../scrapers/list-all-mycharts/searchDirectory';
import { wireSilentReauthentication, type SilentLoginParams } from '../../scrapers/myChart/auth/silentLogin';
import { sessionStore } from '../../scrapers/myChart/core/sessionStore';
import type { PasskeyCredential } from '../../scrapers/myChart/auth/softwareAuthenticator';

import { getMyChartProfile, getEmail } from '../../scrapers/myChart/chart/profile/profile';
import {
  discoverProxyTargets,
  switchProxyTarget,
  verifyActiveProxyTarget,
} from '../../scrapers/myChart/proxy/proxyContext';
import {
  runListProxyTargets,
  runSwitchProxyTarget,
  assertProxyReadContext,
} from '../../scrapers/myChart/proxy/proxyTools';
import { getHealthSummary } from '../../scrapers/myChart/chart/healthSummary/healthSummary';
import { getVitals } from '../../scrapers/myChart/chart/vitals/vitals';
import { getMedications } from '../../scrapers/myChart/chart/medications/medications';
import { getAllergies } from '../../scrapers/myChart/chart/allergies/allergies';
import { getHealthIssues } from '../../scrapers/myChart/chart/healthIssues/healthIssues';
import { getMedicalHistory } from '../../scrapers/myChart/chart/medicalHistory/medicalHistory';
import { getImmunizations } from '../../scrapers/myChart/chart/immunizations/immunizations';

import { listLabResults, getImagingResults } from '../../scrapers/myChart/chart/labs/labResults';
import {
  downloadImagingStudyDirect,
  type DirectDownloadOptions,
  type DirectDownloadResult,
} from '../../scrapers/myChart/eunity/imagingDirectDownload';

import { upcomingVisits, pastVisits } from '../../scrapers/myChart/chart/visits/visits';

import { listConversations } from '../../scrapers/myChart/chart/messages/conversations';
import { getConversationMessages } from '../../scrapers/myChart/chart/messages/messageThreads';
import {
  sendNewMessage,
  getMessageRecipients,
  getMessageTopics,
  type SendNewMessageParams,
  type SendNewMessageResult,
} from '../../scrapers/myChart/chart/messages/sendMessage';
import { sendReply, type SendReplyParams, type SendReplyResult } from '../../scrapers/myChart/chart/messages/sendReply';
import { deleteMessage } from '../../scrapers/myChart/chart/messages/deleteMessage';

import { getBillingHistory } from '../../scrapers/myChart/chart/bills/bills';

import { getCareTeam } from '../../scrapers/myChart/chart/careTeam/careTeam';
import { getReferrals } from '../../scrapers/myChart/chart/referrals/referrals';
import { getInsurance } from '../../scrapers/myChart/chart/insurance/insurance';
import { getInsurancePayers } from '../../scrapers/myChart/chart/insurancePayers/insurancePayers';
import { getDocuments } from '../../scrapers/myChart/chart/documents/documents';
import { getGoals } from '../../scrapers/myChart/chart/goals/goals';
import { getCareJourneys } from '../../scrapers/myChart/chart/careJourneys/careJourneys';
import { getUpcomingOrders } from '../../scrapers/myChart/chart/upcomingOrders/upcomingOrders';
import { getPreventiveCare } from '../../scrapers/myChart/chart/preventiveCare/preventiveCare';
import { getEducationMaterials } from '../../scrapers/myChart/chart/educationMaterials/educationMaterials';
import { getQuestionnaires } from '../../scrapers/myChart/chart/questionnaires/questionnaires';
import { getActivityFeed } from '../../scrapers/myChart/chart/activityFeed/activityFeed';
import { getLetters, getLetterDetails } from '../../scrapers/myChart/chart/letters/letters';

import {
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
  type EmergencyContactInput,
  type EmergencyContactUpdateInput,
} from '../../scrapers/myChart/chart/emergencyContacts/emergencyContacts';

import { getLinkedMyChartAccounts } from '../../scrapers/myChart/chart/otherMyCharts/otherMyCharts';
import { getEhiExportTemplates } from '../../scrapers/myChart/chart/ehiExport/ehiExport';

import { getVisitNotes, getNoteContent, getVisitAVS } from '../../scrapers/myChart/chart/notes/notes';
import { setupPasskey, listPasskeys, deletePasskey } from '../../scrapers/myChart/auth/setupPasskey';
import { setupTotp, disableTotp } from '../../scrapers/myChart/auth/setupTotp';
import {
  CAPABILITIES,
  executeCapability,
  type Capability,
  type CapabilityArgs,
  type CapabilityContext,
} from '../../shared/capabilities';

/** Options accepted by every `MyChartClient.connect*` factory. */
export interface MyChartClientOptions {
  hostname: string;
  /** Defaults to `'https'`, except auto-detected as `'http'` for localhost / hostnames without a dot. */
  protocol?: 'http' | 'https';
  /** Run a background keepalive ping every 30s. Default `true`. */
  keepalive?: boolean | undefined;
  /**
   * When the session expires mid-call, silently re-login with the connect
   * credentials and retry. Default `true`. With it off (or after
   * `fromSerialized`, which has no credentials to renew with), an expired
   * session surfaces as a `SessionExpiredError`.
   */
  autoRenew?: boolean;
}

export interface ConnectArgs extends MyChartClientOptions {
  user: string;
  pass: string;
  /** If true, skip MyChart's "send 2FA code" step (used when the consumer wants to drive delivery itself). */
  skipSendCode?: boolean;
  /** TOTP secret used to auto-complete 2FA during a silent re-login. */
  totpSecret?: string;
}

// Every member carries a UNIT discriminant on purpose: with a combined
// `state: 'invalid_login' | 'error'` member, TypeScript cannot remove it when
// a caller negates the checks (`if (invalid || error) return;`), and the
// examples' narrowing silently stops working.
export type ConnectResult =
  | { state: 'connected'; client: MyChartClient }
  | PendingTwoFa
  | { state: 'invalid_login'; error?: string | undefined }
  | { state: 'error'; error?: string | undefined };

export interface PendingTwoFa {
  state: 'need_2fa';
  /**
   * Best-effort info about how MyChart sent the code (email/SMS, masked contact).
   * A TOTP challenge has no delivery at all, so this is genuinely `| undefined`.
   */
  delivery?: TwoFaDeliveryInfo | undefined;
  /** Approximate epoch-ms timestamp when MyChart said the code was sent. */
  sentAt?: number | undefined;
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

  private closed = false;

  private constructor(request: MyChartRequest, opts: MyChartClientOptions) {
    this.request = request;
    if (opts.keepalive === false) {
      // The shared keepalive would otherwise enroll this session on its first
      // authenticated request; honor the opt-out at the source.
      request.disableAutoKeepalive = true;
    } else {
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
      user: args.user,
      pass: args.pass,
      skipSendCode: args.skipSendCode,
    });
    return MyChartClient.wrapLoginResult(result, args, () => ({
      hostname: args.hostname,
      username: args.user,
      password: args.pass,
      totpSecret: args.totpSecret,
      protocol: args.protocol,
    }));
  }

  /**
   * Log in with a previously-registered passkey credential. (Bypasses 2FA.)
   */
  static async connectWithPasskey(args: MyChartClientOptions & { credential: PasskeyCredential }): Promise<ConnectResult> {
    const result = await myChartPasskeyLogin({
      hostname: args.hostname,
      protocol: args.protocol,
      credential: args.credential,
    });
    // A silent re-login mutates the credential's WebAuthn signature counter in
    // place; the caller already owns the object and its persistence.
    return MyChartClient.wrapLoginResult(result, args, () => ({
      hostname: args.hostname,
      passkey: args.credential,
      protocol: args.protocol,
    }));
  }

  /**
   * Restore a connected client from a previously-serialized session.
   * Returns `null` if the JSON is malformed.
   */
  static async fromSerialized(
    json: string,
    opts?: { keepalive?: boolean | undefined }
  ): Promise<MyChartClient | null> {
    const req = await MyChartRequest.unserialize(json);
    if (!req) return null;
    return new MyChartClient(req, {
      hostname: req.hostname,
      protocol: req.protocol === 'http' ? 'http' : 'https',
      keepalive: opts?.keepalive,
    });
  }

  private static wrapLoginResult(
    result: LoginResult,
    opts: MyChartClientOptions,
    renewParams?: () => SilentLoginParams,
  ): ConnectResult {
    const wireRenewal = (client: MyChartClient) => {
      if (opts.autoRenew === false || !renewParams) return;
      wireSilentReauthentication(client.request, renewParams);
    };

    if (result.state === 'logged_in') {
      const client = new MyChartClient(result.mychartRequest, opts);
      wireRenewal(client);
      return { state: 'connected', client };
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
          // Promote: start keepalive + renewal now that we're authenticated.
          if (opts.keepalive !== false) {
            pendingClient.request.disableAutoKeepalive = false;
            pendingClient.startKeepalive();
          }
          wireRenewal(pendingClient);
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

  /** Stop the keepalive pings and prevent further method calls. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    sessionStore.unregister(this.request);
  }

  /**
   * Enroll in the shared keepalive: MyChart's two keepalive endpoints pinged
   * on the official client's 30s cadence, with automatic renewal when a
   * heartbeat finds the session dead (if renewal credentials are wired). The
   * shared interval is unref'd, so it never holds the event loop open.
   */
  private startKeepalive() {
    if (this.closed) return;
    sessionStore.registerForKeepalive(this.request);
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

  // ── Capability registry ─────────────────────────────────────────────────

  /**
   * Every capability OpenRecord supports, from the shared registry
   * (`shared/capabilities/`) — the same list the CLI, the Claude Desktop
   * extension and the mobile app derive their tools from. Useful for building
   * a tool layer of your own without re-deriving what exists.
   */
  static capabilities(): readonly Capability[] {
    return CAPABILITIES;
  }

  /**
   * Run a capability by id against this session — `runCapability('get_visit_notes', { csn })`.
   *
   * The typed methods below are the ergonomic path and cover the same ground;
   * this is the dynamic one, for callers dispatching on a name they were
   * handed (a tool call, a CLI argument, a queue message).
   *
   * `ctx` is only consulted by the account-security capabilities, which need
   * the account password and somewhere to persist a new secret.
   */
  runCapability(id: string, args: CapabilityArgs = {}, ctx?: CapabilityContext): Promise<unknown> {
    return executeCapability(this.req(), id, args, ctx);
  }

  // ── Public lookups ──────────────────────────────────────────────────────
  //
  // `public`-kind capabilities read something no account owns — CMS's NPI
  // Registry, Epic's directory of MyChart instances. They are `static` because
  // there is nothing for an instance to supply: no session, no cookies, no
  // patient. Constructing a client (and therefore logging in) to look up an
  // NPI would be a login for nothing.

  /**
   * Run a `public` capability by id — `runPublicCapability('lookup_npi', { npi })`.
   *
   * The dynamic counterpart to {@link runCapability}, for a caller dispatching
   * on a name it was handed. Passing a chart capability's id here throws
   * rather than silently doing something with no session.
   */
  static runPublicCapability(id: string, args: CapabilityArgs = {}): Promise<unknown> {
    return executeCapability(null, id, args);
  }

  /**
   * One provider, by National Provider Identifier. `null` when the registry
   * has nobody by that number; {@link NpiRegistryErrors} when it refused the
   * query — narrow it with `isNpiRegistryErrors`.
   */
  static lookupNpi(
    npi: string,
    options?: NpiRegistryOptions,
  ): Promise<NpiProviderStandard | NpiRegistryErrors | null> {
    return lookupNpi(npi, options);
  }

  /** Providers matching a name, specialty and/or place. One page per call. */
  static searchNpiRegistry(
    query: NpiSearchQuery,
    options?: NpiRegistryOptions,
  ): Promise<NpiSearchStandard | NpiRegistryErrors> {
    return searchNpiRegistry(query, options);
  }

  /** The MyChart instances whose name, alias or hostname matches `query`. */
  static searchMyCharts(
    query: string,
    options?: MyChartDirectorySearchOptions,
  ): Promise<MyChartDirectorySearchResult> {
    return searchMyChartDirectory(query, options);
  }

  // ── Profile ─────────────────────────────────────────────────────────────
  getProfile() { return getMyChartProfile(this.req()); }
  getEmail()   { return getEmail(this.req()); }
  discoverProxyTargets() { return discoverProxyTargets(this.req()); }
  switchProxyTarget(target: { id?: string; displayName?: string }) { return switchProxyTarget(this.req(), target); }
  verifyActiveProxyTarget() { return verifyActiveProxyTarget(this.req()); }

  // ── Patient records (proxy access) ──────────────────────────────────────
  // The client-facing pair the other three clients expose as tools. The three
  // methods above are the lower-level primitives they are built on.
  listProxyTargets() { return runListProxyTargets(this.req()); }
  switchToPatient(patient: string) { return runSwitchProxyTarget(this.req(), patient); }
  /**
   * Assert MyChart is on the patient a call is about, without changing
   * anything. Throws with the switch to run on a mismatch. `runCapability`
   * does this for you; call it directly when driving the raw scrapers.
   */
  assertProxyReadContext(patient?: string) { return assertProxyReadContext(this.req(), patient); }

  // ── Health summary / vitals ─────────────────────────────────────────────
  getHealthSummary() { return getHealthSummary(this.req()); }
  getVitals()        { return getVitals(this.req()); }

  // ── Medications ─────────────────────────────────────────────────────────
  getMedications() { return getMedications(this.req()); }

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

  // ── Visit notes ─────────────────────────────────────────────────────────
  getVisitNotes(csn: string)                { return getVisitNotes(this.req(), csn); }
  getNoteContent(params: { csn: string; lrpId: string; hnoId: string; hnoDat: string }) {
    return getNoteContent(this.req(), params);
  }
  getVisitAVS(csn: string)                  { return getVisitAVS(this.req(), csn); }

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
  getInsurancePayers()    { return getInsurancePayers(this.req()); }
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

  // ── Account security ───────────────────────────────────────────────────
  // These change how the patient signs in. Persisting whatever they hand back
  // (the passkey credential, the TOTP secret) is the caller's job — this
  // library deliberately owns no credential store.
  setupPasskey()                { return setupPasskey(this.req()); }
  listPasskeys()                { return listPasskeys(this.req()); }
  deletePasskey(rawId: string)  { return deletePasskey(this.req(), rawId); }
  setupTotp(password: string)   { return setupTotp(this.req(), password); }
  disableTotp(password: string, totpSecret: string) {
    return disableTotp(this.req(), password, totpSecret);
  }
}
