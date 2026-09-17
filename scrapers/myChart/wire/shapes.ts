/**
 * What MyChart answered on the instances we captured, as TypeScript.
 *
 * `fake-mychart/src/data/realShapes.ts` holds a skeleton per endpoint, captured
 * from three real instances with every leaf normalised to a neutral default.
 * That normalisation is what makes it a type source — a leaf recorded as `''`
 * was a string on the instances we captured — and `as const` means TypeScript
 * can read it directly. Nothing is generated: `Widen` turns the literal types
 * back into the types they stand for, so these aliases cannot drift from the
 * captures, because they *are* the captures.
 *
 * It is a type-only import. `verbatimModuleSyntax` erases it, so no client
 * bundles the fake and the published package inlines these into its `.d.ts`.
 *
 * What the captures cannot tell us is preserved rather than papered over:
 *
 * - a leaf that was `null` on every captured instance widens to `unknown`, not
 *   `null`. We saw no value, so we know no type.
 * - an array that was empty everywhere widens to `unknown[]`, not `never[]`.
 *
 * That is 17% of leaves. Reaching into one is a decision, not an accident.
 *
 * These describe three instances out of ~750, across two Epic releases, so they
 * are what we have observed and never a contract Epic owes us. Read a payload
 * with `rec<LoadAllergies>(body)` from `../processors/read.ts`, which checks the
 * field names and leaves every value to `text()` / `num()` / `list()`. An `as`
 * would check the same names and then lie about the values.
 */

import type * as captures from '../../../fake-mychart/src/data/realShapes';
import type { ObservedVisit, ObservedBillingVisit } from './observed';

/**
 * A captured skeleton as the type it records: `''` stands for a string, `0` for
 * a number, and a leaf that was always `null` for something we have never seen.
 */
type Widen<T> =
  T extends readonly (infer E)[] ? ([E] extends [never] ? unknown[] : Widen<E>[])
  : T extends string ? string
  : T extends number ? number
  : T extends boolean ? boolean
  : T extends null ? unknown
  // A skeleton whose only key is "*" is the harness's marker for a map keyed by
  // opaque ids: the one shape describes every value.
  : T extends object ? (keyof T extends '*' ? Record<string, Widen<T[keyof T]>> : { -readonly [K in keyof T]: Widen<T[K]> })
  : T;

/**
 * Replace every occurrence of a key, at any depth, with a shape from
 * `./observed.ts` — for the containers the captures only ever saw as `null`.
 * A visit row repeats across several buckets, so this has to reach all of them.
 */
type Splice<T, M> =
  T extends readonly (infer E)[] ? Splice<E, M>[]
  : T extends object ? { [K in keyof T]: K extends keyof M ? M[K] : Splice<T[K], M> }
  : T;

/** `/api/allergies/loadallergies` */
export type LoadAllergies = Widen<typeof captures.loadAllergies>;

/** `/api/documents/viewer/loadotherdocuments` */
export type LoadOtherDocuments = Widen<typeof captures.loadOtherDocuments>;

/** `/api/documents/viewer/getdocumentdetailslegacy (and getdocumentdetails: same field set)` */
export type GetDocumentDetailsLegacy = Widen<typeof captures.getDocumentDetailsLegacy>;

/** `/api/conversations/getconversationlist` */
export type GetConversationList = Widen<typeof captures.getConversationList>;

/** `come from getconversationdetails or the listing).` */
export type GetConversationMessages = Widen<typeof captures.getConversationMessages>;

/** ``firstUnreadMsgId` instead, so neither is a shape all of them share.` */
export type GetConversationDetails = Widen<typeof captures.getConversationDetails>;

/** `/api/education/getpateducationtitles` */
export type GetPatEducationTitles = Widen<typeof captures.getPatEducationTitles>;

/** `/api/goals/loadcareteamgoals` */
export type LoadCareTeamGoals = Widen<typeof captures.loadCareTeamGoals>;

/** `/api/goals/loadpatientgoals` */
export type LoadPatientGoals = Widen<typeof captures.loadPatientGoals>;

/** `/api/health-summary/fetchh2gheader` */
export type FetchH2GHeader = Widen<typeof captures.fetchH2GHeader>;

/** `/api/health-summary/fetchhealthsummary` */
export type FetchHealthSummary = Widen<typeof captures.fetchHealthSummary>;

/** `/api/healthissues/loadhealthissuesdata` */
export type LoadHealthIssuesData = Widen<typeof captures.loadHealthIssuesData>;

/** `/api/histories/loadhistoriesviewmodel` */
export type LoadHistoriesViewModel = Widen<typeof captures.loadHistoriesViewModel>;

/** `/api/immunizations/loadimmunizations` */
export type LoadImmunizations = Widen<typeof captures.loadImmunizations>;

/** `/api/item-feed/fetchitemfeed` */
export type FetchItemFeed = Widen<typeof captures.fetchItemFeed>;

/** `/api/letters/getletterslist` */
export type GetLettersList = Widen<typeof captures.getLettersList>;

