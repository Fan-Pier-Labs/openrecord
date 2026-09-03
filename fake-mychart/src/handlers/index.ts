/**
 * The route registry: every path the fake MyChart surface answers, assembled
 * from one module per capability domain.
 *
 * Modules are named after the scraper folder they stand in for
 * (`scrapers/myChart/chart/<name>`), so a capability's server half is always
 * one file away from its client half. Adding a capability means adding one
 * module and one line in each list below — never editing a shared 1600-line
 * if-chain, which is what used to make every parallel branch conflict.
 *
 * Two ordering rules are load-bearing, both enforced by `resolve`:
 *
 *   1. Exact routes win over pattern routes. `billing/details` and
 *      `billing/details/getvisits` are different endpoints, and the page must
 *      not be swallowed by its children's prefix.
 *   2. GET is split into a public group and a private one, because real
 *      MyChart's session gate sits in the *middle* of the GET surface: login,
 *      terms, the keepalives and the ASP.NET error pages all answer without a
 *      session, and everything else 302s to the login page. POST is split the
 *      same way, but far less evenly: `authentication/` skips both gates, the
 *      anonymous scheduling workflow in `POST_PUBLIC` clears the antiforgery
 *      gate and skips only the session one, and everything else takes both.
 */
import { activityFeedPost } from './activityFeed';
import { allergiesGet, allergiesPost } from './allergies';
import { authGet, authGetPatterns, authPost, authPostPatterns } from './auth';
import { billsGet, billsGetPatterns } from './bills';
import { careJourneysGet, careJourneysPost } from './careJourneys';
import { careTeamGet, careTeamPost } from './careTeam';
import { documentsGet, documentsPost } from './documents';
import { educationMaterialsGet, educationMaterialsPost } from './educationMaterials';
import { ehiExportPost } from './ehiExport';
import { emergencyContactsGet, emergencyContactsPost } from './emergencyContacts';
import { genericGet, genericGetPatterns } from './generic';
import { goalsGet, goalsPost } from './goals';
import { healthIssuesGet, healthIssuesPost } from './healthIssues';
import { healthSummaryPost } from './healthSummary';
import { imagingPostPatterns } from './imaging';
import { immunizationsGet, immunizationsPost } from './immunizations';
import { insuranceGet } from './insurance';
import { labsGet, labsPost } from './labs';
import { lettersGet, lettersPost } from './letters';
import { medicalHistoryGet, medicalHistoryPost } from './medicalHistory';
import { medicationsGet, medicationsPost } from './medications';
import { messagesGet, messagesPost } from './messages';
import { notesPost } from './notes';
import { otherMyChartsPostPatterns } from './otherMyCharts';
import { passkeysPost } from './passkeys';
import { preloginGetPublic, preloginPostPublic } from './prelogin';
import { preventiveCareGet } from './preventiveCare';
import { profileGet, profilePostPatterns } from './profile';
import { questionnairesPost } from './questionnaires';
import { referralsGet, referralsPost } from './referrals';
import { schedulingPost } from './scheduling';
import { secondaryValidationPost } from './secondaryValidation';
import { sessionGet, sessionGetPatterns, sessionGetPublic } from './session';
import { upcomingOrdersPost } from './upcomingOrders';
import { visitsGet, visitsPostPatterns } from './visits';
import { vitalsGet, vitalsPost } from './vitals';
import { mergeExact, type ExactRoutes, type PatternRoute } from './types';

/** GET routes served before the session gate — the login flow and friends. */
export const GET_PUBLIC: ExactRoutes = mergeExact(authGet, sessionGetPublic, preloginGetPublic);
export const GET_PUBLIC_PATTERNS: readonly PatternRoute[] = [...authGetPatterns];

/** GET routes served only to a live session. */
export const GET_PRIVATE: ExactRoutes = mergeExact(
  sessionGet,
  allergiesGet,
  billsGet,
  careJourneysGet,
  careTeamGet,
  documentsGet,
  educationMaterialsGet,
  emergencyContactsGet,
  goalsGet,
  healthIssuesGet,
  immunizationsGet,
  insuranceGet,
  labsGet,
  lettersGet,
  medicalHistoryGet,
  medicationsGet,
  messagesGet,
  preventiveCareGet,
  profileGet,
  referralsGet,
  visitsGet,
  vitalsGet,
  genericGet,
);

export const GET_PRIVATE_PATTERNS: readonly PatternRoute[] = [
  ...sessionGetPatterns,
  ...billsGetPatterns,
  ...genericGetPatterns,
];

/**
 * POST routes served before the session gate, but still behind the antiforgery
 * one. Only the anonymous scheduling workflow lives here: it is the one POST
 * surface a real instance answers for a visitor with no account.
 */
export const POST_PUBLIC: ExactRoutes = mergeExact(preloginPostPublic);

export const POST_ROUTES: ExactRoutes = mergeExact(
  authPost,
  allergiesPost,
  activityFeedPost,
  careJourneysPost,
  careTeamPost,
  documentsPost,
  educationMaterialsPost,
  ehiExportPost,
  emergencyContactsPost,
  goalsPost,
  healthIssuesPost,
  healthSummaryPost,
  immunizationsPost,
  labsPost,
  lettersPost,
  medicalHistoryPost,
  medicationsPost,
  messagesPost,
  notesPost,
  passkeysPost,
  questionnairesPost,
  referralsPost,
  schedulingPost,
  secondaryValidationPost,
  upcomingOrdersPost,
  vitalsPost,
);

export const POST_PATTERNS: readonly PatternRoute[] = [
  ...authPostPatterns,
  ...imagingPostPatterns,
  ...otherMyChartsPostPatterns,
  ...profilePostPatterns,
  ...visitsPostPatterns,
];
