/**
 * mychart-cli — programmatic access to Epic MyChart patient portals.
 *
 * Two ways to use this package:
 *
 *   1. The high-level `MyChartClient` class. Owns the session, runs an
 *      auto-keepalive ping, and exposes one method per scraper. Most users
 *      should start here.
 *
 *   2. The raw scraper functions. Every scraper takes a `MyChartRequest` as
 *      its first argument and returns a typed Promise. Use these when the
 *      class wrapper doesn't fit your control flow.
 *
 * @see {@link MyChartClient} for the recommended ergonomic API.
 */

// ─── Core session ──────────────────────────────────────────────────────────
export {
  MyChartRequest,
  type MyChartRequestOptions,
} from '../../scrapers/myChart/core/myChartRequest';
export type { RequestConfig } from '../../scrapers/myChart/core/types';

// ─── Auth / login / 2FA / passkeys ─────────────────────────────────────────
export {
  myChartUserPassLogin,
  myChartPasskeyLogin,
  complete2faFlow,
  areCookiesValid,
  parse2faDeliveryMethods,
  type LoginResult,
  type TwoFaResult,
  type TwoFaDeliveryInfo,
} from '../../scrapers/myChart/auth/login';

export {
  makeAuthenticatedRequest,
  renewMyChartSession,
  SessionExpiredError,
  type AuthenticatedRequestOptions,
} from '../../scrapers/myChart/core/makeAuthenticatedRequest';
export {
  silentLogin,
  wireSilentReauthentication,
  type SilentLoginParams,
  type SilentLoginOutcome,
} from '../../scrapers/myChart/auth/silentLogin';

export { generateTotpCode, parseTotpUri } from '../../scrapers/myChart/auth/totp';
export {
  setupTotp,
  disableTotp,
  type SetupTotpResult,
} from '../../scrapers/myChart/auth/setupTotp';
export {
  setupPasskey,
  listPasskeys,
  deletePasskey,
} from '../../scrapers/myChart/auth/setupPasskey';
export {
  serializeCredential,
  deserializeCredential,
  type PasskeyCredential,
} from '../../scrapers/myChart/auth/softwareAuthenticator';

// ─── Profile ──────────────────────────────────────────────────────────────
export {
  getMyChartProfile,
  getEmail,
  type ProfileData,
} from '../../scrapers/myChart/chart/profile';
export {
  discoverProxyTargets,
  switchProxyTarget,
  verifyActiveProxyTarget,
  compareProfileNames,
  type ProxyTarget,
} from '../../scrapers/myChart/proxy/proxyContext';

// ─── Health summary / vitals ──────────────────────────────────────────────
export {
  getHealthSummary,
  type HealthSummary,
} from '../../scrapers/myChart/chart/healthSummary';
export {
  getVitals,
  type Flowsheet,
  type VitalReading,
} from '../../scrapers/myChart/chart/vitals';

// ─── Medications ──────────────────────────────────────────────────────────
export {
  getMedications,
  type MedicationsResult,
  type Medication,
  type Pharmacy,
} from '../../scrapers/myChart/chart/medications';
export {
  requestMedicationRefill,
  type RefillRequestResult,
} from '../../scrapers/myChart/chart/medicationRefill';

// ─── Allergies / health issues / history / immunizations ──────────────────
export {
  getAllergies,
  type AllergiesResult,
  type Allergy,
} from '../../scrapers/myChart/chart/allergies';
export {
  getHealthIssues,
  type HealthIssue,
} from '../../scrapers/myChart/chart/healthIssues';
export {
  getMedicalHistory,
  type MedicalHistoryResult,
  type Diagnosis,
  type Surgery,
  type FamilyMember,
} from '../../scrapers/myChart/chart/medicalHistory';
export {
  getImmunizations,
  type Immunization,
} from '../../scrapers/myChart/chart/immunizations';

// ─── Labs / imaging ───────────────────────────────────────────────────────
export {
  listLabResults,
  getImagingResults,
} from '../../scrapers/myChart/chart/labs/labResults';
export {
  downloadImagingStudyDirect,
  type DirectDownloadResult,
  type DirectDownloadedImage,
  type DirectDownloadOptions,
  type SeriesInfo,
} from '../../scrapers/myChart/eunity/imagingDirectDownload';

// ─── CLO image conversion ────────────────────────────────────────────────
// Two steps, deliberately not one: decode the raw CLO bytes from
// `downloadImagingStudyDirect` into a Bitmap, then hand that Bitmap to the
// exporter for the format you want. The intermediate is the point — it is where
// you apply your own VOI LUT / windowing, and it is what keeps the format
// choice at the call site instead of inferred from a filename.
export {
  convertCloToBitmap,
  convertCloToBitmap16,
  parseWrapper,
  applyVoiLut,
  to8bit,
  to16bit,
  type Bitmap,
  type Bitmap16,
  type CloMetadata,
} from '../../scrapers/myChart/clo-image-parser/clo_to_bitmap';

export {
  convertBitmap16ToJpg,
  convertBitmapToJpg,
  type JpgOptions,
} from '../../scrapers/myChart/clo-image-parser/exporters/to_jpg';
export {
  convertBitmapToJpgPureJs,
  convertCloToJpgPureJs,
  grayscaleToRgba,
  type PureJsJpeg,
} from '../../scrapers/myChart/clo-image-parser/exporters/to_jpg_purejs';
export {
  convertBitmap16ToWebp,
  convertBitmapToWebp,
} from '../../scrapers/myChart/clo-image-parser/exporters/to_webp';
export {
  convertBitmap16ToPng,
  type PngOptions,
} from '../../scrapers/myChart/clo-image-parser/exporters/to_png';
export {
  convertBitmap16ToAvif,
  type AvifOptions,
} from '../../scrapers/myChart/clo-image-parser/exporters/to_avif';
export {
  convertBitmap16ToTiff,
  type TiffOptions,
} from '../../scrapers/myChart/clo-image-parser/exporters/to_tiff';

