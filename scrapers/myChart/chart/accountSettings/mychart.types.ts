// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

/**
 * Raw MyChart responses for the `accountSettings` scraper.
 *
 * Observed on five real instances (November 2026) — what we have seen, never
 * a contract Epic owes us. Read a payload with `rec<T>()` — never `as`.
 *
 * Endpoints: /api/paperless-settings/GetCombinedPaperless,
 * /api/test-results/GetResultsReleasePreferences,
 * /api/security-settings/GetInitialSettings, /api/textoptin/GetConsentData,
 * /api/care-everywhere-opt-out/GetCeConfiguration
 *
 * Keep in step with `realShapes.ts` when the captures are refreshed.
 */

type PaperlessFeature = {
  /** Numeric; decoded in the processor. */
  status?: number;
  allowSignup?: boolean;
  showNoNotifsPopup?: boolean;
  allowCancel?: boolean;
};

/** `/api/paperless-settings/GetCombinedPaperless` */
export type GetCombinedPaperless = {
  billingInfo?: PaperlessFeature & { isLTCEnabled?: boolean; hasAnAuthUser?: boolean };
  eobInfo?: PaperlessFeature;
  invoiceInfo?: PaperlessFeature;
  avsInfo?: PaperlessFeature;
  showContactInfo?: boolean;
  expandID?: string;
};

/** `/api/test-results/GetResultsReleasePreferences` */
export type GetResultsReleasePreferences = {
  options?: Array<{ value?: string; titleUtf8?: string }>;
  /** `""` on all five instances captured: the patient never chose. */
  chosenRRPreference?: string;
};

/** `/api/security-settings/GetInitialSettings` */
export type GetInitialSettings = {
  passwordLastUpdated?: string;
  twoFactorEmailSmsOn?: boolean;
  twoFactorTOTPOn?: boolean;
  twoFactorRequired?: boolean;
  rememberWebDevices?: boolean;
  rememberWebDevicesAllowed?: boolean;
  isUserOptedIntoPreviewFeatures?: boolean;
  arePreviewFeaturesEnabled?: boolean;
  nativeLoginAllowed?: boolean;
  passwordChangeAvailable?: boolean;
  commPrefAvailable?: boolean;
  passkeyLoginAvailable?: boolean;
  systemMethodsList?: number[];
  allowEmailSmsToggle?: boolean;
  allowTotpToggle?: boolean;
  isMyChartCentral?: boolean;
  isUserDoubleActivated?: boolean;
  deactivateAccountAllowed?: boolean;
  hasPersonalInformationSecurity?: boolean;
};

type TextSender = {
  callToAction?: string;
  termsAndConditionsURL?: string;
  privacyPolicyURL?: string;
  shortCode?: string;
  displayName?: string;
  hasRcsSender?: boolean;
};

/**
 * `/api/textoptin/GetConsentData`. Four instances send `secondarySenders`; the
 * fifth, on a different Epic release, sends `additionalSenders` instead.
 */
export type GetConsentData = {
  consentData?: {
    phone?: string;
    /** Keyed by short code. */
    shortCodesConsent?: Record<string, boolean>;
  };
  primarySender?: TextSender;
  secondarySenders?: TextSender[];
  additionalSenders?: TextSender[];
};

/** `/api/care-everywhere-opt-out/GetCeConfiguration` */
export type GetCeConfiguration = {
  dxtId?: number;
  isPatientOptedIn?: boolean;
  doesPatientReqConsent?: boolean;
  authorizationRequirements?: number;
  canSignAllOrgAuthorizations?: boolean;
  hasNonStandardProspectiveAuth?: boolean;
  hasAuthsOnFile?: boolean;
  authNotReqReason?: number;
  authReqReason?: number;
  canAuthOverride?: boolean;
  mcesAccessLevel?: number;
  hideMCESEduVideo?: boolean;
  isThresholdMet?: boolean;
  userLocale?: string;
  canChangeCeStatus?: boolean;
  hasPatientRequiredAuth?: boolean;
  isPayerOnly?: boolean;
  orgLogo?: string;
  orgAuthPreferences?: boolean;
  needsAuthorization?: boolean;
  authorizationMnemonic?: boolean;
  allowToggleDXT234?: boolean;
};