/** `/api/medicaladvicerequests/getmedicaladvicerequestrecipients` */
export type GetMedicalAdviceRequestRecipients = Widen<typeof captures.getMedicalAdviceRequestRecipients>;

/** `/api/medicaladvicerequests/getsubtopics` */
export type GetSubTopics = Widen<typeof captures.getSubTopics>;

/** `/api/medications/loadmedicationspage` */
export type LoadMedicationsPage = Widen<typeof captures.loadMedicationsPage>;

/** `/api/past-results/getmultiplehistoricalresultcomponents` */
export type GetMultipleHistoricalResultComponents = Widen<typeof captures.getMultipleHistoricalResultComponents>;

/** `/api/personalinformation/getrelationships` */
export type GetRelationships = Widen<typeof captures.getRelationships>;

/** `/api/questionnaire/getquestionnairelist` */
export type GetQuestionnaireList = Widen<typeof captures.getQuestionnaireList>;

/** `/api/referrals/listreferrals` */
export type ListReferrals = Widen<typeof captures.listReferrals>;

/** `/api/release-of-information/getehietemplates` */
export type GetEhiETemplates = Widen<typeof captures.getEhiETemplates>;

/** `/api/report-content/loadreportcontent` */
export type LoadReportContent = Widen<typeof captures.loadReportContent>;

/** `/api/test-results/getdetails` */
export type TestResultDetails = Widen<typeof captures.testResultDetails>;

/** `/api/test-results/getlist` */
export type TestResultList = Widen<typeof captures.testResultList>;

/** `/api/track-my-health/getflowsheetreadings` */
export type GetFlowsheetReadings = Widen<typeof captures.getFlowsheetReadings>;

/** `/api/track-my-health/getflowsheets` */
export type GetFlowsheets = Widen<typeof captures.getFlowsheets>;

/** `/api/upcoming-orders/getupcomingorders` */
export type GetUpcomingOrders = Widen<typeof captures.getUpcomingOrders>;

/** `/api/visit-notes/getvisitnotes` */
export type GetVisitNotes = Widen<typeof captures.getVisitNotes>;

/** `/billing/details/getstatementlist` */
export type GetStatementList = Widen<typeof captures.getStatementList>;

/** `/billing/details/getvisits` */
export type BillingGetVisits = Splice<Widen<typeof captures.billingGetVisits>, ObservedBillingVisit>;

/** `/billing/details/loadpaymentlist` */
export type LoadPaymentList = Widen<typeof captures.loadPaymentList>;

/** `/ `SchedulableVisitTypes` are null on both instances.` */
export type CareTeamLoad = Widen<typeof captures.careTeamLoad>;

/** `because their element shape has never been seen.` */
export type GetProviderBioPrivate = Widen<typeof captures.getProviderBioPrivate>;

/** `/community/shared/loadcommunitylinks` */
export type LoadCommunityLinks = Widen<typeof captures.loadCommunityLinks>;

/** `/personalinformation/getcontactinformation` */
export type GetContactInformation = Widen<typeof captures.getContactInformation>;

/** `/proxyswitch` */
export type ProxySwitch = Widen<typeof captures.proxySwitch>;

/** `/visits/visitslist/loadpast` */
export type VisitsLoadPast = Splice<Widen<typeof captures.visitsLoadPast>, ObservedVisit>;

/** `/visits/visitslist/loadupcoming` */
export type VisitsLoadUpcoming = Splice<Widen<typeof captures.visitsLoadUpcoming>, ObservedVisit>;

/** `entirely unless the request asks for it with includeOrganizations=1.` */
export type HelpOrganizations = Widen<typeof captures.helpOrganizations>;

/** `hide the two logo fallbacks every client implements.` */
export type HelpOrganization = Widen<typeof captures.helpOrganization>;

/** `/Scheduling/Anonymous/GetSchedulingWorkflowData` */
export type AnonymousSchedulingWorkflowData = Widen<typeof captures.anonymousSchedulingWorkflowData>;

/** `/Scheduling/Anonymous/GetSpecialtyData` */
export type AnonymousSpecialtyData = Widen<typeof captures.anonymousSpecialtyData>;

/** `/GuestEstimates/SelectServiceArea (inlined $$WP.Estimates.OtherSAs element)` */
export type GuestEstimatesServiceArea = Widen<typeof captures.guestEstimatesServiceArea>;

/** `/GuestEstimates/SelectLocation (inlined var model)` */
export type GuestEstimatesLocationModel = Widen<typeof captures.guestEstimatesLocationModel>;

/** `so they are the same type by construction rather than by observation.` */
export type InsuranceGetCoverages = Widen<typeof captures.insuranceGetCoverages>;

/** `numeric requirement level, so it is recorded as a "*" map.` */
export type InsuranceGetPayors = Widen<typeof captures.insuranceGetPayors>;

/** `a bare string.` */
export type HealthAdvisoriesGetTopics = Widen<typeof captures.healthAdvisoriesGetTopics>;

export type GetBenefitsSummary = Widen<typeof captures.getBenefitsSummary>;
