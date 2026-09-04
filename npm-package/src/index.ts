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
  getProfile,
  fetchProfileRaw,
  profileProcessor,
  getEmail,
  type ProfileData,
  type ProfileStandard,
} from '../../scrapers/myChart/chart/profile/profile';
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
  fetchHealthSummaryRaw,
  healthSummaryProcessor,
  type HealthSummaryStandard,
} from '../../scrapers/myChart/chart/healthSummary/healthSummary';
export {
  getVitals,
  fetchVitalsRaw,
  vitalsProcessor,
  type VitalsStandard,
  type FlowsheetStandard,
  type VitalReadingStandard,
} from '../../scrapers/myChart/chart/vitals/vitals';

// ─── Medications ──────────────────────────────────────────────────────────
export {
  getMedications,
  fetchMedicationsRaw,
  medicationsProcessor,
  type MedicationsStandard,
  type PrescriptionStandard,
  type RefillDetailsStandard,
  type OwningPharmacyStandard,
} from '../../scrapers/myChart/chart/medications/medications';
export {
  requestMedicationRefill,
  type RefillRequestResult,
} from '../../scrapers/myChart/chart/medications/medicationRefill';

// ─── Allergies / health issues / history / immunizations ──────────────────
export {
  getAllergies,
  fetchAllergiesRaw,
  allergiesProcessor,
  type AllergiesStandard,
} from '../../scrapers/myChart/chart/allergies/allergies';
export {
  getHealthIssues,
  fetchHealthIssuesRaw,
  healthIssuesProcessor,
  type HealthIssuesStandard,
  type HealthIssueStandard,
} from '../../scrapers/myChart/chart/healthIssues/healthIssues';
export {
  getMedicalHistory,
  fetchMedicalHistoryRaw,
  medicalHistoryProcessor,
  type MedicalHistoryStandard,
  type DiagnosisStandard,
  type SurgeryStandard,
  type FamilyMemberStandard,
} from '../../scrapers/myChart/chart/medicalHistory/medicalHistory';
export {
  getImmunizations,
  fetchImmunizationsRaw,
  immunizationsProcessor,
  type ImmunizationsStandard,
  type ImmunizationStandard,
} from '../../scrapers/myChart/chart/immunizations/immunizations';