// ─── Visits ───────────────────────────────────────────────────────────────
export { upcomingVisits, pastVisits } from '../../scrapers/myChart/chart/visits/visits';

// ─── Messages ─────────────────────────────────────────────────────────────
export {
  listConversations,
  type ConversationListResponse,
} from '../../scrapers/myChart/chart/messages/conversations';
export {
  getConversationMessages,
  type ConversationThread,
  type ThreadMessage,
} from '../../scrapers/myChart/chart/messages/messageThreads';
export {
  sendNewMessage,
  getMessageRecipients,
  getMessageTopics,
  getVerificationToken,
  type MessageRecipient,
  type MessageTopic,
  type SendNewMessageParams,
  type SendNewMessageResult,
} from '../../scrapers/myChart/chart/messages/sendMessage';
export {
  sendReply,
  type SendReplyParams,
  type SendReplyResult,
} from '../../scrapers/myChart/chart/messages/sendReply';
export {
  deleteMessage,
  type DeleteMessageResult,
} from '../../scrapers/myChart/chart/messages/deleteMessage';

// ─── Bills ────────────────────────────────────────────────────────────────
export { getBillingHistory } from '../../scrapers/myChart/chart/bills/bills';

// ─── Care coordination ───────────────────────────────────────────────────
export {
  getCareTeam,
  type CareTeam,
  type CareTeamMember,
} from '../../scrapers/myChart/chart/careTeam';
export {
  getReferrals,
  type Referral,
} from '../../scrapers/myChart/chart/referrals';
export {
  getInsurance,
  type InsuranceCoverage,
  type InsuranceResult,
} from '../../scrapers/myChart/chart/insurance';
export {
  getInsurancePayers,
  type InsurancePayer,
  type InsurancePayerCatalogue,
  type InsurancePayerFieldRequirement,
} from '../../scrapers/myChart/chart/insurancePayers';
export {
  getDocuments,
  type Document,
} from '../../scrapers/myChart/chart/documents';
export {
  getGoals,
  type Goal,
  type GoalsResult,
} from '../../scrapers/myChart/chart/goals';
export {
  getCareJourneys,
  type CareJourney,
} from '../../scrapers/myChart/chart/careJourneys';
export {
  getUpcomingOrders,
  type UpcomingOrder,
} from '../../scrapers/myChart/chart/upcomingOrders';
export {
  getPreventiveCare,
  type PreventiveCareItem,
} from '../../scrapers/myChart/chart/preventiveCare';
export {
  getEducationMaterials,
  type EducationMaterial,
} from '../../scrapers/myChart/chart/educationMaterials';
export {
  getQuestionnaires,
  type Questionnaire,
} from '../../scrapers/myChart/chart/questionnaires';
export {
  getActivityFeed,
  type ActivityFeedItem,
} from '../../scrapers/myChart/chart/activityFeed';
export {
  getLetters,
  getLetterDetails,
  type Letter,
  type LetterDetailsResponse,
} from '../../scrapers/myChart/chart/letters';

// ─── Emergency contacts ──────────────────────────────────────────────────
export {
  getEmergencyContacts,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
  type EmergencyContact,
  type EmergencyContactInput,
  type EmergencyContactUpdateInput,
  type EmergencyContactResult,
} from '../../scrapers/myChart/chart/emergencyContacts';

// ─── Linked accounts / EHI export ────────────────────────────────────────
export {
  getLinkedMyChartAccounts,
  type LinkedMyChart,
} from '../../scrapers/myChart/chart/otherMyCharts';
export {
  getEhiExportTemplates,
  type EhiTemplate,
} from '../../scrapers/myChart/chart/ehiExport';

// ─── Visit notes ─────────────────────────────────────────────────────────
export {
  getVisitNotes,
  getNoteContent,
  getVisitAVS,
  type VisitNote,
  type GetVisitNotesResult,
  type NoteContent,
} from '../../scrapers/myChart/chart/notes';

// ─── Capability registry ─────────────────────────────────────────────────
// The single source of truth for what OpenRecord can do with a MyChart
// account. The CLI, the Claude Desktop extension and the mobile app all derive
// their tool lists from it; exported here so consumers can build their own
// tool layer against exactly the same set.
export { resolveUnique, type ResolveUniqueOptions } from '../../shared/resolveUnique';
export {
  base64UrlEncode,
  base64UrlDecode,
} from '../../shared/base64url';
export {
  ACCOUNT_PARAM,
  ACCOUNT_PARAM_NAMES,
  PATIENT_PARAM,
  readAccountArg,
  acceptsPatientParam,
  CAPABILITIES,
  CAPABILITY_IDS,
  AGENT_CAPABILITIES,
  WRITE_CAPABILITY_IDS,
  getCapability,
  capabilitiesByGroup,
  executeCapability,
  describeCapability,
  encodeImageId,
  decodeImageId,
  resolveRecipient,
  resolveTopic,
  type Capability,
  type CapabilityArgs,
  type CapabilityContext,
  type CapabilityKind,
  type CapabilityParam,
  type StudyImagePayload,
} from '../../shared/capabilities';

// ─── High-level client ───────────────────────────────────────────────────
export {
  MyChartClient,
  type MyChartClientOptions,
  type ConnectArgs,
  type ConnectResult,
  type PendingTwoFa,
} from './client';
