/**
 * The pre-login scrapers: what a MyChart instance tells anyone about the
 * health system behind it. See `networkProfile.ts` for the one-call entry.
 */

export { fetchHospitalNetworkProfile, INSURANCE_GATE_REASON, type NetworkProfileOptions } from './networkProfile';
export { parseOrgProfile, parseMnemonics, parsePhone, parseEmail, hasOrgProfile } from './orgProfile';
export {
  fetchProviderDirectory,
  fetchSchedulingWorkflow,
  fetchSpecialtyData,
  type ProviderDirectoryOptions,
} from './providerDirectory';
export { resolveSchedulingContext, parseSchedulingWindow, windowDates } from './schedulingContext';
export { fetchOpenSlots, fetchProviderAvailability, type OpenSlotsOptions } from './openSlots';
// `walkSchedulingQuestionnaire` is deliberately not re-exported: the two calls
// above are the surface, and the raw walk is how they are implemented.
export { fetchSchedulingQuestionnaire, submitSchedulingAnswers } from './schedulingQuestionnaire';
export { fetchBillingEntities } from './guestEstimates';
export { PreloginEndpointError } from './preloginSession';
export type * from './types';
