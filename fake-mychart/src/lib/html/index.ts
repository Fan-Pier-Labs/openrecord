/**
 * Every HTML page the fake serves, grouped the way its own sidebar is.
 *
 * The pages are string templates rather than React components on purpose: this
 * package exists to be byte-faithful to captured Epic HTML, and React's
 * serializer reorders attributes (`<input type= name= value=>` where ASP.NET
 * emits `name=` first), injects `<head>`, and normalizes whitespace. What the
 * templates keep in `.ts` is markup with values interpolated into it; the CSS
 * and the pages' inline JS live as real files under `assets/`.
 */
export {
  loginPage, loginPageControllerJs, doLoginSuccess, doLoginNeed2FA, doLoginFailed,
  get2faMethods, secondaryValidationPage, termsConditionsPage,
  csrfTokenPage, genericTokenPage,
} from './auth';

export {
  PROXY_SELECTOR_PLACEHOLDER, renderProxySelector,
  type ProxySelectorEntry, type ProxySelectorModel,
} from './proxySelector';

export { homePage, messagesPage, visitsPage } from './overview';

export {
  medicationsPage, allergiesPage, healthIssuesPage, immunizationsPage,
  vitalsPage, medicalHistoryPage, testResultsPage,
} from './health';

export {
  careTeamPage, goalsPage, referralsPage, preventiveCarePage, careJourneysPage,
} from './care';

export { lettersPage, documentsPage, educationPage } from './records';

export {
  billingSummaryPage, billingDetailsPage, insurancePage,
  profilePage, emergencyContactsPage, settingsPage,
} from './account';