// ─── Labs / imaging ───────────────────────────────────────────────────────
export {
  listLabResults,
  getImagingResults,
  fetchLabResultsRaw,
  fetchImagingResultsRaw,
  labResultsProcessor,
  imagingResultsProcessor,
  type LabResultsStandard,
  type LabOrderStandard,
  type ImagingResultsStandard,
  type ImagingOrderStandard,
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
export {
  upcomingVisits,
  pastVisits,
  fetchUpcomingVisitsRaw,
  fetchPastVisitsRaw,
  upcomingVisitsProcessor,
  pastVisitsProcessor,
  visitStandard,
  visitInstantMs,
  type UpcomingVisitsStandard,
  type PastVisitsStandard,
  type VisitStandard,
  type VisitStatus,
} from '../../scrapers/myChart/chart/visits/visits';

// ─── Messages ─────────────────────────────────────────────────────────────
export {
  listConversations,
  fetchConversationsRaw,
  conversationsProcessor,
  type ConversationsStandard,
  type ConversationStandard,
  type MessageStandard,
} from '../../scrapers/myChart/chart/messages/conversations';
export {
  getConversationMessages,
  fetchConversationThreadRaw,
  conversationThreadProcessor,
  type ConversationThreadStandard,
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
  fetchMessageRecipientsRaw,
  fetchMessageTopicsRaw,
  listMessageRecipients,
  listMessageTopics,
  messageRecipientsProcessor,
  messageTopicsProcessor,
  type MessageRecipientsStandard,
  type MessageTopicsStandard,
} from '../../scrapers/myChart/chart/messages/recipients';
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
export {
  getBillingHistory,
  fetchBillingRaw,
  billingProcessor,
  type BillingStandard,
  type BillingAccountStandard,
  type BillingVisitStandard,
} from '../../scrapers/myChart/chart/bills/bills';

// ─── Care coordination ───────────────────────────────────────────────────
export {
  getCareTeam,
  fetchCareTeamRaw,
  careTeamProcessor,
  type CareTeamStandard,
  type CareTeamProviderStandard,
} from '../../scrapers/myChart/chart/careTeam/careTeam';
export {
  getReferrals,
  fetchReferralsRaw,
  referralsProcessor,
  type ReferralsStandard,
  type ReferralStandard,
} from '../../scrapers/myChart/chart/referrals/referrals';
export {
  getInsurance,
  fetchInsuranceRaw,
  insuranceProcessor,
  type InsuranceStandard,
  type InsuranceCoverageStandard,
} from '../../scrapers/myChart/chart/insurance/insurance';
export {
  getInsurancePayers,
  fetchInsurancePayersRaw,
  insurancePayersProcessor,
  type InsurancePayersStandard,
  type InsurancePayerStandard,
} from '../../scrapers/myChart/chart/insurancePayers/insurancePayers';
export {
  getDocuments,
  fetchDocumentsRaw,
  documentsProcessor,
  type DocumentsStandard,
} from '../../scrapers/myChart/chart/documents/documents';
export {
  getGoals,
  fetchGoalsRaw,
  goalsProcessor,
  type GoalsStandard,
} from '../../scrapers/myChart/chart/goals/goals';
export {
  getCareJourneys,
  fetchCareJourneysRaw,
  careJourneysProcessor,
  type CareJourneysStandard,
} from '../../scrapers/myChart/chart/careJourneys/careJourneys';
export {
  getUpcomingOrders,
  fetchUpcomingOrdersRaw,
  upcomingOrdersProcessor,
  type UpcomingOrdersStandard,
  type UpcomingOrderStandard,
} from '../../scrapers/myChart/chart/upcomingOrders/upcomingOrders';
export {
  getPreventiveCare,
  fetchPreventiveCareRaw,
  preventiveCareProcessor,
  type PreventiveCareStandard,
  type PreventiveCareItemStandard,
} from '../../scrapers/myChart/chart/preventiveCare/preventiveCare';
export {
  getEducationMaterials,
  fetchEducationMaterialsRaw,
  educationMaterialsProcessor,
  type EducationMaterialsStandard,
  type EducationMaterialStandard,
} from '../../scrapers/myChart/chart/educationMaterials/educationMaterials';
export {
  getQuestionnaires,
  fetchQuestionnairesRaw,
  questionnairesProcessor,
  type QuestionnairesStandard,
} from '../../scrapers/myChart/chart/questionnaires/questionnaires';
export {
  getActivityFeed,
  fetchActivityFeedRaw,
  activityFeedProcessor,
  type ActivityFeedStandard,
  type FeedItemStandard,
} from '../../scrapers/myChart/chart/activityFeed/activityFeed';
export {
  getLetters,
  getLetterDetails,
  fetchLettersRaw,
  fetchLetterDetailsRaw,
  lettersProcessor,
  letterDetailsProcessor,
  type LettersStandard,
  type LetterStandard,
  type LetterDetailsStandard,
} from '../../scrapers/myChart/chart/letters/letters';

// ─── Emergency contacts ──────────────────────────────────────────────────
export {
  getEmergencyContacts,
  fetchEmergencyContactsRaw,
  emergencyContactsProcessor,
  addEmergencyContact,
  updateEmergencyContact,
  removeEmergencyContact,
  type EmergencyContactsStandard,
  type EmergencyContactStandard,
  type EmergencyContactInput,
  type EmergencyContactUpdateInput,
  type EmergencyContactResult,
} from '../../scrapers/myChart/chart/emergencyContacts/emergencyContacts';

// ─── Linked accounts / EHI export ────────────────────────────────────────
export {
  getLinkedMyChartAccounts,
  fetchLinkedAccountsRaw,
  linkedAccountsProcessor,
  type LinkedAccountsStandard,
  type LinkedOrganizationStandard,
} from '../../scrapers/myChart/chart/otherMyCharts/otherMyCharts';
export {
  getEhiExportTemplates,
  fetchEhiExportRaw,
  ehiExportProcessor,
  type EhiExportStandard,
  type EhiTemplateStandard,
} from '../../scrapers/myChart/chart/ehiExport/ehiExport';

// ─── Visit notes ─────────────────────────────────────────────────────────
export {
  getVisitNotes,
  getNoteContent,
  getVisitAVS,
  fetchVisitNotesRaw,
  fetchNoteContentRaw,
  fetchVisitAvsRaw,
  visitNotesProcessor,
  noteContentProcessor,
  type VisitNotesStandard,
  type VisitNoteStandard,
  type NoteContentStandard,
} from '../../scrapers/myChart/chart/notes/notes';

// ─── Public information, no account ─────────────────────────────────────
// What a MyChart instance tells anyone about the health system behind it:
// support lines, the bookable provider directory with clinic addresses, and
// billing entities. Nothing here needs credentials.
export {
  fetchHospitalNetworkProfile,
  fetchProviderDirectory,
  fetchBillingEntities,
  parseOrgProfile,
  PreloginEndpointError,
  INSURANCE_GATE_REASON,
  type NetworkProfileOptions,
  type ProviderDirectoryOptions,
  type HospitalNetworkProfile,
  type OrgProfile,
  type PhoneNumber,
  type Provider,
  type Clinic,
  type Specialty,
  type BillingEntity,
  type PortalFeatures,
  type ProviderDirectory,
  type InsuranceAvailability,
} from '../../scrapers/myChart/prelogin';

// ─── Capability registry ─────────────────────────────────────────────────
// The single source of truth for what OpenRecord can do with a MyChart
// account. The CLI, the Claude Desktop extension and the mobile app all derive
// their tool lists from it; exported here so consumers can build their own
// tool layer against exactly the same set.
export { resolveUnique, type ResolveUniqueOptions } from '../../shared/resolveUnique';
export {
  ACCOUNT_PARAM,
  ACCOUNT_PARAM_NAMES,
  PATIENT_PARAM,
  readAccountArg,
  acceptsAccountParam,
  acceptsPatientParam,
  isPublicCapability,
  CAPABILITIES,
  CAPABILITY_IDS,
  AGENT_CAPABILITIES,
  PUBLIC_CAPABILITIES,
  PUBLIC_CAPABILITY_IDS,
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

// ─── Public directories — no MyChart account required ────────────────────
//
// CMS's NPI Registry and Epic's directory of MyChart instances. Both are
// public data, so these are the two scrapers here that take no session: an
// NPI turns into a provider, and a health system's name turns into the
// hostname you would then connect an account on.
export {
  fetchNpiLookupRaw,
  fetchNpiSearchRaw,
  lookupNpi,
  searchNpiRegistry,
  npiLookupProcessor,
  npiSearchProcessor,
  isNpiRegistryErrors,
  buildNpiSearchUrl,
  isValidNpi,
  NPI_REGISTRY_API_URL,
  NPI_REGISTRY_API_VERSION,
  NPI_REGISTRY_MAX_PAGE_SIZE,
  NPI_REGISTRY_MAX_SKIP,
  NPI_REGISTRY_DEFAULT_PAGE_SIZE,
  type NpiProviderType,
  type NpiSearchQuery,
  type NpiRegistryOptions,
  type NpiRegistryApiError,
  type NpiRegistryErrors,
  type NpiProviderStandard,
  type NpiSearchStandard,
  type NpiBasicStandard,
  type NpiAddressStandard,
  type NpiTaxonomyStandard,
  type NpiIdentifierStandard,
} from '../../scrapers/npi/npiRegistry';
export {
  fetchMyChartDirectory,
  fetchMyChartIcon,
  parseDirectoryPayload,
  toSeedEntry,
  logoUrlFor,
  MYCHART_DIRECTORY_API_URL,
  MYCHART_MEDIA_BASE,
  type MyChartInstance,
  type MyChartInstanceSeed,
  type MyChartIcon,
} from '../../scrapers/list-all-mycharts/directory';
export {
  searchMyChartDirectory,
  rankDirectoryMatches,
  clearDirectoryCache,
  SANDBOX_INSTANCE,
  DEFAULT_DIRECTORY_SEARCH_LIMIT,
  MAX_DIRECTORY_SEARCH_LIMIT,
  DIRECTORY_CACHE_TTL_MS,
  type MyChartDirectoryMatch,
  type MyChartDirectorySearchResult,
  type MyChartDirectorySearchOptions,
  type MyChartDirectorySource,
} from '../../scrapers/list-all-mycharts/searchDirectory';

// ─── High-level client ───────────────────────────────────────────────────
export {
  MyChartClient,
  type MyChartClientOptions,
  type ConnectArgs,
  type ConnectResult,
  type PendingTwoFa,
} from './client';
